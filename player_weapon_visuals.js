// Original SightBeadScript behavior, in the TUI camera's 320-unit height.
export class PlayerSight {
    constructor(config) { this.config=config;this.reset(); }
    reset() { this.moving=false;this.locked=false;this.target=this.config.idleStretch;this.stretch=this.target; }
    update(dt,moving) {
        this.moving=moving;
        this.target=moving?this.config.runStretch:this.config.idleStretch;
        const delta=this.target-this.stretch,step=this.config.recovery*dt;
        this.stretch+=Math.max(-step,Math.min(step,delta));
    }
    sample(height,out,random=Math.random) {
        // AssaultRifleController samples the current disk before Stretch().
        const radius=Math.abs(this.stretch-this.target)*height/320*Math.sqrt(random());
        const angle=random()*Math.PI*2;
        out.x=Math.cos(angle)*radius;out.y=Math.sin(angle)*radius;
        return out;
    }
    kick() { this.stretch=Math.min(this.config.maxStretch,this.stretch+this.config.recoil); }
}

export function sampleCurve(keys,t) {
    if(!keys.length)return 1;
    if(t<=keys[0].time)return keys[0].value;
    for(let i=1;i<keys.length;i++)if(t<=keys[i].time){
        const a=keys[i-1],b=keys[i],dt=b.time-a.time,u=(t-a.time)/dt,u2=u*u,u3=u2*u;
        return (2*u3-3*u2+1)*a.value+(u3-2*u2+u)*dt*a.outSlope+
            (-2*u3+3*u2)*b.value+(u3-u2)*dt*b.inSlope;
    }
    return keys[keys.length-1].value;
}

function parameter(p,t,random) {
    if(p.mode===0)return p.max;
    if(p.mode===3)return p.min+(p.max-p.min)*random;
    const max=sampleCurve(p.maxCurve,t)*p.max;
    return p.mode===2?sampleCurve(p.minCurve,t)*p.min*(1-random)+max*random:max;
}
function alphaAt(keys,t) {
    for(let i=1;i<keys.length;i++)if(t<=keys[i][0]){
        const a=keys[i-1],b=keys[i],u=(t-a[0])/(b[0]-a[0]);
        return a[1]+(b[1]-a[1])*Math.max(0,u);
    }
    return keys[keys.length-1][1];
}
function lookup(table,t) {
    const index=Math.max(0,Math.min(table.length-1,t*(table.length-1))),a=Math.floor(index),b=Math.min(a+1,table.length-1);
    return table[a]+(table[b]-table[a])*(index-a);
}

