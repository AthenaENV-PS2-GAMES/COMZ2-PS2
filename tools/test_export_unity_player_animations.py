import hashlib
import json
import math
from pathlib import Path
import re
import struct
import tempfile
import unittest

from tools.export_unity_player_animations import CLIPS, documents, export, reference, vector
from tools.convert_unity_meshes import decode_attribute, read_channel_block, scalar, stream_layout

ROOT = Path(__file__).resolve().parents[1]


def multiply(a, b):
    return [[sum(a[r][k]*b[k][c] for k in range(4)) for c in range(4)] for r in range(4)]


def trs(position, rotation, scale):
    length = math.sqrt(sum(v*v for v in rotation))
    x,y,z,w = [v/length for v in rotation]
    rotation = [[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],
                [2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],
                [2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]
    return [[rotation[r][c]*scale[c] for c in range(3)]+[position[r]] for r in range(3)]+[[0,0,0,1]]


def point(m, p):
    return [sum(m[r][c]*p[c] for c in range(3))+m[r][3] for r in range(3)]


class UnityPlayerAnimationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.output = Path(cls.temp.name)/'mike.glb'
        cls.report = export(ROOT, cls.output)
        blob = cls.output.read_bytes()
        assert struct.unpack_from('<III',blob) == (0x46546c67,2,len(blob))
        length, tag = struct.unpack_from('<II',blob,12)
        assert tag == 0x4e4f534a
        cls.gltf = json.loads(blob[20:20+length])
        binary_length, binary_tag = struct.unpack_from('<II',blob,20+length)
        assert binary_tag == 0x004e4942
        cls.binary = blob[28+length:28+length+binary_length]

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def accessor(self, index):
        a = self.gltf['accessors'][index]
        v = self.gltf['bufferViews'][a['bufferView']]
        count = {'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
        code = {5126:'f',5123:'H',5121:'B'}[a['componentType']]
        values = struct.unpack_from('<'+code*(count*a['count']),self.binary,v.get('byteOffset',0))
        return [values[i:i+count] for i in range(0,len(values),count)]

    def test_original_atlases_are_embedded_byte_identically(self):
        textures = list(dict.fromkeys(p['texture'] for p in self.report['meshes']))
        self.assertEqual(len(textures),2)
        for image, texture in zip(self.gltf['images'],textures):
            v = self.gltf['bufferViews'][image['bufferView']]
            embedded = self.binary[v['byteOffset']:v['byteOffset']+v['byteLength']]
            self.assertEqual(hashlib.sha256(embedded).digest(),hashlib.sha256((ROOT/texture).read_bytes()).digest())

    def test_skinning_matches_independent_unity_bind_pose_evaluation(self):
        docs = documents(ROOT/self.report['prefab'])
        original = {i:b for i,(c,b) in docs.items() if c==4}
        names = {i:re.search(r'^  m_Name: (.*)$',b,re.M)[1] for i,(c,b) in docs.items() if c==1}
        source_world = {}
        def unity_world(i):
            if i not in source_world:
                b=original[i]
                local=trs(vector(b,'m_LocalPosition'),vector(b,'m_LocalRotation','xyzw'),vector(b,'m_LocalScale'))
                parent=reference(b,'m_Father')
                source_world[i]=multiply(unity_world(parent),local) if parent else local
            return source_world[i]
        parents={child:i for i,n in enumerate(self.gltf['nodes']) for child in n.get('children',[])}
        converted_world={}
        def gltf_world(i):
            if i not in converted_world:
                n=self.gltf['nodes'][i]
                local=trs(n.get('translation',[0,0,0]),n.get('rotation',[0,0,0,1]),n.get('scale',[1,1,1]))
                converted_world[i]=multiply(gltf_world(parents[i]),local) if i in parents else local
            return converted_world[i]
        renderers=[b for c,b in docs.values() if c==137]
        for mesh_index,(renderer,part) in enumerate(zip(renderers,self.report['meshes'])):
            text=(ROOT/part['source']).read_text()
            bind_section=re.search(r'^  m_BindPose:\n(.*?)(?=^  \w)',text,re.M|re.S)[1]
            binds=[]
            for block in re.findall(r'^  - e00:.*?(?=^  - e00:|\Z)',bind_section,re.M|re.S):
                values={k:float(v) for k,v in re.findall(r'(e\d\d): ([^\n]+)',block)}
                binds.append([[values[f'e{r}{c}'] for c in range(4)] for r in range(4)])
            bone_section=re.search(r'^  m_Bones:\n(.*?)(?=^  \w)',renderer,re.M|re.S)[1]
            bones=[int(i) for i in re.findall(r'fileID: (\d+)',bone_section)]
            skin=self.gltf['skins'][mesh_index]
            self.assertLessEqual(len(bones),24)
            for source_id,target in zip(bones,skin['joints']):
                self.assertEqual(names[reference(original[source_id],'m_GameObject')],self.gltf['nodes'][target]['name'])
            converted_binds=[[[v[c*4+r] for c in range(4)] for r in range(4)] for v in self.accessor(skin['inverseBindMatrices'])]
            unity_palette=[multiply(unity_world(i),b) for i,b in zip(bones,binds)]
            gltf_palette=[multiply(gltf_world(i),b) for i,b in zip(skin['joints'],converted_binds)]
            primitive=self.gltf['meshes'][mesh_index]['primitives'][0]
            attributes=primitive['attributes']
            positions=self.accessor(attributes['POSITION'])
            joints=self.accessor(attributes['JOINTS_0'])
            weights=self.accessor(attributes['WEIGHTS_0'])
            raw=bytes.fromhex(re.search(r'^\s*_typelessdata: ([0-9a-fA-F]+)',text,re.M)[1])
            count=scalar(text,'m_VertexCount')
            channels=read_channel_block(text)
            layout=stream_layout(channels,count,len(raw))
            source_positions=decode_attribute(raw,count,channels[0],3,layout)
            source_uv=decode_attribute(raw,count,channels[3],2,layout)
            converted_uv=self.accessor(attributes['TEXCOORD_0'])
            for source_p,converted_p,source_t,converted_t in zip(source_positions,positions,source_uv,converted_uv):
                self.assertLess(max(abs(converted_p[i]-source_p[i]*(-1 if i==0 else 1)) for i in range(3)),1e-7)
                self.assertLess(abs(converted_t[0]-source_t[0]),1e-7)
                self.assertLess(abs(converted_t[1]-(1-source_t[1])),1e-7)
            self.assertEqual(len(positions),part['vertices'])
            self.assertEqual(len(self.accessor(primitive['indices']))//3,part['triangles'])
            for p,js,ws in zip(positions,joints,weights):
                self.assertAlmostEqual(sum(ws),1,places=6)
                self.assertTrue(all(0<=j<len(bones) for j in js))
                source=[-p[0],p[1],p[2]]
                a=[0,0,0];b=[0,0,0]
                for j,w in zip(js,ws):
                    pa=point(unity_palette[j],source);pb=point(gltf_palette[j],p)
                    for axis in range(3):a[axis]+=pa[axis]*w;b[axis]+=pb[axis]*w
                self.assertLess(max(abs(b[i]-a[i]*(-1 if i==0 else 1)) for i in range(3)),1e-5)

    def test_curves_are_cubic_complete_and_layers_have_disjoint_targets(self):
        self.assertEqual({a['name'] for a in self.gltf['animations']},set(CLIPS))
        lower=set();upper=set()
        for animation in self.gltf['animations']:
            targets={c['target']['node'] for c in animation['channels']}
            (upper if 'UpperBody' in animation['name'] else lower).update(targets)
            for target in targets:
                self.assertEqual({c['target']['path'] for c in animation['channels'] if c['target']['node']==target},
                                 {'translation','rotation','scale'})
            for sampler in animation['samplers']:
                self.assertEqual(sampler['interpolation'],'CUBICSPLINE')
                times=[r[0] for r in self.accessor(sampler['input'])]
                self.assertTrue(all(a<b for a,b in zip(times,times[1:])))
                values=self.accessor(sampler['output'])
                self.assertEqual(len(values),len(times)*3)
                self.assertTrue(all(math.isfinite(v) for row in values for v in row))
        self.assertFalse(lower & upper,'upper/lower players would overwrite the same bones')


if __name__=='__main__':
    unittest.main()
