import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GameplayNavigation} from '../gameplay_navigation.js';

const data = JSON.parse(fs.readFileSync(new URL('../PS2Assets/SceneImports/COM2_NORMAL_1/Navigation/navmesh.json', import.meta.url)));
const nav = new GameplayNavigation(data);

function legacyContains(x, z, polygon) {
    let inside = false;
    let previous = data.vertices[polygon.v.at(-1)];
    for (const vertex of polygon.v) {
        const current = data.vertices[vertex];
        const dx = current[0] - previous[0], dz = current[2] - previous[2];
        const cross = (x - previous[0]) * dz - (z - previous[2]) * dx;
        const projection = (x - previous[0]) * dx + (z - previous[2]) * dz;
        if (Math.abs(cross) < 0.0001 && projection >= -0.0001 && projection <= dx*dx+dz*dz+0.0001) return true;
        if ((current[2] > z) !== (previous[2] > z) &&
            x < (previous[0]-current[0])*(z-current[2])/(previous[2]-current[2])+current[0]) inside = !inside;
        previous = current;
    }
    return inside;
}
function legacyHeight(index, x, z) {
    const polygon = data.polygons[index], first = data.vertices[polygon.v[0]];
    for (let i = 1; i < polygon.v.length - 1; i++) {
        const second = data.vertices[polygon.v[i]], third = data.vertices[polygon.v[i+1]];
        const denominator = (second[2]-third[2])*(first[0]-third[0])+(third[0]-second[0])*(first[2]-third[2]);
        if (Math.abs(denominator) < 0.000001) continue;
        const a = ((second[2]-third[2])*(x-third[0])+(third[0]-second[0])*(z-third[2]))/denominator;
        const b = ((third[2]-first[2])*(x-third[0])+(first[0]-third[0])*(z-third[2]))/denominator;
        const c = 1-a-b;
        if (a >= -0.001 && b >= -0.001 && c >= -0.001) return a*first[1]+b*second[1]+c*third[1];
    }
    return polygon.c[1];
}
function legacyLocate(x, z, preferred, y) {
    if (preferred >= 0 && preferred < data.polygons.length) {
        if (legacyContains(x,z,data.polygons[preferred])) return preferred;
        for (const edge of data.polygons[preferred].n) if (legacyContains(x,z,data.polygons[edge[0]])) return edge[0];
    }
    let best = -1, delta = Infinity;
    for (let i = 0; i < data.polygons.length; i++) {
        if (i === preferred || !legacyContains(x,z,data.polygons[i])) continue;
        const d = Math.abs(legacyHeight(i,x,z)-y);
        if (d < delta) {best = i; delta = d;}
    }
    return best;
}

test('spatial lookup matches the previous scan at centres, vertices, boundaries and outside the map', () => {
    const samples = [...data.vertices, ...data.polygons.map(p => p.c)];
    for (let x=-16; x<=72; x+=2.5) for (let z=-32; z<=36; z+=2.5) samples.push([x,0,z]);
    for (const p of data.polygons) for (const vertex of p.v) {
        const v=data.vertices[vertex];
        samples.push([v[0]+1e-5,v[1],v[2]-1e-5]);
    }
    for (const [x,y,z] of samples) {
        for (const preferred of [-1, 0, 11, 38]) {
            assert.equal(nav.locate(x,z,preferred,y), legacyLocate(x,z,preferred,y), `${x},${z} preferred ${preferred}`);
        }
    }
});

test('compiled heights preserve slopes, flat floors and triangle fallback', () => {
    for (let i=0;i<data.polygons.length;i++) {
        const p=data.polygons[i];
        for (const [x,,z] of [p.c,...p.v.map(v=>data.vertices[v]), [p.c[0]+0.01,0,p.c[2]-0.01]]) {
            assert.ok(Math.abs(nav.height(i,x,z)-legacyHeight(i,x,z)) < 1e-9);
        }
    }
});

test('shared flow field gives optimal acyclic routes for every pair of polygons', () => {
    const n=data.polygons.length, reference=new Float64Array(n*n);
    reference.fill(Infinity);
    for (let i=0;i<n;i++) {
        reference[i*n+i]=0;
        for (const [j] of data.polygons[i].n) {
            const a=data.polygons[i].c,b=data.polygons[j].c;
            reference[i*n+j]=Math.hypot(a[0]-b[0],a[2]-b[2]);
        }
    }
    // Independent all-pairs solver, including directed links and disconnected areas.
    for (let k=0;k<n;k++) for (let i=0;i<n;i++) for (let j=0;j<n;j++) {
        const d=reference[i*n+k]+reference[k*n+j];
        if (d < reference[i*n+j]) reference[i*n+j]=d;
    }
    for (let goal=0;goal<n;goal++) {
        assert.equal(nav.setGoal(goal),true);
        const builds=nav.builds;
        assert.equal(nav.setGoal(goal),false);
        assert.equal(nav.builds,builds);
        for (let start=0;start<n;start++) {
            const expected=reference[start*n+goal];
            if (!Number.isFinite(expected)) {assert.equal(nav.next[start],-1);continue;}
            assert.ok(Math.abs(nav.distances[start]-expected)<1e-8);
            let current=start, steps=0;
            while (current!==goal) {
                const next=nav.next[current];
                assert.ok(data.polygons[current].n.some(e=>e[0]===next));
                current=next;
                assert.ok(++steps<=n,'route cycle');
            }
        }
    }
    nav.setGoal(-1);
    assert.ok(nav.next.every(v=>v===-1));
});
