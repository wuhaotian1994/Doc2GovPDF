"""Private, authenticated n8n adapter: email attachments -> WeChat drafts only."""
import base64
import hashlib
import hmac
import io
import json
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath

import bleach
import markdown
import yaml
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 25000000
MAX_REQUEST = 32 * 1024 * 1024
STYLE = {
    'p': 'margin:16px 0;line-height:1.85;font-size:16px;color:#333;',
    'h1': 'font-size:24px;font-weight:bold;margin:28px 0 18px;line-height:1.5;',
    'h2': 'font-size:21px;font-weight:bold;margin:26px 0 16px;line-height:1.5;',
    'h3': 'font-size:18px;font-weight:bold;margin:24px 0 14px;line-height:1.5;',
    'blockquote': 'border-left:4px solid #ddd;padding:8px 16px;margin:20px 0;color:#666;background:#f7f7f7;',
    'ul': 'padding-left:24px;line-height:1.85;', 'ol': 'padding-left:24px;line-height:1.85;',
    'li': 'margin:8px 0;line-height:1.85;font-size:16px;',
    'pre': 'background:#f5f5f5;padding:16px;white-space:pre-wrap;word-break:break-all;font-size:13px;line-height:1.6;',
    'code': 'font-family:monospace;background:#f5f5f5;font-size:14px;',
    'table': 'border-collapse:collapse;width:100%;font-size:14px;margin:20px 0;',
    'td': 'border:1px solid #ddd;padding:8px;', 'th': 'border:1px solid #ddd;padding:8px;background:#f5f5f5;',
    'img': 'display:block;max-width:100%;height:auto;margin:20px auto;',
    'hr': 'border:0;border-top:1px solid #ddd;margin:28px 0;',
    'a': 'color:#2464a0;text-decoration:underline;',
}
TAGS = set(STYLE) | {'strong', 'em', 'del', 'br', 'thead', 'tbody', 'tr', 'h4', 'h5', 'h6'}


class InvalidMail(Exception):
    pass


class ApiError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise InvalidMail(message)


def normalize_image(data):
    require(len(data) <= 10 * 1024 * 1024, '单张图片不得超过 10 MB')
    try:
        im = Image.open(io.BytesIO(data))
        require(im.format in ('JPEG', 'PNG'), '图片仅支持 JPG 或 PNG')
        require(not getattr(im, 'is_animated', False), '不支持动画图片')
        im.load()
        im = ImageOps.exif_transpose(im)
        im.thumbnail((1600, 1600))
        if im.mode in ('RGBA', 'LA') or 'transparency' in im.info:
            rgba = im.convert('RGBA')
            canvas = Image.new('RGB', im.size, 'white')
            canvas.paste(rgba, mask=rgba.getchannel('A'))
            im = canvas
        else:
            im = im.convert('RGB')
        for quality in (90, 80, 65, 45):
            out = io.BytesIO()
            im.save(out, 'JPEG', quality=quality, optimize=True)
            if len(out.getvalue()) <= 1024 * 1024:
                return out.getvalue()
        raise InvalidMail('图片压缩后仍超过 1 MB，请缩小后重发')
    except InvalidMail:
        raise
    except Exception:
        raise InvalidMail('图片损坏、尺寸过大或不是有效 JPG/PNG') from None


