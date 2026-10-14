import {NativeHUD} from './native_hud.js';
import {GameplayNavigation} from './gameplay_navigation.js';
import {PlayerAnimations} from './player_animations.js';
import {PlayerWeapon} from './player_weapon.js';
import {PlayerShots} from './player_shots.js';

// Player animation sandbox: retain enemy code for a later gameplay pass.
const ENABLE_ZOMBIES = false;

const mode = Screen.getMode();
const screenHeight = mode.height *
    (mode.interlace === Screen.INTERLACED && mode.field === Screen.FRAME ? 2 : 1);
mode.height = screenHeight;
mode.zbuffering = true;
mode.psmz = Screen.Z16S;
Screen.setMode(mode);

const camera = new Camera3D.Camera({
    fovYDegrees: 70,
    aspect: mode.width / screenHeight,
    near: 0.1,
    far: 60
}).setViewport(mode.width, screenHeight);
// PL_NO_LIGHTS equivalent in the current renderer; Lights only carries fog.
const lights = new Lights.Set();
const SCENE_DRAW_DISTANCE = 45;
const scene = new Scene3D.Scene();
const sceneManifestText = std.loadFile(
    'PS2Assets/SceneImports/COM2_NORMAL_1/Packed/Chunks/chunks.json'
);
if (!sceneManifestText) throw new Error('Could not load the COM2_NORMAL_1 chunk manifest');
const sceneManifest = JSON.parse(sceneManifestText);
const sceneChunks = sceneManifest.chunks;
const navigationText = std.loadFile(
    'PS2Assets/SceneImports/COM2_NORMAL_1/Navigation/navmesh.json'
);
if (!navigationText) throw new Error('Could not load the COM2_NORMAL_1 navigation mesh');
const navigation = JSON.parse(navigationText);
const navigationVertices = navigation.vertices;
const navigationPolygons = navigation.polygons;
const navigationQuery = new GameplayNavigation(navigation);
const collisionWorld = new Collision3D.World();
const sceneTextures = {};
const sceneCells = {};
const sceneLodGroups = [];
for (const chunk of sceneChunks) {
    let texture = sceneTextures[chunk.texturePath];
    if (!texture) {
        texture = sceneTextures[chunk.texturePath] = Model3D.Texture.load(
            chunk.texturePath,
            Model3D.Texture.LINEAR,
            Model3D.Texture.CLAMP
        );
    }
    const material = {shading: Model3D.UNLIT, texture};
    if (chunk.alphaCutoff !== undefined) material.alphaCutoff = chunk.alphaCutoff;
    const mesh = Model3D.load(chunk.objPath, material);
    const node = new Scene3D.Node(mesh).setPosition(
        chunk.position[0], chunk.position[1], chunk.position[2]
    );
    const key = chunk.cell.join('/');
    let cell = sceneCells[key];
    if (!cell) {
        cell = sceneCells[key] = new Scene3D.Node();
        scene.root.add(cell);
    }
    cell.add(node);
    const bounds = mesh.getBounds();
    const radius = Math.sqrt(
        Math.pow(Math.max(Math.abs(bounds[0]), Math.abs(bounds[3])), 2) +
        Math.pow(Math.max(Math.abs(bounds[1]), Math.abs(bounds[4])), 2) +
        Math.pow(Math.max(Math.abs(bounds[2]), Math.abs(bounds[5])), 2)
    );
    sceneLodGroups.push(new LOD.Group(node, [{
        mesh,
        until: SCENE_DRAW_DISTANCE + radius
    }], {hysteresis: 0.08}));
    mesh.dispose();
}
for (const path in sceneTextures) {
    sceneTextures[path].dispose();
}
collisionWorld.addNode(scene.root);
if (collisionWorld.triangleCount === 0) {
    throw new Error('COM2_NORMAL_1 collision mesh contains no triangles');
}

LOD.setGrid(24, {capacity: 128});
LOD.setCamera(camera);
lights.setFog(
    SCENE_DRAW_DISTANCE * 0.75,
    SCENE_DRAW_DISTANCE,
    0,
    0,
    0
);
scene.attachLoop();

