export const TEST_TARGET_SPECS = [
    {id: 'A', x: -1, z: 7},
    {id: 'B', x: 2, z: 8}
];

const TARGET_HITBOXES = [
    {name: 'TORSO', x: 0, y: 0.78, z: 0, radius: 0.48},
    {name: 'HEAD', x: 0, y: 1.45, z: 0, radius: 0.27}
];

const TARGET_BOXES = [
    {min: [-0.45, 0, -0.2], max: [0.45, 0.12, 0.2], color: [0.35, 0.38, 0.42, 1]},
    {min: [-0.3, 0.18, -0.13], max: [0.3, 1.2, 0.13], color: [0.12, 0.72, 0.68, 1]},
    {min: [-0.2, 1.25, -0.16], max: [0.2, 1.65, 0.16], color: [1, 0.72, 0.12, 1]}
];

const BOX_FACES = [
    [0, 4, 6, 0, 6, 2], [1, 3, 7, 1, 7, 5],
    [0, 1, 5, 0, 5, 4], [2, 6, 7, 2, 7, 3],
    [0, 2, 3, 0, 3, 1], [4, 5, 7, 4, 7, 6]
];
const CORNERS = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
];

export function calculatePlayerDamage(config, comboRatio = 1) {
    return (config.weaponDamage + config.avatarDamage * config.interval) * comboRatio;
}

export function raycastHitboxes(targets, ray, maxDistance, out = {}) {
    let nearest = maxDistance;
    let result = null;
    for (const target of targets) {
        if (target.hp <= 0) continue;
        for (const hitbox of target.hitboxes) {
            const ox = ray.x - target.x - hitbox.x;
            const oy = ray.y - target.y - hitbox.y;
            const oz = ray.z - target.z - hitbox.z;
            const projection = ox * ray.dx + oy * ray.dy + oz * ray.dz;
            const c = ox * ox + oy * oy + oz * oz - hitbox.radius * hitbox.radius;
            const discriminant = projection * projection - c;
            if (discriminant < 0) continue;
            const root = Math.sqrt(discriminant);
            let distance = -projection - root;
            if (distance < 0) distance = -projection + root;
            if (distance < 0 || distance >= nearest) continue;
            nearest = distance;
            result = out;
            result.target = target;
            result.hitbox = hitbox;
            result.distance = distance;
            result.x = ray.x + ray.dx * distance;
            result.y = ray.y + ray.dy * distance;
            result.z = ray.z + ray.dz * distance;
            const nx = result.x - target.x - hitbox.x;
            const ny = result.y - target.y - hitbox.y;
            const nz = result.z - target.z - hitbox.z;
            const length = Math.hypot(nx, ny, nz);
            result.nx = nx / length;
            result.ny = ny / length;
            result.nz = nz / length;
        }
    }
    return result;
}

export function applyTargetDamage(hit, damage) {
    if (!hit || !hit.target || !Number.isFinite(damage) || damage <= 0) return false;
    const target = hit.target;
    if (target.hp <= 0) return false;
    const applied = Math.min(target.hp, damage);
    target.hp -= applied;
    target.damageTaken += applied;
    target.hits++;
    return applied;
}

function appendBox(positions, colors, box) {
    const corners = CORNERS.map(corner => [
        box.min[0] + (box.max[0] - box.min[0]) * corner[0],
        box.min[1] + (box.max[1] - box.min[1]) * corner[1],
        box.min[2] + (box.max[2] - box.min[2]) * corner[2]
    ]);
    for (const face of BOX_FACES) for (const index of face) {
        positions.push(...corners[index]);
        colors.push(...box.color);
    }
}

function createTargetMesh() {
    const positions = [], colors = [];
    for (const box of TARGET_BOXES) appendBox(positions, colors, box);
    return Model3D.Mesh.fromGeometry({
        positions: new Float32Array(positions),
        colors: new Float32Array(colors),
        material: {shading: Model3D.UNLIT}
    });
}

export class TestTargets {
    constructor(navigation) {
        const mesh = createTargetMesh();
        try {
            this.targets = TEST_TARGET_SPECS.map(spec => {
                const navPoly = navigation.locate(spec.x, spec.z, -1, 0);
                if (navPoly < 0) throw new Error('Test target is outside walkable navigation: ' + spec.id);
                const y = navigation.height(navPoly, spec.x, spec.z);
                const instance = mesh.createInstance().setPosition(spec.x, y, spec.z);
                return {
                    ...spec, y, navPoly, instance, hp: 100, maxHp: 100, hits: 0, damageTaken: 0,
                    hitboxes: TARGET_HITBOXES
                };
            });
        } catch (error) {
            mesh.dispose();
            throw error;
        }
        mesh.dispose();
        this.batch = new Render3D.Batch();
        this.lastHit = null;
        this.lastDamage = 0;
        this.batchDirty = true;
    }
    raycast(ray, maxDistance, out) {
        return raycastHitboxes(this.targets, ray, maxDistance, out);
    }
    applyDamage(hit, damage) {
        const applied = applyTargetDamage(hit, damage);
        if (applied === false) return false;
        this.lastHit = hit;
        this.lastDamage = applied;
        if (hit.target.hp === 0) this.batchDirty = true;
        return applied;
    }
    reset() {
        for (const target of this.targets) {
            target.hp = target.maxHp;
            target.hits = 0;
            target.damageTaken = 0;
        }
        this.lastHit = null;
        this.lastDamage = 0;
        this.batchDirty = true;
    }
    draw(camera, lights) {
        if (this.batchDirty) {
            this.batch.clear();
            for (const target of this.targets) if (target.hp > 0) this.batch.add(target.instance);
            this.batchDirty = false;
        }
        this.batch.draw(camera, Render3D.CULL_BACK, lights, null);
    }
}