// Bounded sprite pools: curves/materials/textures come from the Unity prefabs.
// Projection uses Camera3D in C; atlas quads are batched and alpha-blended by GS.
export class WeaponEffects {
    constructor(manifest) {
        this.config=manifest;this.sight=new PlayerSight(manifest.reticle);
        for(const effect of Object.values(manifest.effects))for(const layer of effect.layers){
            layer.sizeTable=new Float32Array(128);layer.alphaTable=new Float32Array(128);
            for(let i=0;i<128;i++){
                layer.sizeTable[i]=layer.sizeEnabled?parameter(layer.sizeCurve,i/127,0.5):1;
                layer.alphaTable[i]=alphaAt(layer.alpha,i/127);
            }
        }
        this.atlas=new Image(manifest.atlas);this.reticle=new Image(manifest.reticle.asset);
        this.atlas.filter=this.reticle.filter=1; // GS_FILTER_LINEAR
        if(!this.atlas.ready()||!this.reticle.ready()||!this.atlas.lock()||!this.reticle.lock())
            throw new Error('Original weapon FX atlas could not be made resident');
        this.particles=Array.from({length:16},()=>({active:false,sprite:{rect:[0,0,0,0]},draw:{}}));this.cursor=0;
        this.trails=Array.from({length:5},()=>({active:false,draw:{}}));this.trailCursor=0;
        this.flash={visible:false};this.tracer={visible:false};
        this.p={};this.q={};this.offset={};
        this.reticleDraw={width:0,height:0,startx:2,starty:2,endx:6,endy:18,angle:0,color:0};
        this.alphaBlend={a:Screen.SRC_RGB,b:Screen.DST_RGB,c:Screen.SRC_ALPHA,d:Screen.DST_RGB,fix:0};
        this.addBlend={a:Screen.SRC_RGB,b:Screen.ZERO_RGB,c:Screen.SRC_ALPHA,d:Screen.DST_RGB,fix:0};
        this.reset();
    }
    reset() {
        for(const p of this.particles)p.active=false;
        for(const t of this.trails)t.active=false;
        this.flash.visible=this.tracer.visible=false;this.sight.reset();
        this.flashTime=0;
    }
    clearMuzzle() { for(const p of this.particles)if(p.local)p.active=false;this.flash.visible=false; }
    update(dt,moving) {
        this.sight.update(dt,moving);this.flash.visible=this.tracer.visible=false;
        this.flashTime=Math.max(0,this.flashTime-dt);
        for(const p of this.particles)if(p.active){
            p.age+=dt;
            if(p.age>=p.life)p.active=false;
            if(p.active&&p.local)this.flash.visible=true;
        }
        for(const t of this.trails)if(t.active){
            t.age+=dt;if(t.age>t.duration)t.active=false;
            if(t.active)this.tracer.visible=true;
        }
    }
    emit(name,x,y,z,nx=0,ny=0,nz=1) {
        // One representative particle per original layer. The original bursts
        // are retained in the manifest; their full density is too costly on EE.
        for(const layer of this.config.effects[name].layers){
            const burst=layer.bursts[0];if(!burst)continue;
            const p=this.particles[this.cursor];this.cursor=(this.cursor+1)%this.particles.length;
            p.active=true;p.local=name==='muzzle';p.layer=layer;p.age=-burst.time;
            p.life=parameter(layer.lifetime,0,Math.random());p.size=parameter(layer.size,0,Math.random());
            p.rotation=parameter(layer.rotation,0,Math.random());p.random=Math.random();
            p.row=layer.uv.randomRow?Math.floor(Math.random()*layer.uv.rows):layer.uv.row;
            p.sprite.rotated=layer.sprite.rotated;
            const r=layer.sprite.rect,uv=layer.uv;
            for(let c=0;c<4;c++)p.sprite.rect[c]=r[c];
            if(uv.enabled&&uv.rowAnimation){
                const h=(r[3]-r[1])/uv.rows;
                p.sprite.rect[1]=r[1]+p.row*h;p.sprite.rect[3]=p.sprite.rect[1]+h;
            }
            p.draw.startx=p.sprite.rect[0]+0.5;p.draw.starty=p.sprite.rect[1]+0.5;
            p.draw.endx=p.sprite.rect[2]-0.5;p.draw.endy=p.sprite.rect[3]-0.5;
            p.draw.angle=p.rotation+(p.sprite.rotated?Math.PI*0.5:0);
            const color=layer.material.color;
            p.rgb=Math.min(255,Math.round(color[0]*256))|
                (Math.min(255,Math.round(color[1]*256))<<8)|(Math.min(255,Math.round(color[2]*256))<<16);
            const speed=parameter(layer.speed,0,Math.random()),angle=Math.random()*Math.PI*2;
            const spread=Math.sin(layer.coneAngle*Math.PI/180)*Math.sqrt(Math.random());
            // Cone around the impact normal, or the muzzle's local forward.
            let ux=-nz,uy=0,uz=nx,length=Math.hypot(ux,uz);
            if(length<1e-5){ux=1;uz=0;length=1;}
            ux/=length;uz/=length;
            const vx=ny*uz,vy=nz*ux-nx*uz,vz=-ny*ux;
            p.vx=(nx+spread*(ux*Math.cos(angle)+vx*Math.sin(angle)))*speed;
            p.vy=(ny+spread*(uy*Math.cos(angle)+vy*Math.sin(angle)))*speed;
            p.vz=(nz+spread*(uz*Math.cos(angle)+vz*Math.sin(angle)))*speed;
            p.x=x;p.y=y;p.z=z;
        }
    }
    fire(matrix,mx,my,mz,ex,ey,ez,hit) {
        this.muzzleMatrix=matrix;
        this.emit('muzzle',0,0,0);this.flash.visible=true;this.flashTime=0.1;
        if(hit)this.emit('impact',ex+hit.nx*0.015,ey+hit.ny*0.015,ez+hit.nz*0.015,hit.nx,hit.ny,hit.nz);
        const t=this.trails[this.trailCursor];this.trailCursor=(this.trailCursor+1)%this.trails.length;
        t.active=true;t.age=0;t.x=mx;t.y=my;t.z=mz;t.dx=ex-mx;t.dy=ey-my;t.dz=ez-mz;
        t.length=Math.hypot(t.dx,t.dy,t.dz);
        t.flight=t.length/this.config.effects.tracer.speed;
        t.duration=Math.min(1,t.flight+this.config.effects.tracer.trail.duration);
        this.tracer.visible=true;
    }
    drawEffects(camera,width,height) {
        const focal=height/(2*Math.tan(35*Math.PI/180));
        const previous=Screen.getParam(Screen.ALPHA_BLEND_EQUATION);
        const matrix=this.flash.visible?this.muzzleMatrix.toArray():null;
        for(const blend of ['alpha','add']){
        Screen.setParam(Screen.ALPHA_BLEND_EQUATION,blend==='alpha'?this.alphaBlend:this.addBlend);
        for(const p of this.particles)if(p.active&&p.age>=0){
            const l=p.layer,age=p.age/p.life;
            if(l.material.blend!==blend)continue;
            let x=p.x+p.vx*p.age,y=p.y+p.vy*p.age,z=p.z+p.vz*p.age;
            if(p.local){
                // RifleSparkItem applies -90deg X to the original emitter.
                const lx=-l.position[0]-x,ly=l.position[2]+z,lz=-l.position[1]-y,m=matrix;
                x=m[12]+m[0]*lx+m[4]*ly+m[8]*lz;
                y=m[13]+m[1]*lx+m[5]*ly+m[9]*lz;
                z=m[14]+m[2]*lx+m[6]*ly+m[10]*lz;
            }
            if(!camera.worldToScreen(x,y,z,this.p)||this.p.depth<0.1)continue;
            const size=p.size*lookup(l.sizeTable,age)*focal/this.p.depth;
            const alpha=lookup(l.alphaTable,age);
            const sprite=p.sprite,sourceRect=l.sprite.rect,uv=l.uv;
            if(uv.enabled&&!uv.rowAnimation){
                const total=uv.columns*uv.rows;
                const frame=Math.min(total-1,Math.floor((parameter(uv.frame,age,p.random)*uv.cycles%1)*total));
                const row=uv.rowAnimation?p.row:Math.floor(frame/uv.columns),col=frame%uv.columns;
                const sw=(sourceRect[2]-sourceRect[0])/uv.columns,sh=(sourceRect[3]-sourceRect[1])/uv.rows;
                sprite.rect[0]=sourceRect[0]+col*sw;sprite.rect[1]=sourceRect[1]+row*sh;
                sprite.rect[2]=sprite.rect[0]+sw;sprite.rect[3]=sprite.rect[1]+sh;
                p.draw.startx=sprite.rect[0]+0.5;p.draw.starty=sprite.rect[1]+0.5;
                p.draw.endx=sprite.rect[2]-0.5;p.draw.endy=sprite.rect[3]-0.5;
            }
            // Rotation and corner construction run in Image's native draw path.
            p.draw.width=size;p.draw.height=size*(l.renderMode===1?l.lengthScale:1);
            p.draw.color=p.rgb|(Math.min(128,Math.round(l.material.color[3]*alpha*256))<<24);
            this.atlas.draw(this.p.x-p.draw.width*0.5,this.p.y-p.draw.height*0.5,p.draw);
        }
        }
        const trail=this.config.effects.tracer.trail;
        Screen.setParam(Screen.ALPHA_BLEND_EQUATION,this.addBlend);
        for(const t of this.trails)if(t.active){
            const end=Math.min(1,t.age/t.flight),begin=Math.max(0,(t.age-trail.duration)/t.flight);
            if(end<=begin)continue;
            const ax=t.x+t.dx*begin,ay=t.y+t.dy*begin,az=t.z+t.dz*begin;
            const bx=t.x+t.dx*end,by=t.y+t.dy*end,bz=t.z+t.dz*end;
            if(!camera.worldToScreen(ax,ay,az,this.p)||!camera.worldToScreen(bx,by,bz,this.q))continue;
            const dx=this.q.x-this.p.x,dy=this.q.y-this.p.y;
            const o=t.draw,r=trail.sprite.rect,c=trail.material.color;
            o.width=Math.max(1,0.1*focal/this.q.depth);o.height=Math.hypot(dx,dy);
            o.startx=r[0]+0.5;o.starty=r[1]+0.5;o.endx=r[2]-0.5;o.endy=r[3]-0.5;
            o.angle=Math.atan2(dy,dx)-Math.PI*0.5;
            o.color=0x00ffffff|(Math.round(c[3]*128*Math.max(0,1-t.age/t.duration))<<24);
            this.atlas.draw((this.p.x+this.q.x-o.width)*0.5,(this.p.y+this.q.y-o.height)*0.5,o);
        }
        Screen.setParam(Screen.ALPHA_BLEND_EQUATION,previous);
    }
    drawReticle(width,height) {
        const previous=Screen.getParam(Screen.ALPHA_BLEND_EQUATION);
        Screen.setParam(Screen.ALPHA_BLEND_EQUATION,this.alphaBlend);
        const sight=this.config.reticle,scale=height/320,d=(sight.baseDistance+this.sight.stretch)*scale;
        const color=this.sight.locked?sight.lockColor:sight.color;
        const o=this.reticleDraw;
        o.width=sight.size[0]*scale;o.height=sight.size[1]*scale;
        o.color=Math.round(color[0]*128)|(Math.round(color[1]*128)<<8)|(Math.round(color[2]*128)<<16)|(Math.round(color[3]*128)<<24);
        o.angle=0;this.reticle.draw((width-o.width)*0.5,(height-o.height)*0.5-d,o);
        o.angle=Math.PI*0.5;this.reticle.draw((width-o.width)*0.5+d,(height-o.height)*0.5,o);
        o.angle=-Math.PI*0.5;this.reticle.draw((width-o.width)*0.5-d,(height-o.height)*0.5,o);
        o.angle=Math.PI;this.reticle.draw((width-o.width)*0.5,(height-o.height)*0.5+d,o);
        Screen.setParam(Screen.ALPHA_BLEND_EQUATION,previous);
    }
    draw(camera,width,height) {
        this.drawEffects(camera,width,height);
        this.drawReticle(width,height);
    }
}
