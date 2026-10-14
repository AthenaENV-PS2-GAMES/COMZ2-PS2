import {NativeHUD} from './native_hud.js';

const PROFILE = {
    scene: true, actors: true, hud: true, lod: true,
    freezeCamera: false, drawDistance: 45, verbose: false, logEvery: 60, warmup: 30
};
const mode = Screen.getMode();
const screenHeight = mode.height *
    (mode.interlace === Screen.INTERLACED && mode.field === Screen.FRAME ? 2 : 1);
mode.height = screenHeight;
mode.zbuffering = true;
mode.psmz = Screen.Z16S;
Screen.setMode(mode);

const camera = new Camera3D.Camera({fovYDegrees: 70,
    aspect: mode.width / screenHeight, near: 0.1, far: 120})
    .setViewport(mode.width, screenHeight);
const lights = new Lights.Set(); // UNLIT world; retains distance fog only.
const scene = new Scene3D.Scene();
const actorScene = new Scene3D.Scene();
const definitions = JSON.parse(std.loadFile(
    'PS2Assets/SceneImports/COM2_NORMAL_1/Packed/Chunks/chunks.json')).chunks;
const textures = {};
const lodGroups = [];
const cellNodes = {};
for (const definition of definitions) {
    const texture = textures[definition.texturePath] ||
        (textures[definition.texturePath] = Model3D.Texture.load(definition.texturePath,
            Model3D.Texture.LINEAR, Model3D.Texture.CLAMP));
    const material = {shading: Model3D.UNLIT, texture};
    if (definition.alphaCutoff !== undefined) material.alphaCutoff = definition.alphaCutoff;
    const mesh = Model3D.load(definition.objPath, material);
    const position = definition.position || [0, 0, 0];
    const node = new Scene3D.Node(mesh).setPosition(position[0], position[1], position[2]);
    const cellKey = definition.cell.join('/');
    let cell = cellNodes[cellKey];
    if (!cell) {
        cell = cellNodes[cellKey] = new Scene3D.Node();
        scene.root.add(cell);
    }
    cell.add(node);
    if (PROFILE.lod) {
        // Keep large chunks until their entire bounding sphere is beyond the limit.
        const bounds = mesh.getBounds();
        const rx = Math.max(Math.abs(bounds[0]), Math.abs(bounds[3]));
        const ry = Math.max(Math.abs(bounds[1]), Math.abs(bounds[4]));
        const rz = Math.max(Math.abs(bounds[2]), Math.abs(bounds[5]));
        const radius = Math.sqrt(rx * rx + ry * ry + rz * rz);
        lodGroups.push(new LOD.Group(node, [{mesh, until: PROFILE.drawDistance + radius}],
            {hysteresis: 0.08}));
    }
    mesh.dispose();
}
for (const path in textures) textures[path].dispose();

function actor(path, x, z, yaw) {
    const mesh = Model3D.load(path, {shading: Model3D.UNLIT});
    const node = new Scene3D.Node(mesh).setRotationEuler(-Math.PI / 2, yaw, 0)
        .setPosition(x, 0, z);
    actorScene.root.add(node);
    mesh.dispose();
    return node;
}
actor('AthenaModels/mike_body.obj', 0, 0, 0);
actor('AthenaModels/mike_headgear.obj', 0, 0, 0);
actor('AthenaModels/zombie.obj', 2, 7, Math.PI);

// Native yaw 0 is +Z; the original preview starts on -Z.
const orbit = new CameraRig3D.Orbit(camera).setCenter(0, 1, 6)
    .setLimits(0.03, 1.2, 11, 11).setAngles(Math.PI, 0.2);
orbit.distance = 11;
orbit.update(0);
orbit.enabled = !PROFILE.freezeCamera;
scene.update(null);
actorScene.update(null);
if (PROFILE.lod) {
    // Per-chunk limits include radius; avoid a second centre-only cutoff.
    LOD.setGrid(24, {capacity: 128});
    LOD.update(camera);
    scene.update(null);
    LOD.setCamera(camera);
    lights.setFog(PROFILE.drawDistance * 0.75, PROFILE.drawDistance, 0, 0, 0);
}
scene.attachLoop();
actorScene.attachLoop();
CameraRig3D.attachLoop();

