// Ammo totals follow WeaponData.cs: total includes the loaded magazine.
// Pure gameplay state; rendering and hits are handled after native scene updates.
export class PlayerWeapon {
    constructor(config, reloadDuration) {
        this.config = config;
        this.reloadDuration = reloadDuration / config.reloadSpeed * config.reloadReleaseFraction;
        this.reset();
    }
    reset() {
        this.owned = {};
        this.owned[this.config.id] = {clip: Math.min(this.config.capacity, this.config.initialTotal),
            total: this.config.initialTotal};
        this.equipped = this.config.id;
        this.state = 'IDLE';
        this.timer = 0;
        this.cooldown = 0;
        this.shots = 0;
    }
    get ammo() { return this.equipped ? this.owned[this.equipped] : null; }
    get reserve() { return this.ammo ? this.ammo.total - this.ammo.clip : 0; }
    equip(id) {
        if (this.state === 'RELOAD' || (id !== null && (!this.owned[id] || id !== this.config.id))) return false;
        if (id === this.equipped) return true;
        this.equipped = id;
        this.state = id === null ? 'UNEQUIPPED' : 'IDLE';
        this.timer = this.cooldown = 0;
        return true;
    }
    canReload() {
        const ammo = this.ammo;
        return ammo && ammo.clip < this.config.capacity && ammo.total > ammo.clip;
    }
    beginReload() {
        if (this.state === 'RELOAD' || !this.canReload()) return false;
        // The Unity game refills on entry, then locks fire until 85% of the clip.
        this.ammo.clip = Math.min(this.config.capacity, this.ammo.total);
        this.state = 'RELOAD';
        this.timer = this.reloadDuration;
        return true;
    }
    update(dt, trigger, reloadPressed) {
        this.cooldown = Math.max(-0.05, this.cooldown - dt);
        if (!this.ammo) return null;
        if (this.state === 'RELOAD') {
            this.timer -= dt;
            if (this.timer > 1e-8) return null;
            this.state = 'IDLE';
            this.cooldown = 0;
        }
        if (reloadPressed && this.beginReload()) return 'reload';
        if (this.ammo.clip <= 0 && this.state === 'SHOOT') {
            // Finish the last shot before entering automatic reload, even if
            // the trigger was released on that final round.
            if (this.cooldown > 1e-8) return null;
            if (this.beginReload()) return 'reload';
            this.state = 'EMPTY';
            return null;
        }
        if (!trigger) {
            if (this.state === 'SHOOT') {
                this.state = 'AFTER';
                this.timer = this.config.afterFireSeconds;
            } else if (this.state === 'AFTER') {
                this.timer -= dt;
                if (this.timer <= 0) this.state = 'IDLE';
            } else if (this.state === 'READY') this.state = 'IDLE';
            return null;
        }
        if (this.ammo.clip <= 0) {
            if (this.beginReload()) return 'reload';
            this.state = 'EMPTY';
            return null;
        }
        if (this.state === 'IDLE' || this.state === 'EMPTY') {
            this.state = 'READY';
            this.timer = this.config.readySeconds;
            return 'ready';
        }
        if (this.state === 'READY') {
            this.timer -= dt;
            if (this.timer > 1e-8) return null;
            this.cooldown = 0;
        }
        if (this.cooldown > 1e-8) return null;
        this.ammo.clip--;
        this.ammo.total--;
        // Preserve the fractional frame so 0.13 s doesn't become 0.15 s at 60Hz.
        this.cooldown += this.config.interval;
        this.state = 'SHOOT';
        this.shots++;
        return 'fire';
    }
}
