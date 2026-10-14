import assert from 'node:assert/strict';
import {resolveCameraPosition,stepCameraFov} from '../player_camera.js';

assert.equal(stepCameraFov(70,true,1/60),68);
assert.equal(stepCameraFov(70,true,1),50);
assert.equal(stepCameraFov(50,false,1/60),52);
assert.equal(stepCameraFov(50,false,1),70);
assert.equal(stepCameraFov(61,true,-1),61);

function scratch() {
    return {origin:new Float32Array(3),direction:new Float32Array(3),
        position:new Float32Array(3),sweepHit:{},rayHit:{}};
}
function fakeWorld(sweepDistance,rayDistance) {
    return {
        sphereCast(origin,radius,direction,distance,options,out) {
            assert.equal(radius,0.18);assert.equal(distance,4);
            if(sweepDistance===null)return null;
            out.distance=sweepDistance;return out;
        },
        raycast(origin,direction,distance,options,out) {
            if(rayDistance===null)return null;
            out.distance=rayDistance;return out;
        }
    };
}
const origin=[0,0,0],desired=[0,0,-4];
let position=resolveCameraPosition(fakeWorld(null,null),origin,desired,0.18,scratch());
assert.deepEqual(Array.from(position),desired,'unobstructed camera keeps its shoulder offset');
position=resolveCameraPosition(fakeWorld(1.5,1.1),origin,desired,0.18,scratch());
assert.ok(Math.abs(position[2]+0.89)<1e-6,'nearest wall hit keeps camera radius and clearance');
position=resolveCameraPosition(fakeWorld(null,1.1),origin,desired,0.18,scratch());
assert.ok(Math.abs(position[2]+0.89)<1e-6,'two-sided ray catches back-facing camera walls');
position=resolveCameraPosition(fakeWorld(0.05,null),origin,desired,0.18,scratch());
assert.ok(Math.abs(position[2]+0.02)<1e-6,'camera does not pass through an immediate wall');
position=resolveCameraPosition(fakeWorld(null,null),origin,origin,0.18,scratch());
assert.deepEqual(Array.from(position),origin,'zero-length camera offset is stable');
console.log('PlayerCamera: firing zoom, recovery, sphere sweep and two-sided wall obstruction passed');
