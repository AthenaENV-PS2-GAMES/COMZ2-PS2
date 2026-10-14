#!/usr/bin/env python3
"""Resolve the original MP5 prefab and export its rigid mesh and gameplay data."""
import hashlib
import json
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET

if __package__:
    from .export_unity_player_animations import GLB, documents, mirror, quaternion, reference, vector
    from .convert_unity_meshes import decode_attribute, read_channel_block, scalar, stream_layout
else:
    from export_unity_player_animations import GLB, documents, mirror, quaternion, reference, vector
    from convert_unity_meshes import decode_attribute, read_channel_block, scalar, stream_layout


def export(root, output):
    guids = {}
    for meta in (root/'Assets').rglob('*.meta'):
        match = re.search(r'^guid: (\w+)', meta.read_text(), re.M)
        if match:
            guids[match[1]] = meta.with_suffix('')
    wrapper = root/'Assets/Resources/prefabs/weapon/MP5.prefab'
    prefab = guids[re.search(r'Instance: .*guid: (\w+)', wrapper.read_text())[1]]
    docs = documents(prefab)
    names = {i: re.search(r'^  m_Name: (.*)$', b, re.M)[1] for i,(c,b) in docs.items() if c == 1}
    transforms = {i:b for i,(c,b) in docs.items() if c == 4}
    ordered = sorted(transforms)
    indices = {i:n for n,i in enumerate(ordered)}
    glb = GLB()
    root_id = next(i for i,b in transforms.items() if reference(b,'m_Father') == 0)
    for i in ordered:
        body = transforms[i]
        # WeaponController.Reset reparents to Prop1 and resets local rotation;
        # the prefab's standalone -90 degree presentation rotation is discarded.
        rotation = [0,0,0,1] if i == root_id else quaternion(vector(body,'m_LocalRotation','xyzw'))
        glb.document['nodes'].append({
            'name': names[reference(body,'m_GameObject')],
            'translation': mirror(vector(body,'m_LocalPosition'),'translation'),
            'rotation': mirror(rotation,'rotation'), 'scale': vector(body,'m_LocalScale'),
            'children': [indices[j] for j,b in transforms.items() if reference(b,'m_Father') == i]})
    mesh_body = next(b for c,b in docs.values() if c == 33)
    mesh_path = guids[re.search(r'm_Mesh: .*guid: (\w+)', mesh_body)[1]]
    text = mesh_path.read_text()
    count = scalar(text,'m_VertexCount')
    channels = read_channel_block(text)
    raw = bytes.fromhex(re.search(r'_typelessdata: ([0-9a-fA-F]+)',text)[1])
    layout = stream_layout(channels,count,len(raw))
    positions = [mirror(p,'translation') for p in decode_attribute(raw,count,channels[0],3,layout)]
    normals = [mirror(p,'normal') for p in decode_attribute(raw,count,channels[1],3,layout)]
    uv = [(p[0],1-p[1]) for p in decode_attribute(raw,count,channels[3],2,layout)]
    raw_indices = bytes.fromhex(re.search(r'^  m_IndexBuffer: ([0-9a-fA-F]+)',text,re.M)[1])
    code = 'H' if scalar(text,'m_IndexFormat') == 0 else 'I'
    triangles = struct.unpack('<'+code*(len(raw_indices)//struct.calcsize(code)),raw_indices)
    if len(triangles)%3 or max(triangles) >= count:
        raise ValueError('invalid triangle indices')
    renderer = next(b for c,b in docs.values() if c == 23)
    material = guids[re.search(r'm_Materials:\n  - .*guid: (\w+)',renderer)[1]]
    texture = guids[re.search(r'_MainTex:\n\s*m_Texture: .*guid: (\w+)',material.read_text())[1]]
    material_color = vector(material.read_text(), '- _Color', 'rgba')
    image = texture.read_bytes()
    if not image.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('expected original PNG')
    glb.document['images'] = [{'bufferView':glb.view(image),'mimeType':'image/png'}]
    glb.document['textures'] = [{'source':0,'sampler':0}]
    glb.document['materials'] = [{'name':'MP5','pbrMetallicRoughness':{
        'baseColorTexture':{'index':0},'baseColorFactor':material_color,
        'metallicFactor':0,'roughnessFactor':1}}]
    glb.document['meshes'] = [{'name':mesh_path.stem,'primitives':[{
        'attributes':{'POSITION':glb.accessor(positions,'VEC3',bounds=True),
                      'NORMAL':glb.accessor(normals,'VEC3'),'TEXCOORD_0':glb.accessor(uv,'VEC2')},
        'indices':glb.accessor([(triangles[i+j],) for i in range(0,len(triangles),3) for j in (0,2,1)],'SCALAR',5123),
        'material':0,'mode':4}]}]
    mesh_go = reference(mesh_body,'m_GameObject')
    mesh_node = next(indices[i] for i,b in transforms.items() if reference(b,'m_GameObject') == mesh_go)
    glb.document['nodes'][mesh_node]['mesh'] = 0
    glb.document['scenes'] = [{'nodes':[indices[root_id]]}]
    glb.document['scene'] = 0
    glb.save(output)
    weapon_xml = root/'Assets/Resources/config/WeaponCfg.txt'
    avatar_xml = root/'Assets/Resources/config/AvatarCfg.txt'
    standard_xml = root/'Assets/Resources/config/StandardWeaponCfg.txt'
    weapon = ET.parse(weapon_xml).getroot().find("Weapon[@weapon_name='MP5']")
    avatar = ET.parse(avatar_xml).getroot().find("Avatar[@avatar_name='Mike']")
    frequency = float(weapon.find('Frequency').get('base'))
    standard_dps = float(ET.parse(standard_xml).getroot().find('StandardWeaponDps').get('base'))
    damage_ratio = float(weapon.get('dmgRatio'))
    weapon_damage = standard_dps * frequency * damage_ratio
    avatar_damage = float(avatar.find('Damage').get('base'))
    report = {
        'id':'MP5','asset':str(output.relative_to(root)) if output.is_relative_to(root) else output.name,
        'nodeNames':[n['name'] for n in glb.document['nodes']],
        'socket':'Bip01 Prop1','muzzle':'fire_ori','ejection':'bullet_eff_ori',
        'capacity':int(weapon.find('Clip').get('base')),'initialTotal':int(weapon.get('initBullet')),
        'interval':frequency,'readySeconds':0.2,'reloadReleaseFraction':0.85,
        'reloadSpeed':float(avatar.get('reloadRatio')),'afterFireSeconds':float(weapon.get('AfterFireTime')),
        'moveSpeedDrag':float(weapon.get('moveSpeedDrag')),'avatarSpeed':float(avatar.find('Speed').get('base')),
        'standardDps':standard_dps,'damageRatio':damage_ratio,'weaponDamage':weapon_damage,
        'avatarDamage':avatar_damage,
        'damage':weapon_damage+avatar_damage*frequency,
        'maxRayDistance':1000,'vertices':count,'triangles':len(triangles)//3,
        'sourceMesh':str(mesh_path.relative_to(root)),'sourceTexture':str(texture.relative_to(root)),
        'sourcePrefab':str(prefab.relative_to(root)),
        'materialColor':material_color,
        'sourceHashes':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in
                        (wrapper,prefab,mesh_path,material,texture,weapon_xml,avatar_xml,standard_xml,
                         root/'Assets/Scripts/Assembly-CSharp/WeaponController.cs',
                         root/'Assets/Scripts/Assembly-CSharp/WeaponData.cs',
                         root/'Assets/Scripts/Assembly-CSharp/CoMZ2/PlayerReloadState.cs')},
        'glbSha256':hashlib.sha256(output.read_bytes()).hexdigest()}
    output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    print(json.dumps(export(root,root/'AthenaModels/mp5_equipped.glb'),indent=2))
