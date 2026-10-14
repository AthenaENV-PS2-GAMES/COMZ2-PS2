import assert from 'node:assert/strict';
import {PlayerShots} from '../player_shots.js';
const shots=Object.create(PlayerShots.prototype),order=[],calls=[];
shots.config={maxRayDistance:1000};shots.matrix={get(i){return i===13?1:0;}};
shots.muzzle={getWorldTransform(){order.push('muzzle');}};
shots.ray={};shots.hit={};shots.origin={};shots.end={};shots.coverHit={};shots.spread={};
shots.pending=true;shots.flash={visible:false};shots.hitCount=0;
shots.fx={sight:{sample(h,out){order.push('sample');out.x=2;out.y=-3;},kick(){order.push('kick');}},
    fire(...args){calls.push(args);}};
const camera={screenToRay(x,y,out){order.push('ray');assert.equal(x,322);assert.equal(y,221);
    Object.assign(out,{x:0,y:1,z:-2.5,dx:0,dy:0,dz:1});}};
let query=0;
const level={raycast(ray,distance,options,out){
    if(query++%2===0){assert.equal(distance,1000);assert.equal(ray.z,0);return Object.assign(out,{x:0,y:1,z:10,nx:0,ny:0,nz:-1});}
    assert.equal(distance,2.5,'secondary query is restricted to nearby cover');return null;
}};
shots.resolve(camera,level,{x:0,y:0,z:0},640,448);
assert.deepEqual(order,['muzzle','sample','ray','kick']);assert.equal(query,2);
assert.equal(shots.end.z,10);assert.equal(shots.hitCount,1);assert.equal(calls[0][6],10);
shots.pending=true;query=0;
level.raycast=(ray,distance,options,out)=>Object.assign(out,{x:0,y:1,z:++query===1?10:1,nx:0,ny:0,nz:-1});
shots.resolve(camera,level,{x:0,y:0,z:0},640,448);
assert.equal(shots.end.z,1,'nearby cover wins over the reticle target');assert.equal(shots.hitCount,2);
shots.resolve(camera,level,{x:0,y:0,z:0},640,448);assert.equal(query,2,'no query without a new shot');
console.log('PlayerShots: pre-kick spread, current muzzle, camera ray, nearby cover and idle query suppression passed');

function makeDamageShot(sceneDistance,muzzleBlocked) {
    const shot=Object.create(PlayerShots.prototype),events=[];
    shot.config={maxRayDistance:1000};
    shot.matrix={get(i){return i===13?1:0;}};
    shot.muzzle={getWorldTransform(){}};
    shot.ray={};shot.hit={};shot.targetHit={};shot.origin={};shot.end={};shot.coverHit={};shot.spread={};
    shot.pending=true;shot.flash={visible:false};shot.hitCount=0;
    const hit={distance:10,x:0,y:1,z:10,nx:0,ny:0,nz:-1,target:{id:'A'},
        hitbox:{name:'HEAD'}};
    shot.fx={sight:{sample(height,out){out.x=out.y=0;},kick(){}},
        fire(matrix,mx,my,mz,x,y,z){events.push({impactZ:z});}};
    const targets={
        raycast(ray,distance,out){Object.assign(out,hit);return out;},
        applyDamage(value,damage){events.push({damage,target:value.target.id,hitbox:value.hitbox.name});return damage;}
    };
    let raycasts=0;
    const scene={raycast(ray,distance,options,out){
        raycasts++;
        if(distance>2.5){
            if(sceneDistance===null)return null;
            return Object.assign(out,{distance:sceneDistance,x:0,y:1,z:sceneDistance,nx:0,ny:0,nz:-1});
        }
        if(muzzleBlocked)return Object.assign(out,{distance:0.8,x:0,y:1,z:0.8,nx:0,ny:0,nz:-1});
        return null;
    }};
    const camera={screenToRay(x,y,out){Object.assign(out,{x:0,y:1,z:0,dx:0,dy:0,dz:1});}};
    shot.resolve(camera,scene,{x:0,y:0,z:0},640,448,targets,3.64);
    return {shot,events,raycasts};
}
let result=makeDamageShot(14,false);
assert.equal(result.shot.lastShotResult,'TARGET');
assert.equal(result.shot.lastHitbox,'HEAD');
assert.deepEqual(result.events,[{impactZ:10},{damage:3.64,target:'A',hitbox:'HEAD'}],
    'a target in front of the scene surface receives original damage');
result=makeDamageShot(5,false);
assert.equal(result.shot.lastShotResult,'COVER');
assert.deepEqual(result.events,[{impactZ:5}],'a nearer wall blocks damage to the target');
result=makeDamageShot(14,true);
assert.equal(result.shot.lastShotResult,'COVER');
assert.deepEqual(result.events,[{impactZ:0.8}],'near-muzzle cover blocks target damage');
console.log('PlayerShots: nearest target, scene cover and muzzle cover prevent occluded damage');