function loadInstance(path) {
    const mesh = Model3D.load(path, {shading: Model3D.UNLIT});
    const instance = mesh.createInstance();
    mesh.dispose();
    return instance;
}

const hud = new NativeHUD([
    {x: 12, y: 10, text: 'COMZ2 PLAYER WEAPON TEST'},
    {x: 12, y: 70, text: 'SCENE ' + sceneChunks.length + ' CHUNKS ' +
        sceneManifest.triangles + ' TRI'},
    {x: 12, y: screenHeight - 58, text: 'LEFT STICK MOVE RIGHT STICK AIM'},
    {x: 12, y: screenHeight - 38, text: 'X OR R1 FIRE SQUARE RELOAD START RESET'}
], 3);

const playerAnimations = new PlayerAnimations();
const weaponConfig = JSON.parse(std.loadFile('AthenaModels/mp5_equipped.json'));
const playerWeapon = new PlayerWeapon(weaponConfig,
    playerAnimations.asset.clips.MP5_UpperBody_Reload01.duration);
playerAnimations.configureWeapon(weaponConfig);
const playerShots = new PlayerShots(playerAnimations, weaponConfig);
const player = {
    x: 0,
    y: 0,
    z: 0,
    navPoly: -1,
    collider: null,
    yaw: 0,
    hp: 100,
    damageCooldown: 0,
    body: null,
    gear: null
};
const zombieMesh = ENABLE_ZOMBIES ? Model3D.load('AthenaModels/zombie.obj', {
    shading: Model3D.UNLIT
}) : null;
const zombies = [];
const zombieBatch = new Render3D.Batch();
let zombieBatchDirty = false;
const gamepad={connected:true,analog:true,leftX:0,leftY:0,rightX:0,rightY:0,fire:false,reload:false,restart:false,
    pressed(b){return (b===Gamepad.CROSS||b===Gamepad.R1)&&this.fire;},
    justPressed(b){return b===Gamepad.SQUARE?this.reload:b===Gamepad.START?this.restart:false;}};
const SURVIVAL_SECONDS = 90;
const MAX_ZOMBIES = 8;
const PLAYER_SPEED = weaponConfig.avatarSpeed - weaponConfig.moveSpeedDrag;
const ZOMBIE_SPEED = 2.8;
const ZOMBIE_SEPARATION_RADIUS = 2.0;
const ZOMBIE_MIN_SPACING = 1.2;
const ZOMBIE_ATTACK_RADIUS = 1.5;
const ZOMBIE_ATTACK_INTERVAL = 1 / 1.6;
const PLAYER_DAMAGE_COOLDOWN = 0.45;
const CAMERA_SWING_SPEED = 2;
const CAMERA_MIN_PITCH = -20 * Math.PI / 180;
const CAMERA_MAX_PITCH = 20 * Math.PI / 180;
const CAMERA_PIVOT_HEIGHT = 1;
const CAMERA_OFFSET = [-1, 0.6, -2.5];
const ACTOR_COLLISION_RADIUS = 0.38;
const ACTOR_COLLISION_HEIGHT = 1.65;
const ACTOR_STEP_HEIGHT = 0.3;
const MAX_NAV_COLLISION_HEIGHT_DELTA = 0.45;
const LEVEL_ONE_SPAWN_GROUPS = [
    {type: 'Zombie_Commis', count: 1, source: 'grave'},
    {type: 'Zombie_Commis', count: 2, source: 'grave'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 1, source: 'grave'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 4, source: 'grave'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 1, source: 'nest'},
    {type: 'Zombie_Commis', count: 5, source: 'grave'},
    {type: 'Zombie_Commis', count: 1, source: 'grave'},
    {type: 'Zombie_Commis', count: 4, source: 'grave'}
];
const cameraScene = new Scene3D.Scene();
const cameraTarget = new Scene3D.Node();
cameraScene.root.add(cameraTarget);
const cameraRig = new CameraRig3D.Follow(camera, cameraTarget)
    .setOffset(CAMERA_OFFSET[0], CAMERA_OFFSET[1], CAMERA_OFFSET[2], true)
    .setLookOffset(CAMERA_OFFSET[0], CAMERA_OFFSET[1], CAMERA_OFFSET[2] + 10);
