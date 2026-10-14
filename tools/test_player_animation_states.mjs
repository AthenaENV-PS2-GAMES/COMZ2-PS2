import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PlayerAnimations} from '../player_animations.js';
const config=JSON.parse(readFileSync(new URL('../AthenaModels/mp5_equipped.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../AthenaModels/mike_animated.json',import.meta.url)));
// Verify JS transition decisions; native curve sampling is tested in the ELF.
const a=Object.create(PlayerAnimations.prototype);
a.asset={clips:{}};a.players={};
const aimTransform={position:null,rotation:null,
    setPosition(x,y,z){this.position=[x,y,z];return this;},
    setRotationEuler(x,y,z){this.rotation=[x,y,z];return this;}};
a.aimPivot=aimTransform;a.aimPivotPoint=[0.01,0,0.06];
for(const clip of manifest.clips){
    a.asset.clips[clip.name]={duration:clip.duration};
    a.players[clip.name]={time:0,speed:1,loop:false,playing:false,
        play(){this.playing=true;},pause(){this.playing=false;}};
}
a.reset();a.configureWeapon(config);
assert.deepEqual(aimTransform.position,[0,0,0]);
assert.ok(aimTransform.rotation.every(value=>Math.abs(value)<1e-12));
const pitch=0.3,point=a.aimPivotPoint;
a.setAimPitch(pitch);
assert.equal(aimTransform.rotation[1],-pitch);
const angle=aimTransform.rotation[1],c=Math.cos(angle),s=Math.sin(angle);
const rotated=[c*point[0]+s*point[2],point[1],-s*point[0]+c*point[2]];
assert.ok(Math.hypot(
    rotated[0]+aimTransform.position[0]-point[0],
    rotated[1]+aimTransform.position[1]-point[1],
    rotated[2]+aimTransform.position[2]-point[2]
)<1e-12,'aim pivot must preserve the spine joint at its origin');
const w={state:'RELOAD'};
for(let frame=0;frame<20;frame++){
    a.syncWeapon(w,frame===0?'reload':null,0,0);
    for(const p of Object.values(a.players))if(p.playing)p.time+=p.speed/60;
}
assert.equal(a.lower,'MP5_LowerBody_Reload01');
assert.ok(a.players[a.lower].time>0.39,'stationary lower reload must advance instead of restarting every frame');
assert.equal(a.players[a.lower].time,a.players[a.upper].time);
a.syncWeapon(w,null,1,0);assert.equal(a.lower,'Lower_body_Run04');
a.syncWeapon(w,null,0,0);
assert.equal(a.lower,'MP5_LowerBody_Reload01');
assert.equal(a.players[a.lower].time,a.players[a.upper].time,'stopping movement resynchronizes lower reload');
w.state='READY';a.syncWeapon(w,'ready',0,0);assert.equal(a.upper,'MP5_UpperBody_FireReady');
w.state='SHOOT';a.syncWeapon(w,'fire',0,1);
assert.equal(a.upper,'MP5_UpperBody_Shooting01');assert.equal(a.lower,'Lower_body_Run01');
assert.equal(a.players[a.upper].speed,a.asset.clips[a.upper].duration/config.interval);
w.state='IDLE';a.syncWeapon(w,null,0,0);assert.equal(a.upper,'MP5_UpperBody_Idle01');
assert.equal(a.lower,'MP5_LowerBody_Idle01');assert.equal(a.action,null);
console.log('PlayerAnimations: spine aim pivot, reload progression, moving reload, resynchronization, ready/fire/idle transitions passed');
