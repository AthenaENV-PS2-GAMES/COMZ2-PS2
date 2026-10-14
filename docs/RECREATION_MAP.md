# Game systems map

This map separates systems confirmed in the extracted Unity project from the
current AthenaENV implementation. The source of truth for mission selection
and gameplay initialization is `Assets/Scripts/Assembly-CSharp/GameSceneController.cs`.

Current focus: `game.js` tests Mike and the equipped MP5, with zombies disabled
and no 90-second mission termination. Mike uses the original skinned GLB and
12 clips, with native upper/lower playback. Fire now consumes ammo and raycasts
against scene triangles. See [PLAYER_MECHANICS.md](PLAYER_MECHANICS.md) for the
original player mechanics map and current limits. The survival/enemy rows
below describe retained, currently inactive behavior; enemy damage from the
new firearm remains pending.

## Confirmed Unity gameplay

| System | Evidence in extracted project | AthenaENV status |
| --- | --- | --- |
| Scene/session startup | `GameSceneController` initializes `GameConfig`/`GameData`, creates the avatar and player, attaches input and camera, then chooses a `MissionController`. | One standalone 90-second survival mode in `game.js`, now loading the packed `COM2_NORMAL_1` scene with native Scene3D/LOD and reporting chunk/VRAM stats in the HUD. |
| Camera and input | `ShooterGameCamera` uses a shoulder offset `(1, 0.6, -2.5)`, a `(0, 1, 0)` pivot, a `(0, 1.8, 0)` aim point, 70° gameplay FOV and ±20° vertical orbit. `PlatformInputController` maps movement through the camera and squares stick magnitude. | Right stick orbits; the player faces camera yaw and pitches the spine/head/weapon with vertical aim; left stick moves camera-relative with squared analog speed. FOV zooms 70°↔50° at 120°/s during fire; sphere cast + two-sided raycast push the camera off walls. Unity smoothing is not ported. |
| Player | `PlayerController` has separate movement and fire states, weapon switching/reload, health, skills, combos, hit/death and rebirth behavior. Mike's prefab motor speed 1.5 is overwritten by AvatarData (7.6), then reduced by weapon drag. | Original Mike/MP5 movement speed 7.1 with sideways/backward scaling, 12 clips, hand socket, finite ammo, ready/fire/reload states and sandbox reset. Original HP/armor/skills/combo remain pending. |
| Enemies | `EnemyController`, `EnemyData`, `EnemyConfig` and `EnemyFactory` implement enemy states, targeting/threat, attacks, health, death and rewards. | One static zombie mesh with chase, contact damage and three-hit health. Pairwise steering and position correction enforce 1.2-unit minimum zombie spacing; a shared player damage cooldown prevents simultaneous contact hits from stacking in one frame. |
| Missions | `GameSceneController.InitMissionController()` selects Cleaner, Time Alive, NPC Resources, NPC Convoy, Boss or Tutorial. `TimeAliveMissionController` lasts 90 seconds and uses configured spawn waves; normal wave interval data is in `Assets/Resources/config/EnemyWaveNormalCfg.txt`. | Time Alive uses the actual level-1 spawn sequence, 0.3-second per-enemy, 1-second per-group and 3-second per-cycle delays, and the game's eight-enemy cap. Grave/nest spawns are approximated by walkable NavMesh polygons 8–14 units from the player. |
| Weapons/combat | `WeaponData` and the weapon-specific controllers define damage, cadence, ammo, range, upgrades and firing states; player auto-lock is in `GameSceneController.DoAutoLock()`. | MP5 finite ammo (100 loaded / 400 total), original cadence/reload and native raycasts; two stationary test dummies validate camera aim, torso/head hitboxes, scene/near-muzzle cover and original 3.64 damage per hit. Zombie spawning/AI remain disabled. Original rifle reticle/recoil/spread and FX textures integrated; global UNLIT rendering. No auto-lock or projectiles. See WEAPON_VISUALS.md. |
| Progression/rewards | `GameData`, `GameConfig`, `AvatarData`, `WeaponData` and mission result handlers hold upgrades, currency, experience and rewards. | Not implemented. |
| UI/lifecycle | Separate controllers provide mission HUD, pause, failure, rebirth, reward and result screens. | Minimal HUD and restart prompt. |
| Levels/content | Build settings include 33 scenes; `PS2AssetCatalog.json` records the scene/prefab/resource dependency closure. | The 9,908-triangle direct scene import is active in gameplay, spatially partitioned into 268 chunks with shared T8 atlas pages. Player and zombie movement is constrained by the 249-polygon NavMesh and uses Collision3D collide-and-slide against the imported static triangles. Dynamic actor-to-actor response is still handled separately by spacing logic. |
| Audio | Extracted SFX are converted to ADPCM and music to Ogg; source audio events and Unity runtime wiring remain separate concerns. | Not implemented. Load sounds on demand after selecting an audio module and budgeting SPU2 memory. |
| Co-op/online | `GameSceneCoopController`, `PlayerCoopController`, coop enemy/weapon controllers and TNet code add networked variants. | Not implemented; first slice is single-player. |