// Resolve the current camera before LOD (-100) and level Scene3D (0).
cameraScene.attachLoop(-200);
CameraRig3D.attachLoop(-150);
const sceneLodStats = {};
const hudCache = {state: '', second: -1, hp: -1, kills: -1, animation: '', clip: -1, total: -1};
let diagnosticsTimer = 0;
let elapsed = 0;
let spawnTimer = 1;
let spawnGroupIndex = 0;
let spawnGroupCount = 0;
let kills = 0;
let state = 'PLAYING';
let cameraYaw = 0;
let cameraPitch = 0;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function findNavPolygon(x, z, preferred = -1, y = 0) {
    return navigationQuery.locate(x, z, preferred, y);
}

function setNavigationPosition(actor, x, z) {
    const polygonId = findNavPolygon(x, z, actor.navPoly, actor.y);
    if (polygonId < 0) return false;
    actor.x = x;
    actor.z = z;
    actor.navPoly = polygonId;
    actor.y = navigationQuery.height(polygonId, x, z);
    return true;
}

function createActorCollider(actor) {
    const collider = new Collision3D.Character(collisionWorld, {
        radius: ACTOR_COLLISION_RADIUS,
        height: ACTOR_COLLISION_HEIGHT,
        stepHeight: ACTOR_STEP_HEIGHT,
        maxSlope: 50,
        gravity: [0, 0, 0],
        position: [actor.x, actor.y, actor.z]
    });
    collider.move(0, -ACTOR_STEP_HEIGHT, 0);
    actor.y = collider.y;
    actor.collisionX = collider.x;
    actor.collisionY = actor.y;
    actor.collisionZ = collider.z;
    return collider;
}

function moveActorOnNavigation(actor, x, z, dt) {
    const oldX = actor.collisionX;
    const oldY = actor.collisionY;
    const oldZ = actor.collisionZ;
    actor.collider.move(
        x - oldX,
        -Math.max(dt * 0.25, 0.004),
        z - oldZ
    );
    const nextX = actor.collider.x;
    const nextY = actor.collider.y;
    const nextZ = actor.collider.z;
    actor.collisionX = nextX;
    actor.collisionY = nextY;
    actor.collisionZ = nextZ;
    const polygonId = nextX === actor.x && nextZ === actor.z && actor.navPoly >= 0
        ? actor.navPoly : findNavPolygon(nextX, nextZ, actor.navPoly, nextY);
    if (polygonId < 0 ||
        Math.abs(navigationQuery.height(polygonId, nextX, nextZ) - nextY) > MAX_NAV_COLLISION_HEIGHT_DELTA) {
        const oldPoly = findNavPolygon(oldX, oldZ, actor.navPoly, oldY);
        actor.collider.setPosition(oldX, oldY, oldZ)
            .move(0, -0.004, 0);
        actor.x = oldX;
        actor.y = actor.collider.y;
        actor.collisionX = actor.collider.x;
        actor.collisionY = actor.y;
        actor.collisionZ = actor.collider.z;
        actor.z = oldZ;
        actor.navPoly = oldPoly;
        return false;
    }
    actor.x = nextX;
    actor.y = nextY;
    actor.z = nextZ;
    actor.navPoly = polygonId;
    return true;
}

function updateActor(instance, x, y, z, yaw, scale) {
    instance.setRotationEuler(-Math.PI / 2, yaw, 0)
        .setPosition(x, y, z);
}

function spawnZombie(group) {
    if (!ENABLE_ZOMBIES) return false;
    const candidates = [];
    for (let index = 0; index < navigationPolygons.length; index++) {
        const center = navigationPolygons[index].c;
        const dx = center[0] - player.x;
        const dz = center[2] - player.z;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared >= 8 * 8 && distanceSquared <= 14 * 14) {
            candidates.push(index);
        }
    }
    if (candidates.length === 0) return false;
    const navPoly = candidates[Math.floor(Math.random() * candidates.length)];
    const center = navigationPolygons[navPoly].c;
    const instance = zombieMesh.createInstance();
    zombies.push({
        type: group.type,
        source: group.source,
        x: center[0],
        y: center[1],
        z: center[2],
        navPoly,
        separationX: 0,
        separationZ: 0,
        nextX: center[0],
        nextZ: center[2],
        yaw: 0,
        hp: 3,
        attackCooldown: 0,
        instance,
        collider: null
    });
    const zombie = zombies[zombies.length - 1];
    zombie.collider = createActorCollider(zombie);
    zombieBatchDirty = true;
    return true;
}

