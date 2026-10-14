import json
from pathlib import Path
import tempfile
import unittest

from tools.pack_scene_atlases import parse_obj
from tools.split_scene_chunks import split_scene


class CenteredChunkTests(unittest.TestCase):
    def test_world_geometry_and_atlas_survive_recentering(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / 'packed'
            source.mkdir()
            obj = source / 'scene_page_01.obj'
            obj.write_text('''v 18 0 -9
v 22 0 -9
v 18 2 -7
v -30 0 -31
v -26 0 -31
v -30 2 -29
vt 0 0
vt 1 0
vt 0 1
vn 0 1 0
f 1/1/1 2/2/1 3/3/1
f 4/1/1 5/2/1 6/3/1
''')
            (source / 'packed-manifest.json').write_text(json.dumps({
                'triangles': 2, 'pages': [{'obj': obj.name, 'page': 'scene_page_01.png'}]
            }))
            original = parse_obj(obj)
            expected = set()
            for _, refs in original[3]:
                expected.add(tuple((*original[0][refs[i]], *original[1][refs[i+1]],
                                    *original[2][refs[i+2]]) for i in (0, 3, 6)))
            result = split_scene(source, root / 'chunks', 8, centered=True)
            actual = set()
            self.assertEqual(len(result['chunks']), 2)
            for record in result['chunks']:
                p, uv, n, faces = parse_obj(Path(record['objPath']))
                center = record['position']
                self.assertNotEqual(center, [0, 0, 0])
                self.assertEqual(record['alphaCutoff'], 0.1)
                self.assertEqual(record['texturePath'], str(source / 'scene_page_01.png'))
                for _, refs in faces:
                    actual.add(tuple((*(p[refs[i]][a] + center[a] for a in range(3)),
                                      *uv[refs[i+1]], *n[refs[i+2]]) for i in (0, 3, 6)))
            self.assertEqual(actual, expected)
            self.assertEqual(result['triangles'], 2)
            self.assertTrue(any(any(c < 0 for c in r['cell']) for r in result['chunks']))

    def test_invalid_cell_sizes_fail_before_reading_assets(self):
        for size in [0, -1, float('nan'), float('inf')]:
            with self.subTest(size=size):
                with self.assertRaises(ValueError):
                    split_scene(Path('missing'), Path('unused'), size, centered=True)


if __name__ == '__main__':
    unittest.main()
