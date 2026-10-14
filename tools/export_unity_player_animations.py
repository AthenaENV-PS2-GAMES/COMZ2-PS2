#!/usr/bin/env python3
"""Convert Mike's extracted legacy Unity rig/curves to an Athena-compatible GLB.

Narrow reader for the project's text Unity serialization; no Blender or Unity
installation required. Original vertices, four influences, inverse binds and
Hermite tangents are retained. Unity X is reflected for glTF handedness.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import struct

if __package__:
    from .convert_unity_meshes import decode_attribute, read_channel_block, scalar, stream_layout
else:
    from convert_unity_meshes import decode_attribute, read_channel_block, scalar, stream_layout

CLIPS = [
    'MP5_LowerBody_Idle01', 'Lower_body_Run01', 'Lower_body_Run02',
    'Lower_body_Run03', 'Lower_body_Run04', 'MP5_LowerBody_Shooting01',
    'MP5_UpperBody_Idle01', 'MP5_UpperBody_Run01',
    'MP5_UpperBody_Shooting01', 'MP5_UpperBody_Reload01',
    'MP5_LowerBody_Reload01', 'MP5_UpperBody_FireReady',
]


def documents(path):
    return {int(i): (int(c), body) for c, i, body in re.findall(
        r'^--- !u!(\d+) &(\d+)\n(.*?)(?=^--- !u!|\Z)',
        path.read_text(), re.M | re.S)}


def vector(text, field, components='xyz'):
    match = re.search(rf'^\s*{re.escape(field)}: \{{(.*?)\}}', text, re.M | re.S)
    if not match:
        raise ValueError(f'missing vector {field}')
    values = dict(re.findall(r'(\w+):\s*([^,}]+)', match[1]))
    return [float(values[c]) for c in components]


def reference(text, field):
    return int(re.search(rf'^  {field}: \{{fileID: (\d+)', text, re.M)[1])


def quaternion(value):
    length = math.sqrt(sum(v*v for v in value))
    if length < 1e-12:
        raise ValueError('zero quaternion')
    return [v/length for v in value]


def mirror(value, kind):
    if kind == 'rotation':
        return [value[0], -value[1], -value[2], value[3]]
    if kind in ('translation', 'normal'):
        return [-value[0], value[1], value[2]]
    return list(value)


def parse_curves(path):
    text = path.read_text()
    if scalar(text, 'm_Compressed'):
        raise ValueError(f'{path}: compressed curves are not supported by this converter')
    result = []
    for field, kind, components in [('m_RotationCurves', 'rotation', 'xyzw'),
                                     ('m_PositionCurves', 'translation', 'xyz'),
                                     ('m_ScaleCurves', 'scale', 'xyz')]:
        section = re.search(rf'^  {field}:\s*\n(.*?)(?=^  \w|\Z)', text, re.M | re.S)
        if not section:
            continue
        for body in re.findall(r'^  - curve:\n(.*?)(?=^  - curve:|\Z)', section[1], re.M | re.S):
            target = re.search(r'^    path: (.*)$', body, re.M)[1]
            keys = []
            for key in re.findall(r'^      - serializedVersion: \d+\n(.*?)(?=^      - serializedVersion:|^      m_PreInfinity:|\Z)', body, re.M | re.S):
                time = float(re.search(r'^        time: (.*)$', key, re.M)[1])
                value = mirror(vector(key, 'value', components), kind)
                if kind == 'rotation':
                    value = quaternion(value)
                keys.append((time, value, mirror(vector(key, 'inSlope', components), kind),
                             mirror(vector(key, 'outSlope', components), kind)))
            if not keys or any(not math.isfinite(v) for k in keys for row in k[1:] for v in row):
                raise ValueError(f'{path}: missing/nonfinite curve keys for {target}')
            if any(keys[i][0] >= keys[i+1][0] for i in range(len(keys)-1)):
                raise ValueError(f'{path}: non-increasing times')
            if kind == 'rotation' and any(sum(a*b for a,b in zip(keys[i][1],keys[i+1][1])) < 0
                                          for i in range(len(keys)-1)):
                raise ValueError(f'{path}: antipodal quaternion keys need independent inspection')
            result.append({'path': target, 'kind': kind, 'keys': keys})
    if not result:
        raise ValueError(f'{path}: no transform curves')
    return result


class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.document = {'asset': {'version': '2.0', 'generator': 'COMZ2 legacy Unity animation converter'},
                         'buffers': [], 'bufferViews': [], 'accessors': [], 'nodes': [],
                         'meshes': [], 'skins': [], 'animations': [], 'images': [], 'textures': [],
                         'materials': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9729,
                                                        'wrapS': 33071, 'wrapT': 33071}]}

    def view(self, data):
        while len(self.binary) % 4:
            self.binary.append(0)
        index = len(self.document['bufferViews'])
        self.document['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(data)})
        self.binary.extend(data)
        return index

    def accessor(self, rows, kind, component=5126, bounds=False):
        code = {5126: 'f', 5123: 'H', 5121: 'B'}[component]
        flattened = [v for row in rows for v in row]
        view = self.view(struct.pack('<' + code*len(flattened), *flattened))
        result = {'bufferView': view, 'componentType': component, 'count': len(rows), 'type': kind}
        if bounds:
            result['min'] = [min(r[a] for r in rows) for a in range(len(rows[0]))]
            result['max'] = [max(r[a] for r in rows) for a in range(len(rows[0]))]
        index = len(self.document['accessors'])
        self.document['accessors'].append(result)
        return index

    def save(self, path):
        self.document['buffers'] = [{'byteLength': len(self.binary)}]
        text = json.dumps(self.document, separators=(',', ':'), allow_nan=False).encode()
        text += b' ' * (-len(text) % 4)
        data = bytes(self.binary) + b'\0' * (-len(self.binary) % 4)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(struct.pack('<III', 0x46546c67, 2, 12+8+len(text)+8+len(data)) +
                         struct.pack('<II', len(text), 0x4e4f534a) + text +
                         struct.pack('<II', len(data), 0x004e4942) + data)


def export(root, output):
    prefab = root / 'Assets/PrefabInstance/Mike_1_0.prefab'
    docs = documents(prefab)
    guids = {}
    for path in (root / 'Assets').rglob('*.meta'):
        guid = re.search(r'^guid: (\w+)', path.read_text(), re.M)
        if guid:
            guids[guid[1]] = path.with_suffix('')
    gameobjects = {i: re.search(r'^  m_Name: (.*)$', b, re.M)[1] for i,(c,b) in docs.items() if c == 1}
    transforms = {i: {'name': gameobjects[reference(b, 'm_GameObject')], 'parent': reference(b, 'm_Father'),
                      'go': reference(b, 'm_GameObject'), 'position': vector(b, 'm_LocalPosition'),
                      'rotation': quaternion(vector(b, 'm_LocalRotation', 'xyzw')), 'scale': vector(b, 'm_LocalScale')}
                  for i,(c,b) in docs.items() if c == 4}
    by_go = {t['go']: i for i,t in transforms.items()}
    animation_body = next(b for c,b in docs.values() if c == 111)
    root_id = by_go[reference(animation_body, 'm_GameObject')]
    registered = {guids[g].stem: guids[g] for g in re.findall(r'guid: (\w+)', animation_body)}
    missing = set(CLIPS) - set(registered)
    if missing:
        raise ValueError(f'prefab does not register requested clips: {missing}')

    def path_of(index):
        if index == root_id:
            return ''
        t = transforms[index]
        return '/'.join(p for p in [path_of(t['parent']), t['name']] if p)

    paths = {}
    for i in transforms:
        # Prefab VFX also contain nested transforms; only the player root's tree.
        ancestor = i
        while ancestor and ancestor != root_id:
            ancestor = transforms[ancestor]['parent']
        if ancestor:
            paths[path_of(i)] = i
    parsed = {name: parse_curves(registered[name]) for name in CLIPS}
    # AssaultRifleController.AddMixingTransform(spine), whose prefab reference
    # points at Spine_00, masks out Bip01 root channels in upper-body clips.
    upper_mask = 'Bip01/Spine_00'
    masked = {}
    for name, curves in parsed.items():
        masked[name] = 0
        if 'UpperBody' in name:
            kept = [c for c in curves if c['path'] == upper_mask or c['path'].startswith(upper_mask + '/')]
            masked[name] = len(curves) - len(kept)
            parsed[name] = kept
    # Complete each layer's TRS so a clip switch cannot leave a helper bone in
    # the previous clip's pose. Upper/lower targets in this prefab are disjoint.
    synthesized = {}
    for upper in (False, True):
        names = [n for n in CLIPS if ('UpperBody' in n) == upper]
        targets = set(c['path'] for n in names for c in parsed[n])
        for name in names:
            present = {(c['path'], c['kind']) for c in parsed[name]}
            duration = max(k[0] for c in parsed[name] for k in c['keys'])
            synthesized[name] = 0
            for target in sorted(targets):
                transform = transforms[paths[target]]
                for kind, field in [('translation','position'),('rotation','rotation'),('scale','scale')]:
                    if (target,kind) in present:
                        continue
                    value = mirror(transform[field], kind)
                    zero = [0.0]*len(value)
                    parsed[name].append({'path': target, 'kind': kind,
                        'keys': [(0.0,value,zero,zero),(duration,value,zero,zero)]})
                    synthesized[name] += 1
    renderers = [b for c,b in docs.values() if c == 137]
    used = {root_id}
    for body in renderers:
        used.add(by_go[reference(body, 'm_GameObject')])
        bone_text = re.search(r'^  m_Bones:\n(.*?)(?=^  \w)', body, re.M | re.S)[1]
        used.update(int(i) for i in re.findall(r'fileID: (\d+)', bone_text))
    for curves in parsed.values():
        for curve in curves:
            if curve['path'] not in paths:
                raise ValueError(f"animation target absent in Mike prefab: {curve['path']}")
            used.add(paths[curve['path']])
    for i in list(used):
        while i and i != root_id:
            used.add(i)
            i = transforms[i]['parent']
    ordered = sorted(used)
    indices = {i:n for n,i in enumerate(ordered)}
    glb = GLB()
    nodes = glb.document['nodes']
    for i in ordered:
        t = transforms[i]
        node = {'name': t['name'], 'translation': mirror(t['position'], 'translation'),
                'rotation': mirror(t['rotation'], 'rotation'), 'scale': t['scale']}
        children = [indices[j] for j in ordered if transforms[j]['parent'] == i]
        if children:
            node['children'] = children
        nodes.append(node)
    glb.document['scenes'] = [{'nodes': [indices[root_id]]}]
    glb.document['scene'] = 0
    textures = {}
    report = {'prefab': str(prefab.relative_to(root)), 'registeredClips': len(registered),
              'upperBodyMask': upper_mask,
              'coordinateConversion': 'Unity to glTF: reflect X, reverse triangle winding, UV V=1-V',
              'nodes': len(nodes), 'nodeNames': [n['name'] for n in nodes],
              'meshes': [], 'clips': [], 'sourceHashes': {}}
    report['sourceHashes'][str(prefab.relative_to(root))] = hashlib.sha256(prefab.read_bytes()).hexdigest()
    for body in renderers:
        mesh_guid = re.search(r'^  m_Mesh: .*guid: (\w+)', body, re.M)[1]
        path = guids[mesh_guid]
        text = path.read_text()
        count = scalar(text, 'm_VertexCount')
        channels = read_channel_block(text)
        data = bytes.fromhex(re.search(r'^\s*_typelessdata: ([0-9a-fA-F]+)', text, re.M)[1])
        layout = stream_layout(channels, count, len(data))
        positions = [mirror(p, 'translation') for p in decode_attribute(data, count, channels[0], 3, layout)]
        normals = [mirror(p, 'normal') for p in decode_attribute(data, count, channels[1], 3, layout)]
        uv = [(v[0], 1-v[1]) for v in decode_attribute(data, count, channels[3], 2, layout)]
        skin_section = re.search(r'^  m_Skin:\n(.*?)(?=^  \w)', text, re.M | re.S)[1]
        skins = re.findall(r'^  - weight\[0\]:.*?(?=^  - weight\[0\]:|\Z)', skin_section, re.M | re.S)
        weights = [[float(re.search(rf'weight\[{i}\]: ([^\n]+)', item)[1]) for i in range(4)] for item in skins]
        joints = [[int(re.search(rf'boneIndex\[{i}\]: (\d+)', item)[1]) for i in range(4)] for item in skins]
        if len(weights) != count:
            raise ValueError(f'{path}: skin/vertex count mismatch')
        for w in weights:
            total = sum(w)
            if not math.isfinite(total) or total <= 0 or any(v < 0 for v in w):
                raise ValueError('invalid skin weights')
            for i in range(4):
                w[i] /= total
        bones = [int(i) for i in re.findall(r'fileID: (\d+)',
                 re.search(r'^  m_Bones:\n(.*?)(?=^  \w)', body, re.M | re.S)[1])]
        bind_section = re.search(r'^  m_BindPose:\n(.*?)(?=^  \w)', text, re.M | re.S)[1]
        matrices = []
        for matrix in re.findall(r'^  - e00:.*?(?=^  - e00:|\Z)', bind_section, re.M | re.S):
            # glTF matrix storage is column-major; conjugate by the X reflection.
            m = dict((k,float(v)) for k,v in re.findall(r'(e\d\d): ([^\n]+)', matrix))
            matrices.append([m[f'e{r}{c}'] * (-1 if r == 0 else 1) * (-1 if c == 0 else 1)
                             for c in range(4) for r in range(4)])
        if len(matrices) != len(bones) or len(bones) > 24:
            raise ValueError('bind palette mismatch or palette exceeds VU1 limit')
        if any(j >= len(bones) for row in joints for j in row):
            raise ValueError('skin joint index out of range')
        index_data = bytes.fromhex(re.search(r'^  m_IndexBuffer: ([0-9a-fA-F]+)', text, re.M)[1])
        index_code = 'H' if scalar(text, 'm_IndexFormat') == 0 else 'I'
        source_indices = list(struct.unpack('<'+index_code*(len(index_data)//struct.calcsize(index_code)), index_data))
        if len(source_indices) % 3:
            raise ValueError('non-triangle geometry')
        flipped = [(source_indices[i],source_indices[i+2],source_indices[i+1]) for i in range(0,len(source_indices),3)]
        mat_guid = re.search(r'^  m_Materials:\n  - .*guid: (\w+)', body, re.M)[1]
        mat_text = guids[mat_guid].read_text()
        report['sourceHashes'][str(guids[mat_guid].relative_to(root))] = hashlib.sha256(guids[mat_guid].read_bytes()).hexdigest()
        tex_guid = re.search(r'_MainTex:\n\s*m_Texture: .*guid: (\w+)', mat_text)[1]
        texture_path = guids[tex_guid]
        if tex_guid not in textures:
            image = texture_path.read_bytes()
            if not image.startswith(b'\x89PNG\r\n\x1a\n'):
                raise ValueError('expected an original PNG atlas')
            texture_index = len(glb.document['textures'])
            textures[tex_guid] = texture_index
            glb.document['images'].append({'bufferView': glb.view(image), 'mimeType': 'image/png'})
            glb.document['textures'].append({'source': texture_index, 'sampler': 0})
            glb.document['materials'].append({'name': texture_path.stem, 'alphaMode': 'OPAQUE',
                'pbrMetallicRoughness': {'baseColorTexture': {'index': texture_index},
                                       'baseColorFactor': vector(mat_text, '- _Color', 'rgba'),
                                       'metallicFactor': 0, 'roughnessFactor': 1}})
        mesh_index = len(glb.document['meshes'])
        glb.document['meshes'].append({'name': path.stem, 'primitives': [{
            'attributes': {'POSITION': glb.accessor(positions,'VEC3',bounds=True),
                           'NORMAL': glb.accessor(normals,'VEC3'), 'TEXCOORD_0': glb.accessor(uv,'VEC2'),
                           'JOINTS_0': glb.accessor(joints,'VEC4',5121), 'WEIGHTS_0': glb.accessor(weights,'VEC4')},
            'indices': glb.accessor([(j,) for tri in flipped for j in tri],'SCALAR',5123),
            'material': textures[tex_guid], 'mode': 4}]})
        skin_index = len(glb.document['skins'])
        glb.document['skins'].append({'joints': [indices[i] for i in bones],
                                     'inverseBindMatrices': glb.accessor(matrices,'MAT4')})
        node = nodes[indices[by_go[reference(body, 'm_GameObject')]]]
        node.update(mesh=mesh_index, skin=skin_index)
        report['meshes'].append({'source': str(path.relative_to(root)), 'vertices': count,
                                'triangles': len(flipped), 'joints': len(bones),
                                'maxInfluences': max(sum(w>0 for w in row) for row in weights),
                                'texture': str(texture_path.relative_to(root))})
        report['sourceHashes'][str(path.relative_to(root))] = hashlib.sha256(path.read_bytes()).hexdigest()
        report['sourceHashes'][str(texture_path.relative_to(root))] = hashlib.sha256(texture_path.read_bytes()).hexdigest()
    for name, curves in parsed.items():
        animation = {'name': name, 'samplers': [], 'channels': []}
        for curve in curves:
            keys = curve['keys']
            times = glb.accessor([(k[0],) for k in keys], 'SCALAR', bounds=True)
            rows = [row for _,value,in_slope,out_slope in keys for row in [in_slope,value,out_slope]]
            output_accessor = glb.accessor(rows,'VEC4' if curve['kind']=='rotation' else 'VEC3')
            sampler = len(animation['samplers'])
            animation['samplers'].append({'input': times, 'output': output_accessor, 'interpolation': 'CUBICSPLINE'})
            animation['channels'].append({'sampler': sampler,
                'target': {'node': indices[paths[curve['path']]], 'path': curve['kind']}})
        glb.document['animations'].append(animation)
        report['clips'].append({'name': name, 'source': str(registered[name].relative_to(root)),
                                'tracks': len(curves), 'duration': max(k[0] for c in curves for k in c['keys']),
                                'defaultPoseTracks': synthesized[name],
                                'maskedRootTracks': masked[name],
                                'targets': sorted(set(c['path'] for c in curves))})
        report['sourceHashes'][str(registered[name].relative_to(root))] = hashlib.sha256(registered[name].read_bytes()).hexdigest()
    glb.save(output)
    report['glbBytes'] = output.stat().st_size
    report['glbSha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--output', type=Path, default=Path('AthenaModels/mike_animated.glb'))
    args = parser.parse_args()
    report = export(args.root.resolve(), args.output)
    print(f"{len(report['meshes'])} skinned meshes, {report['nodes']} nodes, "
          f"{len(report['clips'])} clips, {report['glbBytes']} bytes")


if __name__ == '__main__':
    main()