function clearZombies() {
    zombieBatch.clear();
    zombieBatchDirty = false;
    while (zombies.length) {
        const zombie = zombies.pop();
        zombie.collider.dispose();
        zombie.instance.dispose();
    }
}

function startGame() {
    clearZombies();
    player.x = 0;
    player.y = 0;
    player.z = 0;
    if (!setNavigationPosition(player, 0, 0)) {
        throw new Error('PlayerSpawn is outside the COM2_NORMAL_1 navigation mesh');
    }
    if (player.collider) {
        player.collider.setPosition(player.x, player.y, player.z)
            .move(0, -ACTOR_STEP_HEIGHT, 0);
        player.y = player.collider.y;
        player.collisionX = player.collider.x;
        player.collisionY = player.y;
        player.collisionZ = player.collider.z;
    } else {
        player.collider = createActorCollider(player);
    }
    if (Math.abs(navigationQuery.height(player.navPoly, player.x, player.z) - player.y) > MAX_NAV_COLLISION_HEIGHT_DELTA) {
        throw new Error('PlayerSpawn does not align with the COM2_NORMAL_1 collision mesh');
    }
    player.hp = 100;
    player.damageCooldown = 0;
    elapsed = 0;
    spawnTimer = 1;
    spawnGroupIndex = 0;
    spawnGroupCount = 0;
    kills = 0;
    state = 'PLAYING';
    playerAnimations.reset();
    playerWeapon.reset();
    playerShots.reset();
    hudCache.clip = -1;
    diagnosticsTimer = 0;
}

function updatePlayer(dt) {
    const analog = gamepad.connected && gamepad.analog;
    const aimX = analog ? gamepad.rightX : 0, aimY = analog ? gamepad.rightY : 0;
    cameraYaw += aimX * CAMERA_SWING_SPEED * dt;
    cameraPitch = clamp(
        cameraPitch + aimY * CAMERA_SWING_SPEED * dt,
        CAMERA_MIN_PITCH,
        CAMERA_MAX_PITCH
    );

    let moveX = analog ? gamepad.leftX : 0;
    let moveY = analog ? -gamepad.leftY : 0;
    const weaponEvent = playerWeapon.update(dt,
        gamepad.connected && (gamepad.pressed(Gamepad.CROSS) || gamepad.pressed(Gamepad.R1)),
        gamepad.connected && gamepad.justPressed(Gamepad.SQUARE));
    playerAnimations.syncWeapon(playerWeapon, weaponEvent, moveX, moveY);
    playerShots.update(dt, playerWeapon.equipped !== null);
    if (weaponEvent === 'fire') playerShots.pending = true;
    const inputLength = Math.sqrt(moveX * moveX + moveY * moveY);
    if (inputLength > 0.12) {
        const inputStrength = Math.min(inputLength, 1);
        moveX /= inputLength;
        moveY /= inputLength;
        const cosine = Math.cos(cameraYaw), sine = Math.sin(cameraYaw);
        const rightX = -cosine;
        const rightZ = sine;
        const forwardX = sine;
        const forwardZ = cosine;
        const worldX = rightX * moveX + forwardX * moveY;
        const worldZ = rightZ * moveX + forwardZ * moveY;
        // SimpleCharacterMotor.UpdateSpeedVal interpolates by movement angle.
        const angle = Math.atan2(Math.abs(moveX), moveY) * 180 / Math.PI;
        const directionalSpeed = angle <= 90 ? 1 - 0.2*angle/90 : 0.8 - 0.3*(angle-90)/90;
        const speed = PLAYER_SPEED * directionalSpeed * inputStrength * inputStrength * dt;
        const nextX = player.x + worldX * speed;
        const nextZ = player.z + worldZ * speed;
        if (!moveActorOnNavigation(player, nextX, nextZ, dt)) {
            if (!moveActorOnNavigation(player, nextX, player.z, dt)) {
                moveActorOnNavigation(player, player.x, nextZ, dt);
            }
        }
    } else {
        moveActorOnNavigation(player, player.x, player.z, dt);
    }
    player.yaw = cameraYaw;

    player.damageCooldown = Math.max(0, player.damageCooldown - dt);
}

