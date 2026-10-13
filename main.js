// Static OBJ gallery for the AthenaENV ELF in this project.
const mode = Screen.getMode();
const screenHeight = mode.height *
    (mode.interlace === Screen.INTERLACED && mode.field === Screen.FRAME ? 2 : 1);
mode.height = screenHeight;
mode.zbuffering = true;
mode.psmz = Screen.Z16S;
Screen.setMode(mode);

const definitions = [
    {name: 'TREE', path: 'AthenaModels/tree_01.obj', tint: [1, 1, 1], base: [0, 0, 0]},
    {name: 'CHAIR', path: 'AthenaModels/chair_02.obj', tint: [1, 1, 1], base: [0, 0, 0]},
    {name: 'CAR', path: 'AthenaModels/car_04.obj', tint: [1, 1, 1], base: [0, 0, Math.PI / 2]},
    {name: 'FLOOR', path: 'AthenaModels/floor_01_0.obj', tint: [1, 1, 1], base: [-Math.PI / 2, 0, 0]},
    {name: 'AK47', path: 'AthenaModels/Weapon_AK47.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'MP5', path: 'AthenaModels/Weapon_MP5.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'M16', path: 'AthenaModels/Weapon_Rifle_M16.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'FN2000', path: 'AthenaModels/Weapon_MachineGun_03.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'RPG', path: 'AthenaModels/Weapon_Grenade_RPGm.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'GATLING', path: 'AthenaModels/Rifle_Gatlin.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'XM1014', path: 'AthenaModels/XM1014.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'SHOTGUN', path: 'AthenaModels/Weapon_ShotGun_03.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {name: 'ELECTRIC SAW', path: 'AthenaModels/Electric_saw_Large.obj', tint: [1, 1, 1], base: [0, Math.PI / 2, 0]},
    {
        name: 'COWBOY',
        tint: [1, 1, 1],
        parts: [
            {path: 'AthenaModels/cowboy_body.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]},
            {path: 'AthenaModels/cowboy_outfit.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]}
        ]
    },
    {
        name: 'DOCTOR',
        tint: [1, 1, 1],
        parts: [
            {path: 'AthenaModels/doctor.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]}
        ]
    },
    {
        name: 'SWAT',
        tint: [1, 1, 1],
        parts: [
            {path: 'AthenaModels/swat_body.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]},
            {path: 'AthenaModels/swat_gear.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]}
        ]
    },
    {
        name: 'ZOMBIE',
        tint: [1, 1, 1],
        parts: [
            {path: 'AthenaModels/zombie.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]}
        ]
    },
    {
        name: 'CLOWN ZOMBIE',
        tint: [1, 1, 1],
        parts: [
            {path: 'AthenaModels/zombie_clown.obj', rotation: [-Math.PI / 2, 0, 0], offset: [0, 0, 0]}
        ]
    },
    {
        name: 'MIKE STATIC',
        tint: [1, 1, 1],
        parts: [
            {
                path: 'AthenaModels/mike_body.obj',
                rotation: [-Math.PI / 2, 0, 0],
                offset: [-0.0021168282, 0, 0]
            },
            {
                path: 'AthenaModels/mike_headgear.obj',
                rotation: [-Math.PI / 2, 0, 0]
            }
        ]
    }
];
function rotatePoint(point, rotation) {
    let [x, y, z] = point;
    let [rx, ry, rz] = rotation;
    let c = Math.cos(rx), s = Math.sin(rx);
    [y, z] = [c * y - s * z, s * y + c * z];
    c = Math.cos(ry); s = Math.sin(ry);
    [x, z] = [c * x + s * z, -s * x + c * z];
    c = Math.cos(rz); s = Math.sin(rz);
    [x, y] = [c * x - s * y, s * x + c * y];
    return [x, y, z];
}

function updateModelTransform(model, angle) {
    const limits = [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]];
    const rotations = model.parts.map(part => [
        part.rotation[0], part.rotation[1] + angle, part.rotation[2]
    ]);
    for (let p = 0; p < model.parts.length; p++) {
        const part = model.parts[p], rotation = rotations[p];
        for (let mask = 0; mask < 8; mask++) {
            const point = rotatePoint([
                part.bounds[(mask & 1) ? 3 : 0],
                part.bounds[(mask & 2) ? 4 : 1],
                part.bounds[(mask & 4) ? 5 : 2]
            ], rotation);
            for (let axis = 0; axis < 3; axis++) {
                const value = point[axis] + part.offset[axis];
                limits[0][axis] = Math.min(limits[0][axis], value);
                limits[1][axis] = Math.max(limits[1][axis], value);
            }
        }
    }
    const center = limits[0].map((value, axis) => (value + limits[1][axis]) * 0.5);
    const largestDimension = Math.max(
        limits[1][0] - limits[0][0],
        limits[1][1] - limits[0][1],
        limits[1][2] - limits[0][2]
    );
    const scale = model.scale;
    if (scale <= 0) return largestDimension;
    for (let i = 0; i < model.parts.length; i++) {
        const part = model.parts[i];
        const rotation = rotations[i];
        part.instance
            .setScale(scale, scale, scale)
            .setRotationEuler(rotation[0], rotation[1], rotation[2])
            .setPosition(
                (part.offset[0] - center[0]) * scale,
                (part.offset[1] - center[1]) * scale,
                (part.offset[2] - center[2]) * scale
            );
    }
    return largestDimension;
}

function loadModel(definition) {
    const partDefinitions = definition.parts || [{
        path: definition.path,
        rotation: definition.base || [0, 0, 0],
        offset: [0, 0, 0]
    }];
    const parts = partDefinitions.map(partDefinition => {
        const mesh = Model3D.load(partDefinition.path, {shading: Model3D.DIFFUSE});
        const bounds = mesh.getBounds();
        const rotation = partDefinition.rotation || [0, 0, 0];
        const offset = partDefinition.offset || [0, 0, 0];
        const instance = mesh.createInstance();
        mesh.dispose();
        return {bounds, rotation, offset, instance};
    });
    const model = {name: definition.name, tint: definition.tint, parts, scale: 0};
    const largestDimension = updateModelTransform(model, 0);
    if (!Number.isFinite(largestDimension) || largestDimension <= 0) {
        throw new Error('Invalid model bounds: ' + definition.name);
    }
    model.scale = 2.8 / largestDimension;
    updateModelTransform(model, 0);
    return model;
}

function disposeModel(model) {
    for (const part of model.parts) part.instance.dispose();
}

const camera = new Camera3D.Camera({
    fovYDegrees: 42,
    aspect: mode.width / screenHeight,
    near: 0.1,
    far: 40
}).setViewport(mode.width, screenHeight);
const lights = new Lights.Set()
    .setAmbient(0.48, 0.48, 0.48)
    .setDirectional(0, -0.4, 0.8, 0.6, 0.65, 0.65, 0.65);
const hud = new Image('hud.png');
if (!hud.ready()) throw new Error('Could not load HUD font: hud.png');
if (!hud.lock()) throw new Error('Could not reserve VRAM for HUD font: hud.png');

const gamepad = Gamepad.player(0);
gamepad.deadzone = 0.18;
gamepad.setAnalog(true);
const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ :.-/';
function text(x, y, value) {
    for (let i = 0; i < value.length; i++) {
        const glyph = glyphs.indexOf(value[i]);
        if (glyph < 0) continue;
        const startX = (glyph % 16) * 8;
        const startY = Math.floor(glyph / 16) * 16;
        hud.draw(x + i * 8, y, {
            width: 8,
            height: 16,
            startx: startX,
            starty: startY,
            endx: startX + 8,
            endy: startY + 16
        });
    }
}

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
let selected = 0;
let model = loadModel(definitions[selected]);
let yaw = 0.55;
let pitch = 0.28;
let distance = 5.3;
let spin = true;
let angle = 0;
const stats = {};

function resetCamera() {
    yaw = 0.55;
    pitch = selected === 3 ? 0.78 : 0.28;
    distance = selected === 3 ? 6.1 : 5.3;
}

function choose(index) {
    const next = (index + definitions.length) % definitions.length;
    if (next === selected) return;
    disposeModel(model);
    selected = next;
    angle = 0;
    resetCamera();
    model = loadModel(definitions[selected]);
}

function updateCamera() {
    const horizontal = distance * Math.cos(pitch);
    camera.setPosition(
        Math.sin(yaw) * horizontal,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * horizontal
    ).lookAt(0, 0, 0);
}

resetCamera();
updateCamera();

Loop.run({
    update(dt) {
        Gamepad.update();
        const step = clamp(dt, 0, 0.05);
        if (gamepad.repeatPressed(Gamepad.LEFT, 350, 180) ||
            gamepad.repeatPressed(Gamepad.L1, 350, 180)) {
            choose(selected - 1);
        } else if (gamepad.repeatPressed(Gamepad.RIGHT, 350, 180) ||
            gamepad.repeatPressed(Gamepad.R1, 350, 180)) {
            choose(selected + 1);
        }
        if (gamepad.justPressed(Gamepad.CROSS)) spin = !spin;
        if (gamepad.justPressed(Gamepad.START)) {
            angle = 0;
            resetCamera();
        }

        yaw += gamepad.rightX * step * 1.7;
        pitch = clamp(pitch - gamepad.rightY * step * 1.4, 0.02, 1.35);
        distance = clamp(distance + gamepad.leftY * step * 3, 3.2, 9);
        if (spin) angle += step * 0.5;

        updateModelTransform(model, angle);
        updateCamera();
    },
    draw() {
        Render3D.setTint(model.tint[0], model.tint[1], model.tint[2]);
        let triangles = 0;
        for (const part of model.parts) {
            Render3D.draw(part.instance, camera, Render3D.CULL_BACK, lights, stats);
            triangles += stats.sourceTriangles;
        }
        Render3D.setTint(1, 1, 1);

        text(12, 10, 'ATHENA MODEL VIEWER');
        text(12, 30, 'MODEL ' + (selected + 1) + '/' + definitions.length + ' ' + model.name);
        text(12, 50, 'TRIANGLES ' + triangles);
        text(12, screenHeight - 58, 'LEFT RIGHT OR L1 R1 SELECT');
        text(12, screenHeight - 38, 'R STICK ORBIT L STICK ZOOM');
        text(12, screenHeight - 18, 'X SPIN START RESET CAMERA');
    }
});
