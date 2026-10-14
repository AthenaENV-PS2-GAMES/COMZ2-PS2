# COM2_NORMAL_1 static-batch import

Native module update: `comz.elf` now runs the preview through Scene3D, native
LOD and CameraRig3D, with Font/TileMap HUD and Profiler counters. The chunks
are recentered and their node positions are recorded in `chunks.json`.
Regenerate them with `tools/split_scene_chunks.py --output
PS2Assets/SceneImports/COM2_NORMAL_1/Packed/Chunks --centered`.
The fixed-camera preview remains at 59.94 FPS with a 0.10 ms HUD and 428 KiB
free VRAM, including the new font atlas. See
[the native module measurements](../../../docs/NATIVE_MODULE_OPTIMIZATIONS.md).

Performance update (2026-10-13): the preview now loads the spatial partitions
under `Packed/Chunks/` through native Render3D batches, sharing the same three
atlas textures. The fixed-camera PCSX2 comparison improved from 9.99 to
59.94 FPS with identical free VRAM (493 KiB). See
[the performance audit](../../../docs/SCENE_PERFORMANCE.md) for measurements,
native module availability, regeneration instructions and validation limits.
The 10 FPS capture described below documents the earlier whole-page preview.

This is a first direct extraction of the combined environment mesh in
`Assets/Scene/Scenes/COM2_NORMAL_1.unity`. The packed, spatially partitioned
version is loaded by `game.js`; the original atlas-grouped exports remain
experimental source artifacts.

The scene's 137 renderers point to `Combined Mesh (root scene)_4.asset`.
Each renderer's `m_StaticBatchInfo.firstSubMesh/subMeshCount` selects its
actual slice in that mesh; the renderer's material slots map to the selected
submeshes in order. The exporter now preserves those ranges rather than
exporting every submesh once per material. `manifest.json` records the ranges,
source materials and atlas for each generated OBJ.

The combined mesh's 171 submeshes are grouped into 12 OBJ/MTL files by diffuse
atlas. The source has 7,522 triangles; two degenerate triangles are omitted,
leaving 7,520 exported triangles. Baked scene vertices are translated so
`PlayerSpawn` is approximately `(0, 0, 0)`. Other standalone scene meshes
remain in their mesh-local coordinates.

Regenerate from the project root with:

```sh
python3 tools/export_unity_scene_meshes.py \
  --scene Assets/Scene/Scenes/COM2_NORMAL_1.unity \
  --position-offset 21.06937 -10000.11328125 1.9064159 \
  --manifest PS2Assets/SceneImports/COM2_NORMAL_1/manifest.json \
  --output PS2Assets/SceneImports/COM2_NORMAL_1/Models
```

The combined mesh atlases are also packed into three 256×256 pages under
`Packed/`, with each source atlas assigned a tile and repeat-UV triangles cut
at integer UV boundaries. Each page is quantized to at most 256 RGBA colors,
so AthenaENV can use the GS T8 format (64 KiB per page plus a CLUT) instead of
CT32 (256 KiB per page). The packed meshes contain 9,908 triangles after
splitting; each page stays below AthenaENV's 65,532-corner model limit. The
estimated scene texture residency is about 195 KiB including three CLUTs,
versus approximately 4,416 KiB in the original separate atlases at CT16. The
cobweb atlas is packed into page 1 and alpha is reduced to its 0.1 cutoff mask.
`scene_import_test.js` uses that same cutoff and shares each page texture with
its mesh.

`game.js` loads the chunks and shared atlas textures in the survival prototype.
`scene_import_test.js` remains an optional isolated preview with Mike, a zombie
and the live `Screen.getFreeVRAM()` reading. Temporarily set
`default_script=scene_import_test.js` in `athena.ini` to run it, then restore
`default_script=game.js`. The survival HUD reports the imported chunk and
triangle counts, live free VRAM and LOD-hidden chunks. A rough CT16 pixel
estimate is 688 KiB for all three scene pages, existing player/enemy textures
and HUD; T8 quantization reduces the scene pages further. This excludes
framebuffers, z-buffer, CLUTs, allocation overhead and other engine resources,
so the live free-VRAM reading remains the relevant check.

Runtime checked on PCSX2 2.8.2: the isolated preview rendered all three pages
and sample actors, with 493 KiB of GS VRAM free. The spatially partitioned
survival integration also loaded `game.js`, rendered the imported scene and
actors, and showed 60 FPS in the PCSX2 status bar. These emulator checks do
not establish sustained gameplay performance or real-PS2 compatibility.

The host-native validator does not provide a PNG decoder for `map_Kd`. Its
geometry check passed on temporary copies with `map_Kd` removed and `Kd`
changed from white to a non-white sentinel (the harness requires a colored
vertex); this does not validate texture loading. PCSX2 confirmed texture
loading and residency; hardware compatibility, sustained performance and a
close visual check of the cobweb alpha mask remain unverified.

## Navigation mesh

`Navigation/navmesh.json` is exported from
`Assets/Scene/Scenes/COM2_NORMAL_1/NavMesh.asset` by
`tools/export_unity_navmesh.py` (requires UnityPy). It contains 249 connected
walkable polygons and is recentered using the same `PlayerSpawn` offset as the
scene geometry. `game.js` uses polygon containment and interpolated surface
height to constrain movement, and uses polygon adjacency for zombie routes.
Static contact is resolved separately by AthenaENV's optional `Collision3D`
module, using the imported scene triangles and swept collide-and-slide
characters. The game build includes that module; it is not part of AthenaENV's
default module set. The collision mesh currently reuses all render triangles,
so thin or decorative geometry may create false contacts, and runtime movement
has not yet been visually checked against walls in PCSX2. A collision-enabled
debug ELF registered the module, completed `game.js` evaluation and entered
the event loop without a startup error; this does not verify sustained gameplay
performance or real-PS2 behavior. Regenerate the NavMesh from the project root
with:

```sh
python3 tools/export_unity_navmesh.py
```