function updateZombies(dt) {
    if (!ENABLE_ZOMBIES) return;
    navigationQuery.setGoal(player.navPoly);
    for (let i = 0; i < zombies.length; i++) {
        const first = zombies[i];
        first.separationX = 0;
        first.separationZ = 0;
        if (first.hp <= 0) continue;
        for (let j = i + 1; j < zombies.length; j++) {
            const second = zombies[j];
            if (second.hp <= 0) continue;
            let dx = first.x - second.x;
            let dz = first.z - second.z;
            const distanceSquared = dx * dx + dz * dz;
            if (distanceSquared >= ZOMBIE_SEPARATION_RADIUS * ZOMBIE_SEPARATION_RADIUS) continue;
            let distance = Math.sqrt(distanceSquared);
            if (distance < 0.001) {
                const angle = (i + 1) * 2.399963 + j;
                dx = Math.cos(angle);
                dz = Math.sin(angle);
                distance = 0;
            } else {
                dx /= distance;
                dz /= distance;
            }
            const strength = (ZOMBIE_SEPARATION_RADIUS - distance) /
                ZOMBIE_SEPARATION_RADIUS;
            first.separationX += dx * strength;
            first.separationZ += dz * strength;
            second.separationX -= dx * strength;
            second.separationZ -= dz * strength;
        }
    }

    for (let i = zombies.length - 1; i >= 0; i--) {
        const zombie = zombies[i];
        if (zombie.hp <= 0) continue;

        // Spawn, navigation moves and collision rollback already validate navPoly.
        const dx = player.x - zombie.x;
        const dz = player.z - zombie.z;
        const distanceSquared = dx * dx + dz * dz;
        zombie.yaw = Math.atan2(dx, dz);
        zombie.attackCooldown = Math.max(0, zombie.attackCooldown - dt);
        let moveX = zombie.separationX * 2;
        let moveZ = zombie.separationZ * 2;
        let targetX = player.x;
        let targetZ = player.z;
        const nextPolygon = navigationQuery.next[zombie.navPoly];
        if (nextPolygon >= 0 && nextPolygon !== zombie.navPoly) {
            for (const portal of navigationPolygons[zombie.navPoly].n) {
                if (portal[0] !== nextPolygon) continue;
                targetX = portal[1];
                targetZ = portal[2];
                break;
            }
        }
        const routeX = targetX - zombie.x;
        const routeZ = targetZ - zombie.z;
        if (nextPolygon >= 0 &&
            distanceSquared > (ZOMBIE_ATTACK_RADIUS - 0.15) * (ZOMBIE_ATTACK_RADIUS - 0.15)) {
            const routeSquared = routeX * routeX + routeZ * routeZ;
            if (routeSquared > 0.01) {
                const routeDistance = Math.sqrt(routeSquared);
                if (moveX === 0 && moveZ === 0) {
                    // Pure pursuit is already a unit direction: normalize once.
                    const step = ZOMBIE_SPEED * dt / routeDistance;
                    zombie.nextX = zombie.x + routeX * step;
                    zombie.nextZ = zombie.z + routeZ * step;
                    continue;
                }
                moveX += routeX / routeDistance;
                moveZ += routeZ / routeDistance;
            }
        }
        if (moveX === 0 && moveZ === 0) {
            zombie.nextX = zombie.x;
            zombie.nextZ = zombie.z;
            continue;
        }
        const moveLength = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (moveLength > 0.001) {
            const step = ZOMBIE_SPEED * dt / moveLength;
            zombie.nextX = zombie.x + moveX * step;
            zombie.nextZ = zombie.z + moveZ * step;
        } else {
            zombie.nextX = zombie.x;
            zombie.nextZ = zombie.z;
        }
    }

    for (let i = zombies.length - 1; i >= 0; i--) {
        const zombie = zombies[i];
        if (zombie.hp <= 0) {
            zombie.collider.dispose();
            zombies.splice(i, 1);
            zombieBatchDirty = true;
            continue;
        }
        const oldX = zombie.x;
        const oldZ = zombie.z;
        if (!setNavigationPosition(zombie, zombie.nextX, zombie.nextZ)) {
            if (!setNavigationPosition(zombie, zombie.nextX, oldZ)) {
                setNavigationPosition(zombie, oldX, zombie.nextZ);
            }
        }
    }

    for (let pass = 0; pass < 3; pass++) {
        let pushed = false;
        for (let i = 0; i < zombies.length; i++) {
            const first = zombies[i];
            if (first.hp <= 0) continue;
            for (let j = i + 1; j < zombies.length; j++) {
                const second = zombies[j];
                if (second.hp <= 0) continue;
                let dx = second.x - first.x;
                let dz = second.z - first.z;
                const distanceSquared = dx * dx + dz * dz;
                if (distanceSquared >= ZOMBIE_MIN_SPACING * ZOMBIE_MIN_SPACING) continue;
                pushed = true;
                let distance = Math.sqrt(distanceSquared);
                if (distance < 0.001) {
                    const angle = (i + 1) * 2.399963 + j;
                    dx = Math.cos(angle);
                    dz = Math.sin(angle);
                    distance = 0;
                } else {
                    dx /= distance;
                    dz /= distance;
                }
                const push = (ZOMBIE_MIN_SPACING - distance) * 0.5;
                const firstX = first.x, firstZ = first.z;
                const secondX = second.x, secondZ = second.z;
                if (!setNavigationPosition(
                    first, firstX - dx * push, firstZ - dz * push
                )) {
                    first.x = firstX;
                    first.z = firstZ;
                }
                if (!setNavigationPosition(
                    second, secondX + dx * push, secondZ + dz * push
                )) {
                    second.x = secondX;
                    second.z = secondZ;
                }
            }
        }
        // Static positions cannot create a new overlap in a pass with no pushes.
        if (!pushed) break;
    }

    for (let i = 0; i < zombies.length; i++) {
        const zombie = zombies[i];
        if (zombie.hp <= 0) continue;
        moveActorOnNavigation(zombie, zombie.x, zombie.z, dt);
        const dx = player.x - zombie.x;
        const dz = player.z - zombie.z;
        const distanceSquared = dx * dx + dz * dz;
        if (distanceSquared <= ZOMBIE_ATTACK_RADIUS * ZOMBIE_ATTACK_RADIUS &&
            zombie.attackCooldown === 0) {
            if (player.damageCooldown === 0) {
                player.hp = Math.max(0, player.hp - 8);
                player.damageCooldown = PLAYER_DAMAGE_COOLDOWN;
            }
            zombie.attackCooldown = ZOMBIE_ATTACK_INTERVAL;
        }
        updateActor(zombie.instance, zombie.x, zombie.y, zombie.z, zombie.yaw, 1);
    }
}

