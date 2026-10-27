import base64
import io
import tempfile
import unittest

from PIL import Image
from bridge import InvalidMail, Processor, prepare


def fixture(article_id='test-001'):
    image = io.BytesIO()
    Image.new('RGB', (900, 383), '#315782').save(image, 'PNG')
    md = f'''---
article_id: "{article_id}"
title: "测试文章"
author: "编辑部"
digest: "自动化测试摘要"
cover: "cover.png"
source_url: ""
---
## 小标题

这是一段 **加粗文字**。

![测试配图](images/figure.png)

| 项目 | 内容 |
| --- | --- |
| 测试 | 成功 |
'''
    return {'sender': 'agent@example.com', 'subject': '[WX-DRAFT] 测试文章', 'attachments': [
        {'name': name, 'base64': base64.b64encode(data).decode()}
        for name, data in [('article.md', md.encode()), ('cover.png', image.getvalue()), ('figure.png', image.getvalue())]
    ]}


class FakeApi:
    def __init__(self):
        self.calls = []
        self.fail_draft = False

    def request(self, endpoint, payload=None, **kwargs):
        self.calls.append((endpoint, payload))
        if endpoint == 'draft/add':
            if self.fail_draft:
                raise TimeoutError('unknown response')
            return {'media_id': 'draft123'}
        if endpoint.startswith('material/'):
            return {'media_id': 'cover123'}
        return {'url': 'https://mmbiz.qpic.cn/image123.jpg'}


class Tests(unittest.TestCase):
    def test_render_upload_and_deduplicate(self):
        with tempfile.TemporaryDirectory() as d:
            api = FakeApi()
            processor = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
            self.assertEqual(processor.process(fixture())['status'], 'created')
            draft = api.calls[-1][1]['articles'][0]
            self.assertEqual(draft['thumb_media_id'], 'cover123')
            self.assertIn('https://mmbiz.qpic.cn/', draft['content'])
            self.assertIn('style=', draft['content'])
            self.assertIn('<strong>', draft['content'])
            self.assertIn('<table', draft['content'])
            self.assertEqual(processor.process(fixture())['status'], 'already_created')
            self.assertEqual(sum(c[0] == 'draft/add' for c in api.calls), 1)

    def test_wrong_sender(self):
        with self.assertRaises(InvalidMail):
            prepare(fixture(), 'someoneelse@example.com')

    def test_missing_image(self):
        f = fixture()
        f['attachments'].pop()
        with self.assertRaises(InvalidMail):
            prepare(f, 'agent@example.com')

    def test_external_image_and_scripts(self):
        f = fixture()
        md = base64.b64decode(f['attachments'][0]['base64']).decode()
        md = md.replace('images/figure.png', 'https://example.com/a.png')
        f['attachments'][0]['base64'] = base64.b64encode(md.encode()).decode()
        with self.assertRaises(InvalidMail):
            prepare(f, 'agent@example.com')
        md = md.replace('https://example.com/a.png', 'images/figure.png') + '\n<script>alert(1)</script>\n<img src="figure.png" onerror="alert(1)">'
        f['attachments'][0]['base64'] = base64.b64encode(md.encode()).decode()
        result = str(prepare(f, 'agent@example.com')['soup'])
        self.assertNotIn('<script', result)
        self.assertNotIn('onerror', result)

    def test_changed_content_same_id(self):
        with tempfile.TemporaryDirectory() as d:
            p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', FakeApi())
            f = fixture()
            p.process(f)
            f['attachments'][0]['base64'] = base64.b64encode(base64.b64decode(f['attachments'][0]['base64']) + b'\nchanged').decode()
            with self.assertRaises(InvalidMail):
                p.process(f)

    def test_unknown_result_is_not_duplicated(self):
        with tempfile.TemporaryDirectory() as d:
            api = FakeApi()
            api.fail_draft = True
            p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
            with self.assertRaises(TimeoutError):
                p.process(fixture())
            with self.assertRaises(InvalidMail):
                p.process(fixture())
            self.assertEqual(sum(c[0] == 'draft/add' for c in api.calls), 1)

    def test_bad_image_and_duplicate_names(self):
        f = fixture()
        f['attachments'][1]['base64'] = base64.b64encode(b'not-image').decode()
        with self.assertRaises(InvalidMail):
            prepare(f, 'agent@example.com')
        f = fixture()
        f['attachments'].append(f['attachments'][1])
        with self.assertRaises(InvalidMail):
            prepare(f, 'agent@example.com')


if __name__ == '__main__':
    unittest.main()