const hud = new NativeHUD([
    {x: 12, y: 10, text: 'COMZ2 SCENE IMPORT TEST'},
    {x: 12, y: 30, text: 'SCENE ' + definitions.length + ' CHUNKS 9908 TRI'},
    {x: 12, y: screenHeight - 78, text: 'R STICK ORBIT'},
    {x: 12, y: screenHeight - 58, text: 'SCENE T8 PIXELS 192 KB PLUS CLUT'},
    {x: 12, y: screenHeight - 38, text: 'NATIVE LOD CAMERA FONT TILEMAP'}
], 2);
hud.setLine(0, 12, 50, 'PROFILE WARMUP');
hud.setLine(1, 12, 70, 'LOD DISTANCE ' + PROFILE.drawDistance);

const pad = Gamepad.player(0);
pad.deadzone = 0.18;
pad.setAnalog(true);
const scopes = {scene: Profiler.scope('scene'), actors: Profiler.scope('actors'),
    hud: Profiler.scope('hud'), input: Profiler.scope('input')};
const profileStats = {scene: {}, actors: {}, hud: {}, input: {}};
const renderStats = {};
const lodStats = {};
Profiler.attachRender3D(Render3D, {warn: false});
Profiler.auto();
let frame = 0, windowStart = 0;
let uploadedBytes = 0;
console.log('SCENE_PROFILE_CONFIG ' + JSON.stringify(PROFILE));
Loop.run({
    update(dt) {
        Profiler.begin(scopes.input);
        Gamepad.update();
        // Sticks are not ready until analog setup finishes.
        if (!PROFILE.freezeCamera && pad.connected && pad.analog) {
            const x = pad.rightX, y = pad.rightY;
            if (x !== 0 || y !== 0) orbit.rotate(-x * 1.7 * Math.min(dt, 0.05),
                -y * 1.4 * Math.min(dt, 0.05));
        }
        Profiler.end(scopes.input);
    },
    draw() {
        Profiler.begin(scopes.scene);
        if (PROFILE.scene) scene.draw(camera, Render3D.CULL_BACK, lights, null);
        Profiler.end(scopes.scene);
        Profiler.begin(scopes.actors);
        if (PROFILE.actors) actorScene.draw(camera, Render3D.CULL_BACK, lights, null);
        Profiler.end(scopes.actors);
        Profiler.begin(scopes.hud);
        if (PROFILE.hud) hud.draw();
        Profiler.end(scopes.hud);
        if (++frame <= PROFILE.warmup) {
            if (frame === PROFILE.warmup) {
                Profiler.reset();
                windowStart = System.getMilliseconds();
            }
            return;
        }
        uploadedBytes += Screen.getMemoryStats(Screen.VRAM_UPLOADED);
        if ((frame - PROFILE.warmup) % PROFILE.logEvery !== 0) return;
        const now = System.getMilliseconds();
        const frameMs = (now - windowStart) / PROFILE.logEvery;
        windowStart = now;
        for (const name in scopes) Profiler.stats(scopes[name], PROFILE.logEvery, profileStats[name]);
        // The Profiler postDraw system consumes frameStats; do not reset here.
        Render3D.frameStats(renderStats, false);
        if (PROFILE.lod) LOD.stats(lodStats);
        const report = {fps: 1000 / frameMs, frameMs, samples: PROFILE.logEvery,
            sceneSubmitMs: profileStats.scene.average, actorsSubmitMs: profileStats.actors.average,
            hudSubmitMs: profileStats.hud.average,
            sceneP95Ms: profileStats.scene.p95, hudP95Ms: profileStats.hud.p95,
            render: renderStats, lod: lodStats, uploadedBytes: uploadedBytes / PROFILE.logEvery,
            freeVRAMBytes: Screen.getFreeVRAM(), profilerErrors: Profiler.errors(),
            // Capturing the handles keeps their native groups alive in Loop callbacks.
            lodGroupCount: lodGroups.length, cameraYaw: orbit.yaw, cameraPitch: orbit.pitch};
        if (PROFILE.verbose) report.scopes = profileStats;
        hud.setLine(0, 12, 50, 'FPS ' + report.fps.toFixed(1) + ' CPU ' +
            profileStats.scene.average.toFixed(1) + ' MS FREE ' +
            Math.floor(report.freeVRAMBytes / 1024) + ' KB');
        hud.setLine(1, 12, 70, 'LOD HIDDEN ' + (lodStats.hidden || 0) + '/' + definitions.length);
        console.log('SCENE_PROFILE ' + JSON.stringify(report));
        uploadedBytes = 0;
    }
});
