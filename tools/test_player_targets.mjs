import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GameplayNavigation} from '../gameplay_navigation.js';
import {TEST_TARGET_SPECS,applyTargetDamage,calculatePlayerDamage,raycastHitboxes} from '../player_targets.js';

const config=JSON.parse(readFileSync(new URL('../AthenaModels/mp5_equipped.json',import.meta.url)));
const damage=calculatePlayerDamage(config);
assert.ok(Math.abs(damage-3.64)<1e-12,'MP5 damage must match WeaponController.GetDamageValWithAvatar');
assert.ok(Math.abs(calculatePlayerDamage(config,1.5)-5.46)<1e-12,'combo multiplier applies after shot damage');

const navigationData=JSON.parse(readFileSync(new URL(
    '../PS2Assets/SceneImports/COM2_NORMAL_1/Navigation/navmesh.json',import.meta.url)));
const navigation=new GameplayNavigation(navigationData);
const targets=TEST_TARGET_SPECS.map(spec=>{
    const navPoly=navigation.locate(spec.x,spec.z,-1,0);
    assert.ok(navPoly>=0,`target ${spec.id} must be placed on walkable ground`);
    return {...spec,y:navigation.height(navPoly,spec.x,spec.z),hp:100,damageTaken:0,hits:0,
        hitboxes:[
            {name:'TORSO',x:0,y:0.78,z:0,radius:0.48},
            {name:'HEAD',x:0,y:1.45,z:0,radius:0.27}
        ]};
});

const ray={x:-1,y:1.6,z:0,dx:0,dy:0,dz:1};
const head=raycastHitboxes(targets,ray,100,{});
assert.equal(head.target.id,'A');assert.equal(head.hitbox.name,'HEAD');
assert.ok(Math.abs(head.distance-6.73)<0.001);
assert.ok(Math.abs(Math.hypot(head.nx,head.ny,head.nz)-1)<1e-12);
assert.equal(raycastHitboxes(targets,{...ray,x:2},100,{}).target.id,'B',
    'off-axis aim selects the second target hitbox');
assert.equal(raycastHitboxes(targets,{...ray,y:0},100,{}),null,'misses outside the hitboxes');
assert.equal(raycastHitboxes(targets,ray,5,{}),null,'respects the ray distance limit');
const torsoHit=raycastHitboxes(targets,{...ray,y:1.0},100,{});
assert.equal(torsoHit.hitbox.name,'TORSO','lower aim selects the torso hitbox');
const stacked=[
    {...targets[0],id:'FAR',z:12,hp:100},
    {...targets[0],id:'NEAR',z:4,hp:100}
];
assert.equal(raycastHitboxes(stacked,ray,100,{}).target.id,'NEAR',
    'the nearest hitbox wins regardless of target array order');

assert.equal(applyTargetDamage(head,damage),3.64);
assert.equal(head.target.hp,96.36);assert.equal(head.target.hits,1);
assert.equal(head.target.damageTaken,3.64);
assert.equal(applyTargetDamage(head,200),96.36,'lethal damage clamps to remaining health');
assert.equal(head.target.hp,0);assert.equal(applyTargetDamage(head,damage),false);
assert.equal(raycastHitboxes(targets,ray,100,{}),null,'destroyed targets no longer block later shots');
assert.equal(applyTargetDamage(null,damage),false);

console.log('PlayerTargets: walkable dummy placement, head/torso hitboxes, direction, range and original damage passed');