function updateCamera() {
    // Keep the Scene wrapper reachable: its GC finalizer detaches native updates.
    if (!cameraScene.attached) throw new Error('Camera scene is no longer attached');
    cameraTarget.setPosition(player.x, player.y + CAMERA_PIVOT_HEIGHT, player.z)
        .setRotationEuler(-cameraPitch, cameraYaw, 0);
}

function updateSpawner(dt) {
    if (!ENABLE_ZOMBIES) return;
    spawnTimer -= dt;
    if (spawnTimer > 0) return;
    if (zombies.length >= MAX_ZOMBIES) {
        spawnTimer = 1;
        return;
    }

    const group = LEVEL_ONE_SPAWN_GROUPS[spawnGroupIndex];
    if (!spawnZombie(group)) {
        spawnTimer = 0.5;
        return;
    }
    spawnGroupCount++;
    if (spawnGroupCount < group.count) {
        spawnTimer = 0.3;
        return;
    }

    spawnGroupIndex++;
    spawnGroupCount = 0;
    if (spawnGroupIndex >= LEVEL_ONE_SPAWN_GROUPS.length) {
        spawnGroupIndex = 0;
        spawnTimer = 4.3;
    } else {
        spawnTimer = 1.3;
    }
}

function render() {
    scene.draw(camera, Render3D.CULL_BACK, lights, null);
    if (zombieBatchDirty) {
        zombieBatch.clear();
        for (const zombie of zombies) if (zombie.hp > 0) zombieBatch.add(zombie.instance);
        zombieBatchDirty = false;
    }
    zombieBatch.draw(camera, Render3D.CULL_BACK, lights, null);
    playerAnimations.draw(camera, lights);
    playerShots.draw(camera, lights, mode.width, screenHeight);

    const second = Math.max(0, SURVIVAL_SECONDS - Math.floor(elapsed));
    if (state === 'PLAYING') {
        if (hudCache.state !== state || hudCache.second !== second ||
            hudCache.hp !== player.hp || hudCache.kills !== kills) {
            hud.setLine(0, 12, 30, 'TIME ' + second + ' HP ' + player.hp + ' KILLS ' + kills);
        }
    } else if (hudCache.state !== state) {
        hud.setLine(0, mode.width / 2 - 32, screenHeight / 2 - 8,
            state === 'WON' ? 'MISSION CLEAR' : 'MISSION FAILED');
        hud.setLine(1, mode.width / 2 - 52, screenHeight / 2 + 12, 'PRESS START RESTART');
    }
    const ammo = playerWeapon.ammo;
    const clip = ammo ? ammo.clip : 0, total = ammo ? ammo.total : 0;
    if (hudCache.animation !== playerWeapon.state || hudCache.clip !== clip || hudCache.total !== total) {
        hud.setLine(1, 12, 50, (playerWeapon.equipped || 'NONE') + ' ' + clip + '/' + playerWeapon.reserve + ' ' + playerWeapon.state);
        hudCache.animation = playerWeapon.state;
        hudCache.clip = clip;
        hudCache.total = total;
    }
    hudCache.state = state;
    hudCache.second = second;
    hudCache.hp = player.hp;
    hudCache.kills = kills;
    if (elapsed >= diagnosticsTimer || diagnosticsTimer === 0) {
        LOD.stats(sceneLodStats);
        hud.setLine(2, 12, 90, 'NAV ' + player.navPoly + '/' + navigationPolygons.length +
            ' COL ' + collisionWorld.triangleCount + ' VRAM ' +
            Math.floor(Screen.getFreeVRAM() / 1024) + ' KB HIDDEN ' + sceneLodStats.hidden);
        diagnosticsTimer = elapsed + 0.25;
    }
    // Retain native LOD handles beyond the initial script evaluation.
    if (sceneLodGroups.length !== sceneChunks.length) throw new Error('LOD groups were lost');
    hud.draw();
}

