import json
from pathlib import Path
import tempfile
import unittest
from PIL import Image
from tools.export_weapon_visuals import export

ROOT=Path(__file__).resolve().parents[1]


class WeaponVisualExportTests(unittest.TestCase):
    def test_source_references_exact_reticle_and_full_resolution_indexed_atlas(self):
        # Export paths in the manifest are relative to the real project root.
        # Copy a minimal Assets tree through a symlink into an isolated root.
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);(root/'Assets').symlink_to(ROOT/'Assets',target_is_directory=True)
            out=root/'FX';m=export(root,out)
            with Image.open(out/'effects.png') as atlas:
                self.assertEqual(atlas.mode,'P');self.assertEqual(atlas.size,(512,512))
            self.assertFalse(m['palette']['resized']);self.assertEqual(m['reticle']['sourceRect'],[1017,2,4,16])
            original=Image.open(root/m['reticle']['source']).convert('RGBA').crop((1017,2,1021,18))
            actual=Image.open(out/'reticle.png').crop((2,2,6,18));self.assertEqual(original.tobytes(),actual.tobytes())
            self.assertEqual(len(m['effects']['muzzle']['layers']),3);self.assertEqual(len(m['effects']['impact']['layers']),5)
            for effect in m['effects'].values():
                for layer in effect['layers']:
                    with Image.open(root/layer['material']['texture']) as source:source_size=source.size
                    sprite=layer['sprite'];rect=sprite['rect']
                    self.assertEqual(list(source_size),list(sprite['sourceSize']))
                    expected=source_size[::-1] if sprite['rotated'] else source_size
                    self.assertEqual((rect[2]-rect[0],rect[3]-rect[1]),expected)
                    self.assertTrue(layer['sizeCurve']['maxCurve'])
                    self.assertTrue(layer['alpha']);self.assertIn(layer['material']['blend'],('alpha','add'))
            self.assertEqual(m['effects']['tracer']['speed'],300)
            self.assertEqual(m['effects']['muzzle']['layers'][1]['uv']['rows'],3)
            self.assertEqual(m['reticle']['recoil'],10);self.assertEqual(m['reticle']['recovery'],30)


if __name__=='__main__':unittest.main()