## AthenaENV implementation sequence

1. **Playable combat slice (current):** reuse the extracted Mike and zombie
   OBJ/MTL assets plus the imported scene; implement movement, enemy
   approach/attacks, auto-target fire, health, survival timer and restart with
   `Gamepad`, `Model3D`, `Camera3D`, `Render3D`, `Lights`, `Image` and `Loop`.
2. **Mission data (next):** the normal-wave file contains 28 entries, including
   a level-1 sequence and two level-9999 fallback entries. AthenaENV currently
   runs level 1 only; later levels, enemy-specific stats and visual variants
   have not been imported.
3. **Scene recreation (first pass):** `game.js` loads the direct
   `COM2_NORMAL_1` import. Its 171 static-batch submeshes are exported into 12
   atlas groups, packed to three pages, then spatially partitioned into 268
   chunks with coordinates recentered on `PlayerSpawn`. The combined-mesh
   atlases use three 256×256 T8 pages (9,908 triangles, about 195 KiB with
   CLUTs). The original whole-page preview reached only about 10 FPS; native
   spatial partitioning reached 59.94 FPS on the fixed camera. The survival
   game now uses these chunks and rendered at 60 FPS with actors in PCSX2 2.8.2.
   It shows live VRAM and LOD counts. The Unity NavMesh is exported to a compact
   polygon graph for walkable-surface constraints and zombie routes. AthenaENV's
   optional Collision3D module is enabled for the game build and creates a
   static collision world from the imported scene triangles; player and zombie
   controllers use swept collide-and-slide movement. Host Collision3D tests
   pass. A debug ELF also registered the module, evaluated `game.js`, and
   entered the PCSX2 event loop without a startup error. Movement against
   walls, sustained gameplay performance, and real-PS2 performance still need
   validation.
4. **Combat depth:** add weapon data, projectiles/hit tests, ammo/reload,
   player/enemy damage rules, death/reward drops, and baked or runtime
   animation.
5. **Game flow:** implement avatar selection, progression, mission results,
   pause/settings and saved data.
6. **Audio and cooperative play:** verify AthenaENV module/API coverage before
   wiring sound or networking. These are intentionally outside the current
   prototype.

## Current controls and limits

`game.js` is the default script. Push the left stick up to move forward and
down to move backward relative to the camera; orbit/aim with the right stick,
and hold Cross or R1 to fire at the nearest zombie in range. The elevated
over-the-right-shoulder camera and movement response use the extracted
`ShooterGameCamera` and `PlatformInputController` settings. Survive 90 seconds;
Start restarts after victory or defeat. The original static model gallery
remains available by setting `default_script=main.js` in `athena.ini`.

This is a mechanics prototype, not a faithful level or balance conversion:
grave/nest positions, enemy visual variants, detailed damage rules,
later-level difficulty and HUD are still placeholders. The NavMesh constrains
walkable movement and routes zombies, while Collision3D resolves static
triangle contact with collide-and-slide. Collision geometry is currently
derived from the full render mesh, so thin/decorative geometry may still cause
false contacts; dynamic actor spacing remains a separate approximation. The
converted character meshes are reference poses; Unity skinning and its
394 animation clips have not been ported. The checked AthenaENV checkout
supports the modules used above; no engine change is needed for this slice.
