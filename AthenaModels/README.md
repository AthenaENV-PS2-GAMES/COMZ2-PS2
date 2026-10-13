# AthenaENV model conversion

The OBJ/MTL files in this directory are a converted static-mesh sample from
`Assets/Mesh/`. Recreate the props from the repository root with:

```sh
python3 tools/convert_unity_meshes.py --mesh tree_01.asset --texture churchyard_diffuse_07.png
python3 tools/convert_unity_meshes.py --mesh chair_02.asset --texture churchyard_diffuse_05.png
python3 tools/convert_unity_meshes.py --mesh car_04.asset --texture junkyard_diffuse_05_d.png
python3 tools/convert_unity_meshes.py --mesh floor_01_0.asset --texture junkyard_diffuse_07_d.png
python3 tools/convert_unity_meshes.py --mesh Weapon_AK47.asset --texture Weapon_Ak47.png
```

This folder and `main.js` are a 19-model diagnostic gallery, not the full
offline game asset set. The scene dependency catalogue and batch-converted
models, textures, and audio are documented in [`../PS2Assets/README.md`](../PS2Assets/README.md).

The converter reads UV0 from Unity's channel 3; later channels can contain a
lightmap or skin weights and must not be used as the diffuse UVs. Each Unity
submesh gets an opaque white MTL material with its original diffuse texture.
Textures larger than AthenaENV's 512x512 limit are resized with Pillow, so
Pillow is required when exporting an oversized map. The floor map is reduced
from 1024x1024 to 512x512. Skinned meshes are rejected by the general
converter unless explicitly exported as static reference-pose geometry.

The maps above are resolved from the renderers in the game's scenes and AK-47
prefab: tree/chair use the churchyard atlases, car/floor use the Junkyard
atlases, and the rifle uses its own weapon map. AthenaENV supports one unique
`map_Kd` texture per OBJ and power-of-two textures up to 512x512; all exported
maps stay within those limits.

## Mike character sample

Recreate the static Mike character meshes, using the default `Mike.prefab`
mesh/material references and their diffuse atlases, with:

```sh
python3 tools/export_mike_character.py
```

This writes `mike_body.obj/.mtl` (body, head, and neck) and
`mike_headgear.obj/.mtl`, with their original 256x256 and 128x128 PNG maps.
Both textures use one opaque `map_Kd` per OBJ, which is supported by the
AthenaENV OBJ loader and fits its power-of-two texture-size limit. The loader
can apply a supported UV channel and diffuse PNG, so texturing is viable for
these assets.

The character geometry is exported from the Unity mesh's reference vertices
without skin weights, bind poses, or animation. `main.js` applies the prefab's
shared -90-degree X rotation and displays this as a static pose. Character
animation still requires baking a pose or converting the skeleton and clips.

## More characters and weapons

Export the additional prefabs whose mesh/material references were confirmed in
Unity:

```sh
python3 tools/export_unity_characters.py
python3 tools/convert_unity_meshes.py --static-skinned --mesh Weapon_MP5.asset --texture Weapon_MP5.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Weapon_Rifle_M16.asset --texture Weapon_Rifle_M16.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Weapon_MachineGun_03.asset --texture Weapon_MachineGun_03.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Weapon_Grenade_RPGm.asset --texture Weapon_Grenade_RPG.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Rifle_Gatlin.asset --texture Weapon_Rifle_Gatlin.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh XM1014.asset --texture Weapon_XM1014.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Weapon_ShotGun_03.asset --texture ShotGun_03.png
python3 tools/convert_unity_meshes.py --static-skinned --mesh Electric_saw_Large.asset --texture "Electric saw.png"
```

The gallery includes these models plus static Cowboy, Doctor, SWAT, Normal
Zombie, and Clown Zombie, grouped by their original diffuse atlases. The
Zombie neck meshes are omitted because their renderers use multiple texture
maps, which a single OBJ cannot represent in AthenaENV. Unity aligns
multistream vertex data to 16-byte boundaries; the converter honors this when
decoding UV0 and positions.

## Visualize on PS2

`../main.js` is the AthenaENV gallery for these models, including static Mike. It
loads only the selected model and disposes its instances when switching. Keeping
all models resident exhausted PS2 GS texture VRAM and caused
`Render3D: texture cannot be made resident in VRAM` during navigation. The root
`athena.ini` already selects the gallery as the default script. Boot `athena_nilo.elf`
with this project root available as the AthenaENV boot directory, keeping
`main.js`, `hud.png`, all referenced OBJ/MTL files, and their PNG maps together.

Use left/right on the D-pad or L1/R1 to switch models, the right stick to orbit,
and the left stick vertically to zoom. Cross toggles the slow automatic turn;
Start resets the view. The gallery normalizes and centers each mesh, and
reorients the car, floor plane, and rifle for inspection.

## PCSX2 verification

The gallery was run in PCSX2 Flatpak 2.8.2. All 19 models rendered while
advancing through the gallery; textures appeared on the added characters, and
there were no QuickJS exceptions or VRAM residency errors.
`pcsx2-expanded-navigation.png` is a captured contact sheet from that run.
