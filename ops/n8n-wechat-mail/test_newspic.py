import base64
import io
import tempfile
import unittest

from PIL import Image
from bridge import InvalidMail, Processor, prepare
from test_bridge import FakeApi


def fixture(article_id='newspic-test', count=3):
    names = [f'{i:02}.png' for i in range(count)]
    md = '---\narticle_id: "' + article_id + '"\ntitle: "小绿书测试"\nimages:\n'
    md += ''.join('  - "' + n + '"\n' for n in names)
    md += '---\n第一段配文。\n\n第二段配文。\n#测试'
    attachments = [('article.md', md.encode())]
    for i, name in enumerate(names):
        b = io.BytesIO()
        Image.new('RGB', (900, 1200), (20 + i * 8, 80, 160)).save(b, 'PNG')
        attachments.append((name, b.getvalue()))
    return {'sender': 'agent@example.com', 'subject': '[WX-NEWSPIC] 小绿书测试', 'attachments': [
        {'name': n, 'base64': base64.b64encode(b).decode()} for n, b in attachments]}


def edit_md(payload, transform):
    a = payload['attachments'][0]
    a['base64'] = base64.b64encode(transform(base64.b64decode(a['base64']).decode()).encode()).decode()


class OrderedApi(FakeApi):
    def request(self, endpoint, payload=None, **kwargs):
        result = super().request(endpoint, payload, **kwargs)
        if endpoint.startswith('material/'):
            result['media_id'] = 'image-' + str(len(self.calls))
        return result


class Tests(unittest.TestCase):
    def test_type_order_plaintext_and_persistent_dedup(self):
        with tempfile.TemporaryDirectory() as d:
            api = OrderedApi()
            p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
            f = fixture()
            # Attachment order is deliberately different from the declared list.
            f['attachments'][1:] = reversed(f['attachments'][1:])
            self.assertEqual(p.process(f)['status'], 'created')
            draft = api.calls[-1][1]['articles'][0]
            self.assertEqual(draft['article_type'], 'newspic')
            self.assertEqual(draft['image_info']['image_list'], [{'image_media_id': 'image-' + str(i)} for i in (1, 2, 3)])
            self.assertEqual(draft['content'], '第一段配文。\n\n第二段配文。\n#测试')
            self.assertNotIn('thumb_media_id', draft)
            self.assertTrue(all(c[0] != 'media/uploadimg' for c in api.calls))
            p.db.close()
            p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
            self.assertEqual(p.process(f)['status'], 'already_created')
            self.assertEqual(len(api.calls), 4)
            edit_md(f, lambda s: s.replace('  - "00.png"\n  - "01.png"', '  - "01.png"\n  - "00.png"'))
            with self.assertRaises(InvalidMail):
                p.process(f)
            p.db.close()

    def test_image_count_boundaries(self):
        for count in (1, 20):
            self.assertEqual(len(prepare(fixture(count=count), 'agent@example.com')['images']), count)
        for count in (0, 21):
            with self.assertRaises(InvalidMail):
                prepare(fixture(count=count), 'agent@example.com')

    def test_bad_input_never_calls_wechat(self):
        mutations = [
            lambda f: f['attachments'].pop(),
            lambda f: edit_md(f, lambda s: s.replace('"01.png"', '"00.png"')),
            lambda f: edit_md(f, lambda s: s.replace('  - "02.png"\n', '')),
            lambda f: edit_md(f, lambda s: s.replace('"01.png"', '"https://example.com/a.png"')),
            lambda f: edit_md(f, lambda s: s.replace('小绿书测试', '字' * 33)),
            lambda f: edit_md(f, lambda s: s + '\n<script>alert(1)</script>'),
            lambda f: edit_md(f, lambda s: s + '\n![x](00.png)'),
            lambda f: edit_md(f, lambda s: s + '\n' + '字' * 700),
            lambda f: edit_md(f, lambda s: s.replace('  - "00.png"', '  - 123')),
            lambda f: f.update(subject='[WX-DRAFT] 错误类型'),
            lambda f: f.update(sender='other@example.com'),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate), tempfile.TemporaryDirectory() as d:
                api = FakeApi()
                p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
                f = fixture()
                mutate(f)
                with self.assertRaises(InvalidMail):
                    p.process(f)
                self.assertEqual(api.calls, [])
                p.db.close()

    def test_unknown_result_does_not_repeat(self):
        with tempfile.TemporaryDirectory() as d:
            api = FakeApi()
            api.fail_draft = True
            p = Processor({'allowed_sender': 'agent@example.com'}, d + '/db', api)
            with self.assertRaises(TimeoutError):
                p.process(fixture())
            with self.assertRaises(InvalidMail):
                p.process(fixture())
            self.assertEqual(sum(c[0] == 'draft/add' for c in api.calls), 1)
            p.db.close()


if __name__ == '__main__':
    unittest.main()
