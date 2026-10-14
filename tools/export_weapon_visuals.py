#!/usr/bin/env python3
"""Export the MP5's actual UI/particle references to a PS2 sprite atlas.

Particle images retain their source dimensions. Only the combined effect atlas
is palette-converted to fit VRAM; the reticle is an exact RGBA pixel crop.
"""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image

if __package__:
    from .export_unity_player_animations import documents, reference, vector
else:
    from export_unity_player_animations import documents, reference, vector


def block(text, key, indent):
    lines=text.splitlines(keepends=True)
    start=next((i for i,line in enumerate(lines) if line.rstrip()==' '*indent+key+':'),None)
    if start is None:
        return ''
    end=start+1
    while end<len(lines) and (not lines[end].strip() or len(lines[end])-len(lines[end].lstrip())>indent
                             or lines[end].startswith(' '*indent+'- ')):
        end+=1
    return ''.join(lines[start+1:end])


def number(text,key,default=None):
    m=re.search(r'^\s*'+re.escape(key)+r': ([-\d.eE]+)\s*$',text,re.M)
    if not m:
        if default is None:raise ValueError('Missing '+key)
        return default
    return float(m[1])


def parameter(text,key,indent):
    body=block(text,key,indent)
    if not body:return {'mode':0,'max':1,'min':1,'maxCurve':[],'minCurve':[]}
    result={'mode':int(number(body,'minMaxState')),'max':number(body,'scalar'),'min':number(body,'minScalar')}
    for name in ('maxCurve','minCurve'):
        section=block(body,name,indent+2)
        result[name]=[{k:number(key,k) for k in ('time','value','inSlope','outSlope')}
                     for key in re.findall(r'^\s*- serializedVersion: \d+\n(.*?)(?=^\s*- serializedVersion:|^\s*m_PreInfinity:|\Z)',
                                           block(section,'m_Curve',indent+4),re.M|re.S)]
    return result