def prepare(payload, allowed_sender):
    require(payload.get('sender', '').lower() == allowed_sender.lower(), '发件人不在允许名单')
    newspic = payload.get('subject', '').startswith('[WX-NEWSPIC]')
    require(newspic or payload.get('subject', '').startswith('[WX-DRAFT]'), '邮件主题必须以 [WX-DRAFT] 或 [WX-NEWSPIC] 开头')
    attachments = payload.get('attachments', [])
    require(isinstance(attachments, list) and 2 <= len(attachments) <= 22, '需要 article.md 和封面，附件最多 22 个')
    files = {}
    total = 0
    for a in attachments:
        name = a.get('name', '')
        require(isinstance(name, str) and name and len(name) < 180, '附件文件名无效')
        require(name == PurePosixPath(name).name and '\\' not in name, '附件请使用单层文件名，不要打包或携带路径')
        require(name not in files, '附件文件名重复：' + name)
        try:
            data = base64.b64decode(a.get('base64', ''), validate=True)
        except Exception:
            raise InvalidMail('附件编码无效') from None
        total += len(data)
        require(total <= 20 * 1024 * 1024, '附件总大小不得超过 20 MB')
        files[name] = data
    require('article.md' in files, '缺少 article.md 附件')
    require(len(files['article.md']) <= 200000, 'article.md 太大')
    try:
        source = files['article.md'].decode('utf-8-sig').replace('\r\n', '\n')
    except UnicodeError:
        raise InvalidMail('article.md 必须使用 UTF-8 编码') from None
    match = re.match(r'\A---\n(.*?)\n---\n(.*)\Z', source, re.S)
    require(match is not None, 'article.md 开头需要 YAML 元信息，前后各一行 ---')
    try:
        meta = yaml.safe_load(match[1])
    except yaml.YAMLError:
        raise InvalidMail('YAML 元信息格式错误，请将各字段值放在双引号中') from None
    require(isinstance(meta, dict), 'YAML 元信息必须是键值表')
    allowed = {'article_id', 'title', 'images'} if newspic else {'article_id', 'title', 'author', 'digest', 'cover', 'source_url'}
    require(set(meta) <= allowed, '元信息包含未知字段')
    require(all(isinstance(v, str) for k, v in meta.items() if not (newspic and k == 'images')), '元信息文本值必须是字符串，请加双引号')
    article_id = meta.get('article_id', '')
    require(re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,79}', article_id), 'article_id 仅支持字母、数字、点、下划线和短横线，最长 80 字符')
    if newspic:
        require(1 <= len(meta.get('title', '').strip()) <= 32, '小绿书 title 必填，最多 32 字符')
        names = meta.get('images')
        require(isinstance(names, list) and 1 <= len(names) <= 20, 'images 必须是含 1 至 20 张图片的有序列表')
        require(all(isinstance(n, str) and n in files and n != 'article.md' for n in names), 'images 必须逐项对应同封邮件中的图片附件')
        require(len(set(names)) == len(names), 'images 不得重复引用同一附件')
        require(set(files) == {'article.md', *names}, '存在未列入 images 的附件，请删除多余附件或补全列表')
        body = match[2].strip()
        require(0 < len(body) <= 1000 and len(body.encode('utf-8')) <= 2048, '小绿书配文不能为空，最多 1000 字符且 UTF-8 不超过 2048 字节；建议 500 汉字以内')
        require(not re.search(r'<[A-Za-z/!]|!\[|\]\(', body), '小绿书配文请使用纯文本，不要写 HTML 或 Markdown 图片/链接')
        images = {name: normalize_image(files[name]) for name in names}
        digest = hashlib.sha256(b'newspic\0')
        digest.update(json.dumps(meta, sort_keys=True, ensure_ascii=False).encode())
        digest.update(body.encode())
        for name in names:
            digest.update(name.encode())
            digest.update(images[name])
        return {'type': 'newspic', 'meta': meta, 'content': body, 'images': images, 'fingerprint': digest.hexdigest()}
    require(1 <= len(meta.get('title', '').strip()) <= 64, 'title 必填，最多 64 字符')
    require(len(meta.get('author', '')) <= 8, 'author 最多 8 字符')
    require(len(meta.get('digest', '')) <= 120, 'digest 最多 120 字符')
    cover = meta.get('cover', '')
    require(cover in files, '缺少 cover 指定的封面附件')
    url = meta.get('source_url', '')
    require(not url or (urllib.parse.urlsplit(url).scheme in ('https', 'http') and urllib.parse.urlsplit(url).netloc), 'source_url 必须为空或 http/https 地址')
    body = match[2].strip()
    require(bool(body), 'Markdown 正文不能为空')
    # Parse Markdown, then remove all scripts, event attributes and unsafe protocols.
    rendered = markdown.markdown(body, extensions=['extra', 'sane_lists', 'nl2br'])
    clean = bleach.clean(rendered, tags=TAGS, attributes={'a': ['href', 'title'], 'img': ['src', 'alt', 'title']}, protocols=['http', 'https'], strip=True)
    soup = BeautifulSoup(clean, 'html.parser')
    names = set([cover])
    for img in soup.find_all('img'):
        src = urllib.parse.unquote(img.get('src', ''))
        require(not urllib.parse.urlsplit(src).scheme and not src.startswith('/'), '正文图片必须引用同封邮件附件，不能使用网络图片地址')
        name = src[7:] if src.startswith('images/') else src
        require(name in files and '/' not in name and '\\' not in name, '缺少正文配图附件：' + name)
        img['src'] = name
        names.add(name)
    require(len(soup.get_text().strip()) > 0, '正文必须包含文字')
    images = {name: normalize_image(files[name]) for name in names}
    digest = hashlib.sha256()
    digest.update(json.dumps(meta, sort_keys=True, ensure_ascii=False).encode())
    digest.update(body.encode())
    for name in sorted(images):
        digest.update(name.encode())
        digest.update(images[name])
    return {'meta': meta, 'soup': soup, 'images': images, 'fingerprint': digest.hexdigest()}