startGame();
playerAnimations.setPose(player.x, player.y, player.z, player.yaw);
updateCamera();
cameraScene.update(null);
cameraRig.update(0);

// Animation (-250), camera (-150) and Scene3D (0) finish before muzzle/ray queries.
Loop.addSystem({name:'playerShots',priority:100,postUpdate() {
    playerShots.resolve(camera,scene,player,mode.width,screenHeight);
}});

const testSocket=playerAnimations.asset.nodes[JSON.parse(std.loadFile('AthenaModels/mike_animated.json')).nodeNames.indexOf('Bip01 Prop1')];
let testFrame=0,start=0,lastShots=0,reloadFrames=0,readyFrames=0,reloadShots=0,reloadTransitions=0,previousWeaponState='IDLE';const shotFrames=[];
function check(v,m){if(!v)throw new Error('PLAYER_VISUALS: '+m);}
Loop.addSystem({name:'player_weapon_test',priority:2200,postDraw(){
    const f=++testFrame;
    check(zombies.length===0&&zombieMesh===null,'zombies disabled');
    check(playerShots.weaponNode.getParent()===testSocket,'weapon parent');
    check(playerWeapon.ammo.total>=playerWeapon.ammo.clip&&playerWeapon.ammo.clip>=0,'ammo invariant');
    if(playerWeapon.state==='RELOAD'){reloadFrames++;if(previousWeaponState!=='RELOAD')reloadTransitions++;}previousWeaponState=playerWeapon.state;
    if(playerWeapon.state==='READY')readyFrames++;
    if(playerWeapon.shots>lastShots){
        shotFrames.push(f);lastShots=playerWeapon.shots;
        check(playerShots.flash.visible,'flash on a shot');
        check(playerShots.tracer.visible,'native tracer on a shot');
    }
    lastShots=playerWeapon.shots;
    if(f===30){start=System.getMilliseconds();check(playerShots.fx.atlas.bpp===8,'indexed effect atlas');}
    if(f===60)gamepad.fire=true;
    if(f===61)check(playerWeapon.state==='READY','fire preparation');
    if(f===72)check(playerWeapon.shots===0,'no shot before preparation completes');
    if(f===150)check(playerShots.fx.sight.stretch>10,'original reticle recoil');
    if(f===180){gamepad.fire=false;check(playerWeapon.shots>10,'held automatic fire');}
    if(f===190){gamepad.reload=true;reloadShots=playerWeapon.shots;}
    if(f===191){gamepad.reload=false;check(playerWeapon.state==='RELOAD','manual reload');check(playerWeapon.ammo.clip===100,'refilled clip');}
    if(f===200)gamepad.fire=true;
    if(f===210){check(playerWeapon.shots===reloadShots&&playerWeapon.state==='RELOAD','trigger blocked while reloading');check(playerAnimations.players.MP5_LowerBody_Reload01.time>0.3,'lower reload advances');}
    if(f===360)console.log('PLAYER_VISUALS_VISUAL');
    if(f===600){gamepad.leftY=-1;gamepad.rightX=0.4;}
    if(f===625){gamepad.leftY=0;gamepad.rightX=0;}
    if(f===1500){
        check(playerWeapon.shots>120,'sustained fire across magazines');
        check(reloadTransitions>=2,'manual and automatic reloads');
        check(playerShots.hitCount>0,'native wall impacts');
        console.log('PLAYER_VISUALS_BEFORE_RESET '+JSON.stringify({shots:playerWeapon.shots,clip:playerWeapon.ammo.clip,total:playerWeapon.ammo.total,hits:playerShots.hitCount}));
        gamepad.fire=false;gamepad.restart=true;
    }
    if(f===1501){gamepad.restart=false;check(playerWeapon.shots===0&&playerWeapon.ammo.total===400&&playerWeapon.state==='IDLE','reset');}
    if(f===1560){
        const frames=1530;console.log('PLAYER_VISUALS_DONE '+JSON.stringify({fps:frames*1000/(System.getMilliseconds()-start),frames,
            shotFrames,reloadFrames,reloadTransitions,readyFrames,freeVRAM:Screen.getFreeVRAM(),uploaded:Screen.getMemoryStats(Screen.VRAM_UPLOADED),
            effectBpp:playerShots.fx.atlas.bpp,effectPalette:playerShots.fx.config.palette,clips:Object.keys(playerAnimations.asset.clips).length,weaponTriangles:weaponConfig.triangles,zombies:zombies.length}));
    }
}});


Loop.run({
    update(dt) {

        if (!ENABLE_ZOMBIES && gamepad.justPressed(Gamepad.START)) startGame();
        if (state !== 'PLAYING') {
            if (gamepad.justPressed(Gamepad.START)) startGame();
            return;
        }

        dt = Math.max(0, Math.min(dt, 0.05));
        elapsed += dt;
        updateSpawner(dt);
        updatePlayer(dt);
        updateZombies(dt);
        playerAnimations.setPose(player.x, player.y, player.z, player.yaw);
        updateCamera();
        if (ENABLE_ZOMBIES && player.hp <= 0) state = 'LOST';
        else if (ENABLE_ZOMBIES && elapsed >= SURVIVAL_SECONDS) state = 'WON';
    },
    draw: render
});
