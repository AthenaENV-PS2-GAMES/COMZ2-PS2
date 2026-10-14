import json
from pathlib import Path
import re
import struct
import tempfile
import unittest

from tools.export_player_weapon import export
from tools.export_unity_player_animations import documents, reference, vector

ROOT = Path(__file__).resolve().parents[1]


class PlayerWeaponExportTests(unittest.TestCase):
    def test_original_prefab_geometry_texture_and_runtime_reset(self):
        with tempfile.TemporaryDirectory() as temp:
            output=Path(temp)/'mp5.glb'
            report=export(ROOT,output)
            blob=output.read_bytes()
            self.assertEqual(struct.unpack_from('<III',blob),(0x46546c67,2,len(blob)))
            length=struct.unpack_from('<I',blob,12)[0]
            gltf=json.loads(blob[20:20+length]);binary=blob[28+length:]
            root=gltf['nodes'][gltf['scenes'][0]['nodes'][0]]
            self.assertEqual(root['rotation'],[0,0,0,1],'WeaponController.Reset discards presentation rotation')
            self.assertEqual(root['translation'],[0,0,0])
            self.assertEqual(report['nodeNames'],[n['name'] for n in gltf['nodes']])
            docs=documents(ROOT/report['sourcePrefab'])
            names={i:re.search(r'^  m_Name: (.*)$',b,re.M)[1] for i,(c,b) in docs.items() if c==1}
            for name in ('fire_ori','bullet_eff_ori'):
                source=next(b for c,b in docs.values() if c==4 and names[reference(b,'m_GameObject')]==name)
                source_pos=vector(source,'m_LocalPosition')
                converted=next(n for n in gltf['nodes'] if n['name']==name)
                self.assertEqual(converted['translation'],[-source_pos[0],*source_pos[1:]])
                self.assertIn(report['nodeNames'].index(name),root['children'])
            image=gltf['bufferViews'][gltf['images'][0]['bufferView']]
            self.assertEqual(binary[image['byteOffset']:image['byteOffset']+image['byteLength']],
                             (ROOT/report['sourceTexture']).read_bytes())
            primitive=gltf['meshes'][0]['primitives'][0]
            self.assertEqual(gltf['materials'][0]['pbrMetallicRoughness']['baseColorFactor'],[0.588,0.588,0.588,1])
            self.assertNotIn('JOINTS_0',primitive['attributes'],'weapon follows the socket as a rigid mesh')
            self.assertEqual(gltf['accessors'][primitive['indices']]['count'],122*3)
            self.assertEqual(report['capacity'],100);self.assertEqual(report['initialTotal'],400)
            self.assertEqual(report['interval'],0.13);self.assertEqual(report['weaponDamage'],1.56)
            self.assertEqual(report['damage'],3.64)
            self.assertAlmostEqual(report['damage'],
                (report['standardDps']*report['damageRatio']+report['avatarDamage'])*report['interval'])


if __name__ == '__main__':
    unittest.main()