class WeChat:
    def __init__(self, config):
        self.config = config
        self.token = None
        self.expires = 0

    def access_token(self):
        if self.token and time.time() < self.expires:
            return self.token
        data = self.request('stable_token', {'grant_type': 'client_credential', 'appid': self.config['appid'], 'secret': self.config['secret'], 'force_refresh': False}, token=False)
        self.token = data['access_token']
        self.expires = time.time() + data.get('expires_in', 7200) - 120
        return self.token

    def request(self, endpoint, payload=None, token=True, image=None):
        url = 'https://api.weixin.qq.com/cgi-bin/' + endpoint
        if token:
            url += ('&' if '?' in url else '?') + urllib.parse.urlencode({'access_token': self.access_token()})
        if image is not None:
            boundary = uuid.uuid4().hex
            body = (f'--{boundary}\r\nContent-Disposition: form-data; name="media"; filename="image.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'.encode() + image + f'\r\n--{boundary}--\r\n'.encode())
            content_type = 'multipart/form-data; boundary=' + boundary
        else:
            body = json.dumps(payload or {}, ensure_ascii=False).encode()
            content_type = 'application/json; charset=utf-8'
        request = urllib.request.Request(url, data=body, headers={'Content-Type': content_type})
        try:
            with urllib.request.urlopen(request, timeout=40) as response:
                result = json.load(response)
        except Exception as exc:
            # Never expose a URL carrying access_token in errors.
            raise ApiError('微信接口网络错误：' + type(exc).__name__) from None
        if result.get('errcode', 0):
            raise ApiError('微信接口错误 ' + str(result['errcode']) + '：' + str(result.get('errmsg', ''))[:200])
        return result


