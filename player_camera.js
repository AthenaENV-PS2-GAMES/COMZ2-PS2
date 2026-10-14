const NORMAL_FOV = 70;
const AIM_FOV = 50;
const ZOOM_SPEED = 120;
const CAMERA_CLEARANCE = 0.03;

export function stepCameraFov(current, firing, dt) {
    const target = firing ? AIM_FOV : NORMAL_FOV;
    const step = Math.max(0, dt) * ZOOM_SPEED;
    return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function resolveCameraPosition(world, origin, desired, radius, scratch) {
    const ox = scratch.origin[0] = origin[0];
    const oy = scratch.origin[1] = origin[1];
    const oz = scratch.origin[2] = origin[2];
    const dx = desired[0] - ox, dy = desired[1] - oy, dz = desired[2] - oz;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-6) {
        scratch.position[0] = desired[0];
        scratch.position[1] = desired[1];
        scratch.position[2] = desired[2];
        return scratch.position;
    }

    const direction = scratch.direction;
    direction[0] = dx / length;
    direction[1] = dy / length;
    direction[2] = dz / length;
    let distance = length;
    const sweep = world.sphereCast(
        scratch.origin, radius, direction, length, undefined, scratch.sweepHit
    );
    if (sweep) distance = Math.min(distance, Math.max(0, sweep.distance - CAMERA_CLEARANCE));

    // Raycasts are two-sided, unlike sphereCast; they also catch back-facing walls.
    const hit = world.raycast(
        scratch.origin, direction, length, undefined, scratch.rayHit
    );
    if (hit) distance = Math.min(distance,
        Math.max(0, hit.distance - radius - CAMERA_CLEARANCE));

    const position = scratch.position;
    position[0] = ox + direction[0] * distance;
    position[1] = oy + direction[1] * distance;
    position[2] = oz + direction[2] * distance;
    return position;
}
