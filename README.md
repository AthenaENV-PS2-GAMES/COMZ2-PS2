# COMZ2-Offline

Offline AthenaENV recreation work for COMZ2. `PS2Assets/` is the converted
content archive; `AthenaModels/` holds the smaller, already tested prototype
assets.

The default `athena.ini` entry runs `game.js`, currently a player/MP5 test
using the spatially partitioned `COM2_NORMAL_1` Unity scene. Zombies are
disabled. Mike's original rig and 12 clips play through GLTF3D/Animation3D;
the MP5 follows the hand with finite ammo, automatic fire, reload and wall hits.
Boot `comz_navcoll.elf`; see [`docs/PLAYER_MECHANICS.md`](docs/PLAYER_MECHANICS.md)
for the original mechanics map and implementation limits, and
[`docs/PLAYER_ANIMATIONS.md`](docs/PLAYER_ANIMATIONS.md) for animation conversion.
The survival code is retained for a later gameplay pass. The original
static OBJ gallery remains in `main.js`; the generated texture-free arena is
kept as a fallback. See
[`docs/RECREATION_MAP.md`](docs/RECREATION_MAP.md) for the extracted system
map, verified engine support and implementation status.

The world, player and weapons now use UNLIT (the current PL_NO_LIGHTS route).
Original reticle/recoil and weapon FX textures are integrated; see
[`docs/WEAPON_VISUALS.md`](docs/WEAPON_VISUALS.md) for fidelity, VRAM and particle limits.