class Processor:
    def __init__(self, config, state, api=None):
        self.config = config
        self.api = api or WeChat(config)
        self.lock = threading.Lock()
        self.db = sqlite3.connect(state, check_same_thread=False)
        self.db.execute('CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, fingerprint TEXT, status TEXT, media_id TEXT, updated REAL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS assets (key TEXT PRIMARY KEY, value TEXT)')
        self.db.commit()

    def asset(self, kind, data):
        key = kind + ':' + hashlib.sha256(data).hexdigest()
        row = self.db.execute('SELECT value FROM assets WHERE key=?', (key,)).fetchone()
        if row:
            return row[0]
        result = self.api.request('material/add_material?type=image' if kind == 'cover' else 'media/uploadimg', image=data)
        value = result['media_id' if kind == 'cover' else 'url']
        self.db.execute('INSERT INTO assets VALUES (?,?)', (key, value))
        self.db.commit()
        return value

    def process(self, payload):
        article = prepare(payload, self.config['allowed_sender'])
        meta, fingerprint = article['meta'], article['fingerprint']
        article_id = meta['article_id']
        with self.lock:
            prior = self.db.execute('SELECT fingerprint,status,media_id FROM articles WHERE id=?', (article_id,)).fetchone()
            if prior:
                require(prior[0] == fingerprint, 'article_id 已用于不同内容；修订稿请更换编号，例如加 -v2')
                if prior[1] == 'done':
                    return {'status': 'already_created', 'article_id': article_id, 'media_id': prior[2]}
                require(prior[1] != 'unknown', '上次新增草稿结果不确定，已停止自动重试；请先检查公众号草稿箱，避免重复')
            self.db.execute('INSERT OR REPLACE INTO articles VALUES (?,?,?,?,?)', (article_id, fingerprint, 'uploading', None, time.time()))
            self.db.commit()
            if article.get('type') == 'newspic':
                image_list = [{'image_media_id': self.asset('cover', article['images'][name])} for name in meta['images']]
                image_count = len(image_list)
                draft = {'article_type': 'newspic', 'title': meta['title'], 'content': article['content'], 'image_info': {'image_list': image_list}, 'need_open_comment': 0, 'only_fans_can_comment': 0}
            else:
                cover = self.asset('cover', article['images'][meta['cover']])
                soup = article['soup']
                for img in soup.find_all('img'):
                    img['src'] = self.asset('body', article['images'][img['src']])
                for tag in soup.find_all(True):
                    if tag.name in STYLE:
                        tag['style'] = STYLE[tag.name]
                content = str(soup)
                require(len(content.encode()) <= 200000, '排版后正文过长，请拆分文章')
                image_count = len(soup.find_all('img'))
                draft = {'title': meta['title'], 'author': meta.get('author', ''), 'digest': meta.get('digest', ''), 'content': content, 'content_source_url': meta.get('source_url', ''), 'thumb_media_id': cover, 'need_open_comment': 0, 'only_fans_can_comment': 0}
            # Persist before the non-idempotent API call. Do not retry ambiguous results.
            self.db.execute('UPDATE articles SET status=?,updated=? WHERE id=?', ('unknown', time.time(), article_id))
            self.db.commit()
            result = self.api.request('draft/add', {'articles': [draft]})
            require(bool(result.get('media_id')), '微信没有返回草稿 media_id，需人工核查')
            self.db.execute('UPDATE articles SET status=?,media_id=?,updated=? WHERE id=?', ('done', result['media_id'], time.time(), article_id))
            self.db.commit()
            return {'status': 'created', 'article_id': article_id, 'title': meta['title'], 'media_id': result['media_id'], 'article_type': article.get('type', 'news'), 'body_image_count': image_count}


def serve():
    config = json.load(open(os.environ.get('WECHAT_MAIL_CONFIG', '/etc/n8n-wechat-mail/config.json')))
    processor = Processor(config, os.path.join(os.environ.get('STATE_DIRECTORY', '/var/lib/n8n-wechat-mail'), 'ledger.sqlite'))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def reply(self, status, data):
            body = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.reply(200 if self.path == '/healthz' else 404, {'status': 'ok'} if self.path == '/healthz' else {'error': 'not_found'})

        def do_POST(self):
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + config['bridge_token']):
                return self.reply(401, {'error': 'unauthorized'})
            if self.path != '/draft':
                return self.reply(404, {'error': 'not_found'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                require(0 < length <= MAX_REQUEST, '请求大小无效或超过 32 MB')
                payload = json.loads(self.rfile.read(length))
                result = processor.process(payload)
                print(json.dumps({'event': result['status'], 'article_id': result['article_id']}), flush=True)
                self.reply(200, result)
            except InvalidMail as exc:
                self.reply(422, {'error': str(exc)})
            except ApiError as exc:
                self.reply(502, {'error': str(exc)})
            except Exception as exc:
                print(json.dumps({'event': 'error', 'type': type(exc).__name__}), flush=True)
                self.reply(500, {'error': '处理失败，请检查服务日志；不要在未知结果时重复发送'})

    class Server(ThreadingHTTPServer):
        def get_request(self):
            connection, address = super().get_request()
            connection.settimeout(60)
            return connection, address

    Server((config.get('listen', '172.18.0.1'), 8789), Handler).serve_forever()


if __name__ == '__main__':
    serve()
