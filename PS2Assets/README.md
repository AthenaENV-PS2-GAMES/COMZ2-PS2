# PS2 offline asset conversion

This directory contains converted asset data for the offline PS2 recreation.
The root `game.js` is a playable survival prototype using the imported
`COM2_NORMAL_1` environment; most Unity scene hierarchies, gameplay systems,
UI behavior, skeletal animation and runtime audio-event wiring still need to
be recreated in AthenaENV.

## Inventory and converted content

`../PS2AssetCatalog.json` is the reproducible source inventory. It follows the
dependency closure of the 33 enabled Unity build scenes and includes every
file under `Assets/Resources` as a root for assets loaded by name at runtime.
It currently records 3,545 required assets (about 507.6 MiB) with no unresolved
non-built-in Unity GUIDs. The manifest preserves source paths and GUIDs so each
converted file can be traced back to its Unity source.

- `Models/` contains 1,019 OBJ variants for the 668 unique meshes linked to
  renderers in the catalogued scenes and prefabs. Models with multiple
  materials are exported as separate textured OBJ files; 20 large variants
  are split into OBJ parts to stay below AthenaENV's expanded-corner limit.
  Thirty referenced mesh assets contain no serialized vertex/index buffers
  and are recorded as `skipped_empty`. Another 556 of the 1,224 catalogued
  mesh assets are not directly linked to a `MeshFilter` or
  `SkinnedMeshRenderer`; they remain in the source inventory for collision or
  runtime-loaded uses not represented as renderers.
- `Textures/` contains all 392 catalogued PNG textures. Oversized and
  non-power-of-two images are resampled/padded to power-of-two dimensions no
  larger than 512x512. The texture manifest records source/output dimensions
  and UV scale factors. Transparency is retained; alpha-mask behavior still
  has to be assigned by the game renderer where required.
- `Audio/SFX/` contains 232 WAV clips encoded as AthenaENV SPU2 ADPCM `.adp`
  samples. `Audio/Music/` contains six MP3 clips converted to streamable Ogg
  Vorbis. Looping flags are taken from serialized Unity `AudioSource`
  components where available. The ADPCM files total about 4.55 MB, exceeding
  the SPU2's roughly 2 MiB sample memory, so a game must load effects on
  demand and free/reuse them instead of preloading every clip.

`model-export-manifest.json`, `texture-export-manifest.json`, and
`audio-export-manifest.json` document outputs, source references, format
adjustments and conversion status.

The model directory is a disk-side conversion archive, not a set to load all at
once: AthenaENV OBJ loading expands face corners, and the PS2 has limited EE
RAM and GS texture memory. Load only the current scene's objects and release
them when changing scenes; optimize dense environment meshes further for the
actual runtime budgets.

## Rebuild the converted assets

From the project root:

```sh
python3 tools/catalog_unity_assets.py
python3 tools/export_unity_scene_meshes.py
python3 tools/export_unity_textures.py
python3 tools/export_unity_audio.py --athena-root /path/to/AthenaENV
```

The model exporter preserves material UV scale/offset. For repeat-wrapped
textures it rebases UVs by integer tiles per triangle where needed, which
preserves repeat sampling while satisfying AthenaENV's `[-16, 16]` UV limit.
It also compacts vertex data, drops degenerate triangles and splits oversized
OBJ output.

## Remaining conversion work

The exported character models are static reference-pose geometry; skin weights,
bind poses and the 394 Unity animation clips are not converted to AthenaENV
skeletal animation. OBJ files are individual mesh/material variants and do not
contain their Unity prefab or scene transforms. The source catalogue includes
the scenes, prefabs, materials, configuration, scripts, shaders and audio
event prefabs needed to rebuild those systems, but their runtime behavior must
be reimplemented offline. UI atlases are staged as textures; sprite rectangles,
layout and transitions still need to be reconstructed.

`../main.js` remains the small diagnostic model gallery. The default
`../game.js` loads the packed and spatially partitioned
`SceneImports/COM2_NORMAL_1/` meshes alongside Mike and zombie models from
`AthenaModels/`. It still uses placeholder bounds and combat rules rather than
the complete Unity gameplay systems. See
[`../docs/RECREATION_MAP.md`](../docs/RECREATION_MAP.md) for the system map
and remaining limitations.

Structural checks pass for all 1,039 OBJ parts, all 392 prepared textures and
all 232 ADPCM/6 Ogg outputs. The skill's host-side AthenaENV validator can
smoke-test the color-only OBJ subset, but its host harness rejects `map_Kd`;
the expanded batch archive has not been visually reviewed model-by-model in
PCSX2. The existing 19-model diagnostic gallery was tested separately.
