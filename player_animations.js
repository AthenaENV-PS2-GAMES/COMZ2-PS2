// Original Unity clips, sampled by Athena's native Animation3D system.
export class PlayerAnimations {
    constructor() {
        this.asset = GLTF3D.load('AthenaModels/mike_animated.glb', {shading: Model3D.UNLIT});
        this.root = this.asset.root;
        this.scene = new Scene3D.Scene();
        this.scene.root.add(this.root);
        const pelvisIndex = this.asset.names.indexOf('Bip01');
        const spineIndex = this.asset.names.indexOf('Spine_00');
        if (pelvisIndex < 0 || spineIndex < 0) throw new Error('Missing Mike aim joints');
        const pelvis = this.asset.nodes[pelvisIndex];
        const spine = this.asset.nodes[spineIndex];
        if (spine.getParent() !== pelvis) throw new Error('Unexpected Mike spine hierarchy');
        const spineRest = spine.getLocalTransform();
        this.aimPivotPoint = [spineRest.get(12), spineRest.get(13), spineRest.get(14)];
        this.aimPivot = new Scene3D.Node();
        pelvis.add(this.aimPivot);
        this.aimPivot.add(spine);
        this.players = {};
        for (const name in this.asset.clips) {
            this.players[name] = new Animation3D.Player(this.asset.clips[name], this.asset.nodes);
        }
        this.scene.attachLoop();
        Animation3D.attachLoop(-250);
        this.lower = null;
        this.upper = null;
        this.reset();
    }
    select(layer, name, loop) {
        const previous = this[layer];
        if (previous === name) return;
        if (previous) this.players[previous].pause();
        const next = this.players[name];
        if (!next) throw new Error('Missing player animation: ' + name);
        next.loop = loop;
        next.time = 0;
        next.play();
        this[layer] = name;
        this.label = (this.action || (this.moving ? 'RUN' : 'IDLE')).toUpperCase();
    }
    reset() {
        for (const name in this.players) this.players[name].pause();
        this.lower = this.upper = null;
        this.action = null;
        this.lowerAction = false;
        this.moving = false;
        this.setAimPitch(0);
        this.select('lower', 'MP5_LowerBody_Idle01', true);
        this.select('upper', 'MP5_UpperBody_Idle01', true);
    }
    update(x, forward) {
        this.moving = x*x + forward*forward > 0.12*0.12;
        if (this.lowerAction && (!this.players[this.lower].playing || this.moving)) this.lowerAction = false;
        if (!this.lowerAction) {
            let lower = this.action === 'reload' ? 'MP5_LowerBody_Reload01' : 'MP5_LowerBody_Idle01';
            if (this.moving) {
                const angle = Math.atan2(Math.abs(x), forward) * 180 / Math.PI;
                lower = angle <= 60 ? 'Lower_body_Run01' : angle >= 140 ? 'Lower_body_Run02'
                    : (x < 0 ? 'Lower_body_Run03' : 'Lower_body_Run04');
            }
            const changed = this.lower !== lower;
            this.select('lower', lower, lower !== 'MP5_LowerBody_Reload01');
            if (changed && lower === 'MP5_LowerBody_Reload01')
                this.players[lower].time = this.players[this.upper].time;
        }
        if (!this.action) this.select('upper', this.moving
            ? 'MP5_UpperBody_Run01' : 'MP5_UpperBody_Idle01', true);
    }
    fire() {
        if (this.action === 'reload') return;
        this.action = 'fire';
        // A new shot can restart the short clip even if it is already selected.
        if (this.upper === 'MP5_UpperBody_Shooting01') this.upper = null;
        this.select('upper', 'MP5_UpperBody_Shooting01', false);
        if (!this.moving) {
            this.lowerAction = true;
            if (this.lower === 'MP5_LowerBody_Shooting01') this.lower = null;
            this.select('lower', 'MP5_LowerBody_Shooting01', false);
        }
    }
    reload() {
        if (this.action === 'reload') return;
        this.action = 'reload';
        this.lowerAction = false;
        this.select('upper', 'MP5_UpperBody_Reload01', false);
    }
    configureWeapon(config) {
        this.players.MP5_UpperBody_Shooting01.speed = Math.max(1,
            this.asset.clips.MP5_UpperBody_Shooting01.duration / config.interval);
        this.players.MP5_UpperBody_Reload01.speed = config.reloadSpeed;
        this.players.MP5_LowerBody_Reload01.speed = config.reloadSpeed;
        this.players.MP5_UpperBody_FireReady.speed =
            this.asset.clips.MP5_UpperBody_FireReady.duration / config.readySeconds;
    }
    syncWeapon(weapon, event, x, forward) {
        this.moving = x*x + forward*forward > 0.12*0.12;
        if (event === 'ready') {
            this.action = 'ready';
            this.lowerAction = false;
            this.select('upper', 'MP5_UpperBody_FireReady', false);
        } else if (event === 'reload') this.reload();
        else if (event === 'fire') this.fire();
        if (weapon.state === 'IDLE' || weapon.state === 'EMPTY' || weapon.state === 'UNEQUIPPED') {
            this.action = null;
            this.lowerAction = false;
        }
        this.update(x, forward);
        this.label = weapon.state;
    }
    setPose(x, y, z, yaw, pitch = 0) {
        // The original rig already converts its mesh-local Z-up reference pose.
        this.root.setPosition(x,y,z).setRotationEuler(0,yaw,0);
        this.setAimPitch(pitch);
    }
    setAimPitch(pitch) {
        // The rig's converted local Y axis is world pitch; rotate around Spine_00.
        const angle = -pitch, c = Math.cos(angle), s = Math.sin(angle);
        const [x, y, z] = this.aimPivotPoint;
        this.aimPivot.setPosition(x - c*x - s*z, y, z + s*x - c*z)
            .setRotationEuler(0, angle, 0);
    }
    draw(camera, lights) {
        this.scene.draw(camera, Render3D.CULL_BACK, lights, null);
    }
}
