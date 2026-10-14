import {WeaponEffects} from './player_weapon_visuals.js';

export class PlayerShots {
    constructor(animations,config) {
        this.animations=animations;this.config=config;
        this.asset=GLTF3D.load(config.asset,{shading:Model3D.UNLIT});
        this.weaponNode=this.asset.root;
        const manifest=JSON.parse(std.loadFile('AthenaModels/mike_animated.json'));
        const socket=manifest.nodeNames.indexOf(config.socket);
        if(socket<0)throw new Error('Missing weapon socket '+config.socket);
        animations.asset.nodes[socket].add(this.weaponNode);
        this.muzzle=this.asset.nodes[config.nodeNames.indexOf(config.muzzle)];
        if(!this.muzzle)throw new Error('Missing MP5 muzzle');
        this.matrix=this.muzzle.getLocalTransform();
        this.ray={};this.hit={};this.targetHit={};this.origin={};this.end={};this.coverHit={};this.spread={};
        this.fx=new WeaponEffects(JSON.parse(std.loadFile('AthenaModels/WeaponFX/visuals.json')));
        this.flash=this.fx.flash;this.tracer=this.fx.tracer;
        this.reset();
    }
    reset() {
        this.pending=false;this.lastHit=false;this.hitCount=0;
        this.lastShotResult='';this.lastHitbox='';this.lastDamage=0;this.lastTarget=null;this.fx.reset();
    }
    update(dt,equipped) {
        this.weaponNode.visible=equipped;
        this.fx.update(dt,this.animations.moving);
        if(!equipped||this.animations.action==='reload')this.fx.clearMuzzle();
    }
    resolve(camera,level,player,width,height,targets=null,damage=0) {
        if(this.pending||this.flash.visible)this.muzzle.getWorldTransform(this.matrix);
        if(!this.pending)return;
        this.pending=false;
        const mx=this.matrix.get(12),my=this.matrix.get(13),mz=this.matrix.get(14);
        this.fx.sight.sample(height,this.spread);
        camera.screenToRay(width*0.5+this.spread.x,height*0.5+this.spread.y,this.ray);
        this.fx.sight.kick();
        const r=this.ray;
        const skip=Math.max(0,(player.x-r.x)*r.dx+(player.y+1-r.y)*r.dy+(player.z-r.z)*r.dz);
        r.x+=r.dx*skip;r.y+=r.dy*skip;r.z+=r.dz*skip;
        const sceneHit=level.raycast(r,this.config.maxRayDistance,undefined,this.hit);
        let hit=sceneHit;
        const targetHit=targets&&targets.raycast(r,this.config.maxRayDistance,this.targetHit);
        const targetOccluded=!!targetHit&&!!sceneHit&&sceneHit.distance<=targetHit.distance;
        let damageTarget=!!targetHit&&!targetOccluded;
        if(damageTarget)hit=targetHit;
        this.lastShotResult=damageTarget?'TARGET':targetOccluded?'COVER':hit?'SCENE':'MISS';
        this.lastHitbox=damageTarget?targetHit.hitbox.name:'';
        this.lastDamage=0;this.lastTarget=null;
        let ex=hit?hit.x:r.x+r.dx*60,ey=hit?hit.y:r.y+r.dy*60,ez=hit?hit.z:r.z+r.dz*60;
        const dx=ex-mx,dy=ey-my,dz=ez-mz,length=Math.hypot(dx,dy,dz);
        if(length>0.001){
            this.origin.x=mx;this.origin.y=my;this.origin.z=mz;
            this.origin.dx=dx/length;this.origin.dy=dy/length;this.origin.dz=dz/length;
            // Only the nearby shoulder/muzzle offset needs a second cover test;
            // the camera ray already resolves distant scene triangles.
            const cover=level.raycast(this.origin,Math.min(length,2.5),undefined,this.coverHit);
            if(cover){
                hit=cover;ex=cover.x;ey=cover.y;ez=cover.z;
                this.lastShotResult='COVER';
                damageTarget=false;
            }
        }
        this.lastHit=!!hit;if(hit)this.hitCount++;
        this.end.x=ex;this.end.y=ey;this.end.z=ez;
        this.fx.fire(this.matrix,mx,my,mz,ex,ey,ez,hit);
        if(damageTarget){
            this.lastDamage=targets.applyDamage(targetHit,damage);
            if(this.lastDamage)this.lastTarget=targetHit.target;
        }
    }
    drawEffects(camera,width,height) { this.fx.drawEffects(camera,width,height); }
    drawReticle(width,height) { this.fx.drawReticle(width,height); }
    draw(camera,lights,width,height) { this.fx.draw(camera,width,height); }
}