def export(root,output):
    output.mkdir(parents=True,exist_ok=True)
    guids={}
    for p in (root/'Assets').rglob('*.meta'):
        m=re.search(r'^guid: (\w+)',p.read_text(),re.M)
        if m:guids[m[1]]=p.with_suffix('')
    sources=set()
    def use(p):sources.add(p);return p.read_text()
    def material(p):
        text=use(p)
        tex=guids[re.search(r'_MainTex:\n\s*m_Texture: .*guid: (\w+)',text)[1]]
        sources.add(tex)
        shader=guids[re.search(r'm_Shader: .*guid: (\w+)',text)[1]]
        shadertext=use(shader)
        return {'texture':str(tex.relative_to(root)),'color':vector(text,'- _Color','rgba'),
                'blend':'add' if 'Blend SrcAlpha One\n' in shadertext else 'alpha',
                'shader':str(shader.relative_to(root)),'colorMultiplier':2}
    wrapper=root/'Assets/Resources/prefabs/weapon/MP5.prefab'
    text=use(wrapper)
    accessories=[guids[g] for g in re.findall(r'guid: (\w+)',text.split('  Accessory:')[1])]
    effects={}
    for name,prefab in [('muzzle',accessories[0]),('impact',accessories[1]),('tracer',root/'Assets/PrefabInstance/FireLine.prefab')]:
        use(prefab);docs=documents(prefab)
        names={i:re.search(r'^  m_Name: (.*)$',b,re.M)[1] for i,(c,b) in docs.items() if c==1}
        transforms={reference(b,'m_GameObject'):b for c,b in docs.values() if c==4}
        renderers={reference(b,'m_GameObject'):b for c,b in docs.values() if c==199}
        layers=[]
        for c,b in docs.values():
            if c!=198:continue
            go=reference(b,'m_GameObject');renderer=renderers[go]
            mat=guids[re.search(r'm_Materials:\n  - .*guid: (\w+)',renderer)[1]]
            initial=block(b,'InitialModule',2)
            layer={'name':names[go],'material':material(mat),'position':vector(transforms[go],'m_LocalPosition'),
                   'lifetime':parameter(initial,'startLifetime',4),'speed':parameter(initial,'startSpeed',4),
                   'size':parameter(initial,'startSize',4),'rotation':parameter(initial,'startRotation',4),
                   'sizeCurve':parameter(block(b,'SizeModule',2),'curve',4),
                   'sizeEnabled':bool(number(block(b,'SizeModule',2),'enabled',0)),
                   'renderMode':int(number(renderer,'m_RenderMode')),'lengthScale':number(renderer,'m_LengthScale'),
                   'moveWithTransform':bool(number(b,'moveWithTransform')),'bursts':[]}
            emission=block(b,'EmissionModule',2)
            bursts=block(emission,'m_Bursts',4)
            # Unity sequences are indented at the field's level, so read them
            # directly until the next two-space module boundary.
            if not bursts:
                m=re.search(r'^    m_Bursts:\n(.*?)(?=^  \w|\Z)',emission,re.M|re.S)
                bursts=m[1] if m else ''
            for burst in re.split(r'^    - serializedVersion:',bursts,flags=re.M)[1:]:
                layer['bursts'].append({'time':number(burst,'time'),'count':int(number(block(burst,'countCurve',6),'scalar'))})
            if name=='tracer' and not layer['bursts']:layer['bursts']=[{'time':0,'count':1}]
            color=block(b,'ColorModule',2)
            gradient=block(block(color,'gradient',4),'maxGradient',6)
            layer['alpha']=[]
            if gradient and number(color,'enabled',0):
                for i in range(int(number(gradient,'m_NumAlphaKeys'))):
                    layer['alpha'].append([number(gradient,'atime'+str(i))/65535,vector(gradient,'key'+str(i),'rgba')[3]])
            if not layer['alpha']:layer['alpha']=[[0,1],[1,1]]
            shape=block(b,'ShapeModule',2)
            layer['coneAngle']=number(shape,'angle',25)
            uv=block(b,'UVModule',2)
            layer['uv']={'enabled':bool(number(uv,'enabled',0)),'columns':int(number(uv,'tilesX',1)),
                         'rows':int(number(uv,'tilesY',1)),'rowAnimation':int(number(uv,'animationType',0))==1,
                         'randomRow':bool(number(uv,'randomRow',0)),'row':int(number(uv,'rowIndex',0)),
                         'cycles':number(uv,'cycles',1),'frame':parameter(uv,'frameOverTime',4)}
            layers.append(layer)
        effects[name]={'source':str(prefab.relative_to(root)),'layers':layers}
        if name=='tracer':
            effects[name]['speed']=number(prefab.read_text(),'speed',300)
            trail=next(b for c,b in docs.values() if c==96)
            mat=guids[re.search(r'm_Materials:\n  - .*guid: (\w+)',trail)[1]]
            effects[name]['trail']={'material':material(mat),'duration':number(trail,'m_Time')}
    # Preserve original pixel dimensions in a single indexed 512x512 page.
    placements={'mp05_01':(0,0,False),'AK47_02':(256,0,False),'hand gun_01':(0,256,False),
                'floor_01':(256,256,False),'xm1014_attack_02':(384,256,False),
                'bullet_01':(256,384,False),'bullet_02':(320,384,False),'floor_05':(256,480,True)}
    atlas=Image.new('RGBA',(512,512))
    rectangles={}
    for effect in effects.values():
        for layer in effect['layers']+([effect['trail']] if 'trail' in effect else []):
            path=root/layer['material']['texture'];name=path.stem
            if name not in rectangles:
                image=Image.open(path).convert('RGBA');x,y,rotated=placements[name]
                original_size=image.size
                if rotated:image=image.transpose(Image.Transpose.ROTATE_90)
                atlas.paste(image,(x,y))
                rectangles[name]={'rect':[x,y,x+image.width,y+image.height],'rotated':rotated,'sourceSize':original_size}
            layer['sprite']=rectangles[name]
    indexed=atlas.quantize(colors=256,method=Image.Quantize.FASTOCTREE,dither=Image.Dither.NONE)
    indexed.save(output/'effects.png')
    ui=root/'Assets/PrefabInstance/SceneBase.prefab';use(ui);docs=documents(ui)
    go=next(i for i,(c,b) in docs.items() if c==1 and 'm_Name: zhunxin-1\n' in b and
            any(c2==114 and reference(b2,'m_GameObject')==i and 'width: 4\n' in b2 for c2,b2 in docs.values()))
    info=next(b for c,b in docs.values() if c==114 and reference(b,'m_GameObject')==go)
    rect=[int(number(info,k)) for k in ('x','y','width','height')]
    ui_mat=root/'Assets/Resources/tui/textures/gameui/GameUI@2x.mat';t=use(ui_mat)
    ui_png=guids[re.search(r'_MainTex:\n\s*m_Texture: .*guid: (\w+)',t)[1]];sources.add(ui_png)
    crop=Image.open(ui_png).convert('RGBA').crop((rect[0],rect[1],rect[0]+rect[2],rect[1]+rect[3]))
    reticle=Image.new('RGBA',(8,32));reticle.paste(crop,(2,2));reticle.save(output/'reticle.png')
    sight=next(b for c,b in docs.values() if c==114 and 'm_unlock_color:' in b)
    weapon_xml=root/'Assets/Resources/config/WeaponCfg.txt';sources.add(weapon_xml)
    weapon=ET.parse(weapon_xml).getroot().find("Weapon[@weapon_name='MP5']")
    for n in ('SightBeadScript','AssaultRifleController','FireLineScript','RifleSparkItem'):
        sources.add(root/'Assets/Scripts/Assembly-CSharp'/f'{n}.cs')
    report={'atlas':str((output/'effects.png').relative_to(root)),
            'palette':{'colors':256,'size':[512,512],'resized':False,'format':'PNG indexed RGBA palette'},
            'reticle':{'asset':str((output/'reticle.png').relative_to(root)),'rect':[2,2,6,18],
                       'source':str(ui_png.relative_to(root)),'sourceRect':rect,'size':[2,8],'baseDistance':10,
                       'color':vector(sight,'m_unlock_color','rgba'),'lockColor':vector(sight,'m_lock_color','rgba'),
                       'recovery':number(sight,'recover_max_speed'),'recoil':float(weapon.get('Recoil')),
                       'idleStretch':float(weapon.get('stretchRange')),'runStretch':float(weapon.get('stretchRangeRun')),
                       'maxStretch':float(weapon.find('stretchMaxRange').get('base'))},
            'effects':effects,'sourceHashes':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(sources)}}
    (output/'visuals.json').write_text(json.dumps(report,indent=2)+'\n')
    return report


if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    report=export(root,root/'AthenaModels/WeaponFX')
    print('Exported original MP5 reticle and',sum(len(e['layers']) for e in report['effects'].values()),'particle layers')
