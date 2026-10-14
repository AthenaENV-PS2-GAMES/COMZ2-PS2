/**
 * AthenaEnv global JavaScript helpers.
 *
 * These declarations describe the globals available to every AthenaEnv
 * script. They are provided for editor completion and do not require imports.
 *
 * Example:
 * ```js
 * console.log('Loading game');
 * const handle = setTimeout(() => console.log('Ready'), 1000);
 * clearTimeout(handle);
 * ```
 */

declare namespace console {
    /** Writes an informational message to the EE console. */
    function log(...args: any[]): void;
    /** Writes a warning message to the EE console. */
    function warn(...args: any[]): void;
    /** Writes an error message to the EE console. */
    function error(...args: any[]): void;
}

/** Schedules a one-shot callback after `timeout` milliseconds. */
declare function setTimeout(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
/** Schedules a callback repeatedly using the event-loop timer queue. */
declare function setInterval(handler: (...args: any[]) => void, timeout?: number, ...args: any[]): any;
/** Cancels a timeout created by setTimeout. */
declare function clearTimeout(handle?: any): void;
/** Cancels an interval created by setInterval. */
declare function clearInterval(handle?: any): void;
/** Schedules a callback as soon as the event loop becomes idle. */
declare function setImmediate(handler: (...args: any[]) => void, ...args: any[]): any;
/** Cancels a callback created by setImmediate. */
declare function clearImmediate(handle?: any): void;

/**
 * QuickJS's `std` module (global). Only AthenaEnv's additions are declared
 * here; see the QuickJS documentation for the rest.
 */
declare namespace std {
    interface ReloadOptions {
        /**
         * Script to come back to when the new one ends, throws, or the player
         * holds SELECT+START on the pad in port 1 for a second. Used by
         * launchers such as `bin/tests/index.js`.
         */
        returnTo?: string;
    }

    interface LastRun {
        /** Path of the previous script, as it was started. */
        script: string;
        /**
         * `finished`: ended normally; `error`: threw or could not be loaded;
         * `exited`: left with SELECT+START; `reloaded`: called `std.reload()`.
         */
        status: "finished" | "error" | "exited" | "reloaded";
        /** Message and stack trace when `status` is `error`. */
        error?: string;
        /**
         * What the script printed with `console.log`/`print`, plus errors the
         * runtime reported (such as unhandled promise rejections): its last
         * 16 KiB, whole lines, starting with `[earlier output dropped]` when cut.
         */
        output: string;
    }

    /**
     * Ends the running script and starts `script` in a new JavaScript VM,
     * without restarting the ELF. Nothing after the call runs, and it cannot
     * be caught. Throws (catchably) when `script` cannot be opened.
     */
    function reload(script: string, options?: ReloadOptions): never;
    /** How the previous script ended, or null for the first script. */
    function lastRun(): LastRun | null;

    /** Runs the garbage collector. */
    function gc(): void;
    /** Contents of a UTF-8 text file, or null when it cannot be read. */
    function loadFile(path: string): string | null;
    /** Evaluates a script file in the global scope. */
    function loadScript(path: string): any;
}


/* === Module: Loop (loop) === */
/**
 * Game loop driven by the runtime.
 *
 * `Loop.run()` registers the frame handlers and returns immediately; frames
 * start once the entry script finishes. Each frame clears the screen, runs
 * `update` and `draw`, then flips. Timers, promises and async functions keep
 * running between frames, and the frame rate follows VSync.
 *
 * Variable step: `update(dt)` runs once per frame with the time since the
 * previous frame, in seconds.
 * ```js
 * let x = 0;
 * Loop.run(dt => {
 *     x += 120 * dt; // 120 pixels per second at any frame rate
 *     Draw.rect(x, 200, 32, 32, Color.new(255, 255, 255));
 * });
 * ```
 *
 * Fixed step: `update(step)` runs zero or more times per frame with the same
 * `step`, as physics engines expect, and `draw(alpha)` once per frame.
 * ```js
 * Loop.run({
 *     update(step) { world.step(step, 4); },
 *     draw(alpha) { Box2DDraw.draw(world); },
 * }, { fixedStep: 1 / 60 });
 * ```
 */
declare namespace Loop {
    /** Frame handlers. `this` inside them is the handlers object. */
    interface Handlers {
        /**
         * Advances the game. Receives the scaled frame delta in seconds, or
         * `fixedStep` when set; the first frame's delta is `0`.
         */
        update?(dt: number): void;
        /**
         * Draws the frame after the updates. With `fixedStep`, `alpha` (0..1)
         * is the fraction of a step not simulated yet, to interpolate
         * between the previous and the current state; otherwise it is `1`.
         */
        draw?(alpha: number): void;
    }

    interface Options {
        /** Clears the screen before each frame. Defaults to `true`. */
        clear?: boolean;
        /** Packed RGBA color used to clear. Defaults to opaque black. */
        clearColor?: number;
        /**
         * Longest real frame time counted, in seconds; longer stalls such as
         * loading are cut to it. `0` disables the limit. Defaults to `0.25`.
         */
        maxDelta?: number;
        /**
         * Runs `update` with this constant step, in seconds, as many times as
         * the elapsed time holds. `0`, the default, runs it once per frame
         * with the frame delta.
         */
        fixedStep?: number;
        /**
         * Fixed steps per frame at most; the time beyond it is dropped so a
         * slow frame cannot snowball. Defaults to `5`.
         */
        maxSteps?: number;
        /**
         * Vertical blanks per frame: `2` holds a steady 30 FPS on NTSC and
         * 25 FPS on PAL. Defaults to `1`.
         */
        vsyncInterval?: number;
    }

    interface Stats {
        /** Frames per second, measured over the last second. */
        fps: number;
        /** Real duration of the last frame in milliseconds, capped by `maxDelta`. */
        frameMs: number;
        /**
         * Milliseconds of work in the last frame: from the previous flip up to
         * this one, timers and promises included, without the VSync wait.
         */
        cpuMs: number;
        /** `update` calls in the last frame. */
        steps: number;
        /** Interpolation factor passed to the last `draw`. */
        alpha: number;
    }

    /**
     * Starts the loop. A function is the same as `{ update: fn }`. Called
     * again, even from a handler, it replaces the handlers and options without
     * restarting the frame timing; the rest of the current frame is skipped.
     * An exception thrown by a handler stops the program.
     */
    function run(handlers: ((dt: number) => void) | Handlers, options?: Options): void;
    /**
     * Stops the loop after the current frame; the program ends once no timers
     * remain. Registered systems stay registered and run again with the next
     * `Loop.run()`.
     */
    function stop(): void;
    /** Returns whether the loop is running. */
    function isRunning(): boolean;
    /**
     * Scales the time passed to `update`: `0.5` is slow motion and `0`
     * pauses the game. At `0`, a variable-step `update` still runs with a
     * delta of `0`, and a fixed-step one does not run. `draw` always runs.
     */
    function setTimeScale(scale: number): void;
    /** Returns the time scale; `1` by default. */
    function getTimeScale(): number;
    /** Returns the scaled delta of the current frame, in seconds. */
    function getDeltaTime(): number;
    /** Returns the scaled time since the loop started, in seconds. */
    function getElapsedTime(): number;
    /** Returns the real time since the loop started, in seconds, ignoring the time scale. */
    function getRealElapsedTime(): number;
    /** Returns the number of frames since the loop started. */
    function getFrameCount(): number;
    /** Returns the frame statistics of the last frame. */
    function getStats(): Stats;

    /**
     * A system: per-frame work that a module or the game registers once, and
     * that runs around the `update` and `draw` handlers of `Loop.run()` for as
     * long as the loop runs, surviving `Loop.run()` replacements and
     * `Loop.stop()`. Each frame runs, in order:
     *
     * 1. `preUpdate(dt)` of every system, once;
     * 2. `update(step)` of every system, then the `update` handler: once with
     *    `dt`, or once per fixed step with `fixedStep`;
     * 3. `postUpdate(dt)` of every system, once;
     * 4. `preDraw(alpha)`, the `draw` handler, then `postDraw(alpha)`, for
     *    overlays such as debug information or screen transitions.
     *    `postDraw` runs whenever `preDraw` did, even if `draw` stopped the
     *    loop, so a system can close what it opened (Camera2D's view).
     *
     * Within a phase, systems run by ascending `priority`, then in the order
     * they were added. `this` is the system object. An exception thrown by a
     * system stops the program, as one thrown by a handler.
     */
    interface System {
        /** Unique name, for `removeSystem()` and `getSystems()`. */
        name?: string;
        /** Lower runs first. Integer; defaults to `0`. */
        priority?: number;
        /**
         * `preUpdate` and `postUpdate` receive the real delta, ignoring
         * `setTimeScale()`: for menus and transitions that keep moving while
         * the game is paused. Defaults to `false`.
         */
        realTime?: boolean;
        preUpdate?(dt: number): void;
        /** Same cadence and argument as the `update` handler. */
        update?(step: number): void;
        postUpdate?(dt: number): void;
        preDraw?(alpha: number): void;
        postDraw?(alpha: number): void;
    }

    /** A registered system, as listed by `getSystems()`. */
    interface SystemInfo {
        name: string | undefined;
        priority: number;
        realTime: boolean;
        /** Phases the system runs in, e.g. `["update", "postDraw"]`. */
        phases: Array<"preUpdate" | "update" | "postUpdate" | "preDraw" | "postDraw">;
        /** True for systems registered by native modules. */
        native: boolean;
    }

    /**
     * Registers a system and returns it. Its methods are read now: replacing
     * them later has no effect until it is added again. A system added during
     * a frame starts with the next phase. Throws when the object has no phase
     * method, was already added, or its name is taken.
     *
     * @example
     * ```js
     * const flash = Loop.addSystem({
     *     name: "flash",
     *     priority: 100,
     *     alpha: 128,              // 0x80 is opaque on the GS
     *     postUpdate(dt) { this.alpha = Math.max(0, this.alpha - 256 * dt); },
     *     postDraw() { Draw.rect(0, 0, 640, 448, Color.new(255, 255, 255, this.alpha)); },
     * });
     * ```
     */
    function addSystem<T extends System>(system: T): T;
    /**
     * Unregisters a system, given the object or its name. Returns whether it
     * was registered. A system removed during a phase does not run again.
     */
    function removeSystem(system: System | string): boolean;
    /** Registered systems, in run order. */
    function getSystems(): SystemInfo[];
}


/* === Module: Vector (vector) === */
/**
 * PS2-aligned vector types.
 *
 * `Vector2`, `Vector3` and `Vector4` are separate JavaScript classes exposed
 * by the `Vector` module. Arithmetic methods return new vectors and do not
 * mutate their operands. `div()` rejects zero components.
 *
 * Example:
 * ```js
 * import * as Vector from 'Vector';
 * const direction = new Vector.Vector3(3, 4, 0);
 * console.log(direction.norm());
 * const right = direction.cross(new Vector.Vector3(0, 0, 1));
 * ```
 */
declare class Vector2 {
    /** Creates a two-component vector. */
    constructor(x: number, y: number);
    /** Horizontal component. */
    x: number;
    /** Vertical component. */
    y: number;
    /** Returns Euclidean length. */
    norm(): number;
    /** Returns the dot product. */
    dot(value: Vector2): number;
    /** Returns Euclidean distance to another vector. */
    distance(value: Vector2): number;
    /** Returns squared distance without taking a square root. */
    distance2(value: Vector2): number;
    /** Returns the component-wise sum. */
    add(value: Vector2): Vector2;
    /** Returns the component-wise difference. */
    sub(value: Vector2): Vector2;
    /** Returns the component-wise product. */
    mul(value: Vector2): Vector2;
    /** Returns the component-wise quotient; zero divisors throw. */
    div(value: Vector2): Vector2;
    /** Returns a readable component representation. */
    toString(): string;
}

declare class Vector3 {
    /** Creates a three-component vector. */
    constructor(x: number, y: number, z: number);
    /** X component. */
    x: number;
    /** Y component. */
    y: number;
    /** Z component. */
    z: number;
    /** Returns Euclidean length. */
    norm(): number;
    /** Returns the dot product. */
    dot(value: Vector3): number;
    /** Returns the 3D cross product. */
    cross(value: Vector3): Vector3;
    /** Returns Euclidean distance to another vector. */
    distance(value: Vector3): number;
    /** Returns squared distance without taking a square root. */
    distance2(value: Vector3): number;
    /** Returns the component-wise sum. */
    add(value: Vector3): Vector3;
    /** Returns the component-wise difference. */
    sub(value: Vector3): Vector3;
    /** Returns the component-wise product. */
    mul(value: Vector3): Vector3;
    /** Returns the component-wise quotient; zero divisors throw. */
    div(value: Vector3): Vector3;
    /** Returns a readable component representation. */
    toString(): string;
}

declare class Vector4 {
    /** Creates a homogeneous four-component vector. */
    constructor(x: number, y: number, z: number, w: number);
    /** X component. */
    x: number;
    /** Y component. */
    y: number;
    /** Z component. */
    z: number;
    /** Homogeneous component: commonly 1 for points and 0 for directions. */
    w: number;
    /** Returns four-dimensional Euclidean length. */
    norm(): number;
    /** Returns the four-component dot product. */
    dot(value: Vector4): number;
    /** Returns the cross product with homogeneous component cleared. */
    cross(value: Vector4): Vector4;
    /** Returns Euclidean distance to another vector. */
    distance(value: Vector4): number;
    /** Returns squared distance without taking a square root. */
    distance2(value: Vector4): number;
    /** Returns the component-wise sum. */
    add(value: Vector4): Vector4;
    /** Returns the component-wise difference. */
    sub(value: Vector4): Vector4;
    /** Returns the component-wise product. */
    mul(value: Vector4): Vector4;
    /** Returns the component-wise quotient; zero divisors throw. */
    div(value: Vector4): Vector4;
    /** Returns a readable component representation. */
    toString(): string;
}


/* === Module: Matrix4 (matrix4) === */
/**
 * Four-by-four transformation matrix using the PS2/AthenaEnv layout.
 *
 * Values are stored in column-major order. Translation components are at
 * indices 12, 13 and 14; index 15 is the homogeneous component.
 *
 * Example:
 * ```js
 * const transform = new Matrix4();
 * transform.set(12, 10).set(13, 20).set(14, 30);
 * const inverse = transform.clone().invert();
 * console.log(inverse.get(12), inverse.get(13), inverse.get(14));
 * ```
 */
declare class Matrix4 {
    /** Creates identity matrix, or initializes all 16 values when supplied. */
    constructor();
    constructor(
        m00: number, m01: number, m02: number, m03: number,
        m10: number, m11: number, m12: number, m13: number,
        m20: number, m21: number, m22: number, m23: number,
        m30: number, m31: number, m32: number, m33: number
    );
    /** Number of scalar components in the matrix. */
    readonly length: 16;
    /** Reads a scalar component at index 0..15. */
    get(index: number): number;
    /** Writes a scalar component at index 0..15 and returns this matrix. */
    set(index: number, value: number): this;
    /** Compares all 16 components exactly. */
    equals(value: Matrix4): boolean;
    /** Compares all components using an absolute epsilon tolerance. */
    equalsEpsilon(value: Matrix4, epsilon: number): boolean;
    /** Returns the 16 components as a new array. */
    toArray(): number[];
    /** Copies 16 values from an array-like object into this matrix. */
    fromArray(values: ArrayLike<number>): this;
    /** Returns an independent copy of this matrix. */
    clone(): Matrix4;
    /** Copies another matrix into this matrix. */
    copy(value: Matrix4): this;
    /** Returns this * value (column vectors); neither operand is mutated. */
    multiply(value: Matrix4): Matrix4;
    /** Replaces this matrix with identity. */
    identity(): this;
    /** Transposes this matrix in place. */
    transpose(): this;
    /** Inverts this matrix in place; throws for a singular matrix. */
    invert(): this;
    /** Returns a readable 16-value representation. */
    toString(): string;
}


/* === Module: Quaternion (quaternion) === */
/** Right-handed, normalized xyzw rotation. Angles are radians.
 * Mutating methods return this; operands are unchanged; dispose is idempotent. */
declare namespace Quaternion {
    class Quaternion {
        constructor();
        constructor(x: number, y: number, z: number, w: number);
        setAxisAngle(x: number, y: number, z: number, radians: number): this;
        /** Euler radians composed as Rz * Ry * Rx (x applied first). */
        setEuler(x: number, y: number, z: number): this;
        /** Sets this = this * other. */
        multiply(other: Quaternion): this;
        /** Shortest path toward other, t in [0,1]. */
        slerp(other: Quaternion, t: number): this;
        /** Independent snapshot. */
        toArray(): [number, number, number, number];
        dispose(): void;
    }
}


/* === Module: Camera3D (camera3d) === */
/** Independent cameras; right-handed, facing -Z. Projection has reversed depth.
 * Matrix getters return an owned snapshot, or overwrite and return out. */
declare namespace Camera3D {
    interface Projection { fovYDegrees?: number; aspect?: number; near?: number; far?: number; }
    /** Screen position in viewport pixels (origin top-left, y down) and the
     * distance in front of the camera along its view axis. */
    interface ScreenPoint { x: number; y: number; depth: number; }
    /** World-space ray: origin (x, y, z) and unit direction (dx, dy, dz). */
    interface Ray { x: number; y: number; z: number; dx: number; dy: number; dz: number; }
    class Camera {
        /** Defaults: position [0,0,5], target [0,0,0], up [0,1,0], FOV 60, aspect 4/3, near .1, far 300. */
        constructor(options?: Projection);
        setProjection(options: Projection): this;
        setPosition(x: number, y: number, z: number): this;
        lookAt(x: number, y: number, z: number): this;
        setUp(x: number, y: number, z: number): this;
        getView(out?: Matrix4): Matrix4;
        getProjection(out?: Matrix4): Matrix4;
        getViewProjection(out?: Matrix4): Matrix4;
        /** Viewport in pixels used by worldToScreen/screenToRay; default 640x448.
         * Match the Screen mode, e.g. `camera.setViewport(mode.width, mode.height)`. */
        setViewport(width: number, height: number): this;
        /** Projects a world point to the viewport: null when it is behind the
         * camera. Points outside the screen or beyond near/far still project
         * (check x/y against the viewport and depth against near/far).
         * Optional `out` is reused and returned. */
        worldToScreen<T extends object = ScreenPoint>(x: number, y: number, z: number, out?: T): (T & ScreenPoint) | null;
        /** The ray from the camera through a viewport pixel, e.g. for
         * Scene3D.Scene.raycast(). Optional `out` is reused and returned. */
        screenToRay<T extends object = Ray>(x: number, y: number, out?: T): T & Ray;
        /** Idempotent; other operations reject a disposed camera. */
        dispose(): void;
    }
}


/* === Module: Lights (lights) === */
/** Independent linear RGB lights. World directions point toward the source.
 * Point lights (4 slots) light per vertex and fade with the distance as
 * (1 - d^2 / range^2)^2, reaching 0 at range. */
declare namespace Lights {
    const MAX_DIRECTIONAL: 4;
    const MAX_POINT: 4;
    class Set {
        /** Starts with black ambient and all four directional slots disabled. */
        constructor();
        /** Changes only when effective state changes; invalid setters are atomic. */
        readonly revision: number;
        setAmbient(r: number, g: number, b: number): this;
        /** Slots 0..3; nonzero direction normalized in native code. RGB in [0,1]. */
        setDirectional(slot: number, x: number, y: number, z: number, r: number, g: number, b: number): this;
        disable(slot: number): this;
        /** Slots 0..3: a world position, RGB in [0,1] and a range > 0. */
        setPoint(slot: number, x: number, y: number, z: number, r: number, g: number, b: number, range: number): this;
        disablePoint(slot: number): this;
        /** Distance fog, applied by the GS to everything drawn with this set:
         * full colour up to start, the fog colour from end on (view depth).
         * 0 <= start < end, RGB in [0,1]. Ignored with 32-bit Z buffers. */
        setFog(start: number, end: number, r: number, g: number, b: number): this;
        disableFog(): this;
        clear(): this;
        dispose(): void;
    }
}


/* === Module: Image (image) === */
/**
 * Image loading, CPU pixel access and textured 2D drawing.
 *
 * `Image` accepts paths understood by the active PS2 filesystem driver,
 * including paths relative to the boot directory. A newly loaded image is
 * CPU-resident; call `lock()` when it must remain resident in VRAM.
 *
 * Pixel buffers use the image's current `bpp` and dimensions. For 32-bit
 * images, `pixels` contains four bytes per pixel. Palette data is used only
 * by indexed 4-bit and 8-bit formats.
 *
 * Some Images borrow a texture owned by another object, such as
 * `Video.frame`. Their storage cannot be replaced: setting `pixels`,
 * `palette`, `bpp`, `texWidth` or `texHeight` throws a TypeError and
 * `optimize()` returns false.
 *
 * @example
 * ```js
 * const logo = new Image('my_image.png');
 * if (!logo.ready()) throw new Error('image load failed');
 * logo.color = Color.new(255, 255, 255, 255);
 * logo.lock();
 * logo.draw(100, 80);
 * Screen.flip();
 * ```
 */

/** Optional destination, source-rectangle and tint overrides for `draw()`. */
type ImageDrawOptions = {
    /** Destination width in pixels; defaults to `width`. */
    width?: number;
    /** Destination height in pixels; defaults to `height`. */
    height?: number;
    /** Source rectangle's left coordinate in texture pixels. */
    startx?: number;
    /** Source rectangle's top coordinate in texture pixels. */
    starty?: number;
    /** Source rectangle's right coordinate in texture pixels. */
    endx?: number;
    /** Source rectangle's bottom coordinate in texture pixels. */
    endy?: number;
    /** Rotation angle in radians. */
    angle?: number;
    /**
     * Pivot of `angle`, in destination pixels from the sprite's top-left corner
     * (so `width / 2`, `height / 2` is the default center). An omitted axis
     * keeps its center. Has no effect without an angle.
     */
    originX?: number;
    originY?: number;
    /** Packed RGBA tint, normally created with `Color.new()`. */
    color?: number;
    /** Mirrors the sprite horizontally, by swapping `startx` and `endx`. */
    flipX?: boolean;
    /** Mirrors the sprite vertically, by swapping `starty` and `endy`. */
    flipY?: boolean;
};

/** Options of `drawNinePatch()`: margins are in source texels. */
type ImageNinePatchOptions = {
    /** Source rectangle; default to the image's `startx`..`endy`. */
    startx?: number;
    starty?: number;
    endx?: number;
    endy?: number;
    /** Margin of all four sides; `left`, `top`, `right` and `bottom` override it. Defaults to 0. */
    corner?: number;
    left?: number;
    top?: number;
    right?: number;
    bottom?: number;
    /** Destination size of a margin texel (corners are margin * scale); defaults to 1. */
    scale?: number;
    /** Packed RGBA tint; defaults to the image's `color`. */
    color?: number;
    /** Draws the middle cell; defaults to true. */
    center?: boolean;
};

/** Options of `drawList()`. */
type ImageDrawListOptions = {
    /** Offset added to every sprite; defaults to 0. */
    x?: number;
    y?: number;
    /** First record to draw; defaults to 0. */
    first?: number;
    /** Records to draw; defaults to the rest of the buffer. */
    count?: number;
};

/** Options controlling image creation and texture upload behavior. */
type ImageOptions = {
    /** Whether texture uploads use the deferred VIF1 path; defaults to true. */
    delayed?: boolean;
};

declare class Image {
    /** Loads an image from `path`, or creates an empty image when omitted. */
    constructor(options?: ImageOptions);
    constructor(path: string, options?: ImageOptions);
    /** Linear size in bytes of the current pixel buffer. */
    readonly size: number;
    /** Whether texture uploads use the deferred VIF1 path. */
    readonly delayed: boolean;
    /** CPU pixel buffer; assigning it copies the supplied `ArrayBuffer`. */
    pixels: ArrayBuffer;
    /** CPU palette buffer for indexed images; required for indexed images. */
    palette: ArrayBuffer;
    /** Texture width in pixels (1..1024); changing it discards pixels and VRAM. */
    texWidth: number;
    /** Texture height in pixels (1..1024); changing it discards pixels and VRAM. */
    texHeight: number;
    /** Pixel storage format: 4, 8, 16, 24 or 32 bits per pixel; changing it discards storage. */
    bpp: number;
    /** Texture filter mode; must be GS_FILTER_NEAREST or GS_FILTER_LINEAR. */
    filter: number;
    /** Whether dimensions and a valid pixel buffer are available for drawing. */
    renderable: boolean;
    /** Destination draw width in pixels. */
    width: number;
    /** Destination draw height in pixels. */
    height: number;
    /** Source rectangle's left coordinate in texture pixels. */
    startx: number;
    /** Source rectangle's top coordinate in texture pixels. */
    starty: number;
    /** Source rectangle's right coordinate in texture pixels. */
    endx: number;
    /** Source rectangle's bottom coordinate in texture pixels. */
    endy: number;
    /** Rotation angle in radians used by `draw()`. */
    angle: number;
    /** Packed RGBA tint multiplied with sampled texture color. */
    color: number;

    /** True when dimensions, pixel data and indexed palette data are valid. */
    ready(): boolean;
    /** True while an ImageList request is waiting or being processed. */
    loading(): boolean;
    /** True when the most recent ImageList request failed. */
    failed(): boolean;
    /**
     * Returns the loading state. `decoded` has CPU pixels; `upload_pending`
     * has a queued VRAM upload; `ready` is resident in VRAM.
     */
    status(): "queued" | "loading" | "decoded" | "upload_pending" | "ready" | "failed" | "cancelled";
    /** Returns structured load diagnostics, or undefined when no load failed. */
    error(): ImageLoadError | undefined;
    /** Queues a textured sprite at `(x, y)` for the current frame. */
    draw(x: number, y: number, options?: ImageDrawOptions): void;
    /**
     * Draws a box of `width` x `height` at `(x, y)` from a source rectangle cut
     * in 3x3 by margins: corners keep their size (times `scale`), edges and
     * the center stretch. One packet for the 9 cells. A box smaller than its
     * margins shrinks them together.
     */
    drawNinePatch(x: number, y: number, width: number, height: number, options?: ImageNinePatchOptions): void;
    /**
     * Mirroring: a record with `u1 > u2` (or `v1 > v2`) is drawn mirrored;
     * `draw()` has `flipX`/`flipY` for the same.
     *
     * Queues many sprites of this image at once: the texture state is sent
     * once per 128 sprites instead of once per sprite, which makes it several
     * times cheaper than as many `draw()` calls. `sprites` uses the record
     * layout of `TileMap.SpriteBuffer` (`TileMap.layout`: x, y, w, h, u1, v1,
     * u2, v2 in pixels and texels, r, g, b, a with 128 as neutral), so one
     * buffer serves both; the TileMap module is not required. Records with a
     * zero width or height are skipped, and so are, under a Camera2D camera,
     * records outside its viewport.
     *
     * @example
     * ```js
     * const sprites = new Float32Array(16 * count);        // 64-byte records
     * const colors = new Uint32Array(sprites.buffer);
     * // record i: sprites[16*i + 0..7] = x, y, w, h, u1, v1, u2, v2;
     * //           colors[16*i + 8..11] = r, g, b, a
     * image.drawList(sprites, { x: cameraX, y: cameraY });
     * ```
     */
    drawList(sprites: ArrayBuffer | ArrayBufferView, options?: ImageDrawListOptions): void;
    /**
     * `drawList(sprites, count, first?)`: the same without an options object. On the EE building and reading
     * `{ count }` costs ~20 us a call, which is more than drawing a few dozen sprites.
     */
    drawList(sprites: ArrayBuffer | ArrayBufferView, count: number, first?: number): void;
    /**
     * Draws free quads (rotated, sheared, per-corner placement) as two
     * triangles each, one GS packet per 64 quads. Each record is 20 floats
     * (80 bytes): the corners top-left, top-right, bottom-left, bottom-right as
     * `x, y` (floats 0-7), their texels `u, v` in the same order (8-15) and a
     * color `r, g, b, a` with 128 as neutral (16-19). Under a Camera2D camera,
     * quads whose bounding box is outside the viewport are skipped, as are
     * quads with a non-finite corner. Positions are in world units: there is
     * no `x`/`y` offset option.
     *
     * @example
     * ```js
     * // A blade of grass leaning by `lean` pixels at the top, base fixed.
     * const q = new Float32Array(20 * count);
     * q.set([x + lean, y, x + w + lean, y, x, y + h, x + w, y + h,
     *        u1, v1, u2, v1, u1, v2, u2, v2, 128, 128, 128, 128], 20 * i);
     * image.drawQuads(q, count);
     * ```
     */
    drawQuads(quads: ArrayBuffer | ArrayBufferView, options?: { first?: number; count?: number }): void;
    /** `drawQuads(quads, count, first?)`: the same without an options object. */
    drawQuads(quads: ArrayBuffer | ArrayBufferView, count: number, first?: number): void;
    /** Uploads the image synchronously and pins its VRAM allocation. */
    lock(): boolean;
    /** Allows the texture manager to evict the image from VRAM. */
    unlock(): boolean;
    /** Returns whether the image is currently pinned in VRAM. */
    locked(): boolean;
    /** Converts an unlocked CT24 texture to CT16S and invalidates its VRAM copy. */
    optimize(): boolean;
    /** Releases the native image and its CPU/VRAM resources. */
    free(): void;

    /** Copies a rectangular VRAM region between two resident images. */
    static copyVRAMBlock(
        source: Image,
        sourceX: number,
        sourceY: number,
        destination: Image,
        destinationX: number,
        destinationY: number
    ): void;
}

/** Structured diagnostics for a failed image load. */
interface ImageLoadError {
    /** Path as it was requested. */
    path: string;
    code: "open_failed" | "unsupported_format" | "decode_failed" | "surface_failed" | "upload_failed";
    /** `upload` is reported only for ImageList requests with an `upload` option. */
    stage: "open" | "decode" | "surface" | "upload";
    /** Human-readable description. */
    message: string;
}


/* === Module: Model3D (model3d) === */
/** Immutable mesh streams. Geometry and material descriptors are copied;
 * instances/batches retain native resources, including textures. */
declare namespace Model3D {
    const MAX_VERTICES: number;
    /** Joint indices must be below MAX_JOINTS (256); the VU1 path accepts 24 joints. */
    const MAX_JOINTS: number;
    /** At most MAX_TARGETS (8) morph targets per mesh. */
    const MAX_TARGETS: number;
    /** UV components must be finite with |u|,|v| <= UV_LIMIT (16): tiled UVs
     * use repeat addressing within the GS texel precision. */
    const UV_LIMIT: number;
    const UNLIT: 0; const DIFFUSE: 1;
    class Texture {
        /** GPU-owned CT32 target. Width/height powers of two in 64..512,
         * default linear filter. Capture before sampling and recapture after
         * Screen.setMode(). No CPU pixels; cannot sample while capturing. */
        static renderTarget(width: number, height: number, filter?: 0 | 1): Texture;
        private constructor();
        static readonly NEAREST: 0; static readonly LINEAR: 1;
        /** Addressing per axis: CLAMP (to edge, the default), REPEAT on both
         * axes, or REPEAT_U / REPEAT_V on one. */
        static readonly CLAMP: 0; static readonly REPEAT_U: 1; static readonly REPEAT_V: 2; static readonly REPEAT: 3;
        /** Copies 0xAABBGGRR pixels; alpha (0..255) is used by alphaCutoff and Render3D.withBlend. Power-of-two sizes 1..512;
         * no mipmaps. Honors subarray(); main thread only. */
        static fromPixels(pixels: {width: number; height: number; pixels: Uint32Array; filter?: 0 | 1; wrap?: 0 | 1 | 2 | 3}): Texture;
        /** Synchronous decoding. RGB/RGBA, 16-bit and 4/8-bit palette images
         * (canonical 32-bit CPU copy). VRAM uses lossless T4/T8 for <=16/256
         * distinct GS RGBA colors when texture+CLUT is smaller than CT32.
         * Errors name the path and the reason. */
        static load(path: string, filter?: 0 | 1, wrap?: 0 | 1 | 2 | 3): Texture;
        /** load() from PNG/JPEG/BMP bytes (ArrayBuffer/Uint8Array, borrowed for the
         * call, subarrays honored): no file I/O, so a Thread read job can feed it. */
        static loadMemory(bytes: ArrayBuffer | Uint8Array, filter?: 0 | 1, wrap?: 0 | 1 | 2 | 3): Texture;
        readonly width: number; readonly height: number; readonly wrap: 0 | 1 | 2 | 3;
        /** Makes the texture resident in VRAM now (one synchronous upload and
         * GS wait), e.g. on a loading screen, instead of at the first draw.
         * Throws when VRAM is full. */
        upload(): this;
        /** Existing meshes retain the texture. Final native release defers VRAM
         * and pixel cleanup until the GS has finished reading them. */
        dispose(): void;
    }
    interface Material {
        /** Defaults to UNLIT. DIFFUSE uses world ambient/directional lights. */
        shading?: 0 | 1;
        /** Four finite linear RGBA values in [0,1], multiplied by vertex colors
         * and stored as RGBA8. Defaults to white; alpha is used by alphaCutoff and Render3D.withBlend. */
        baseColor?: Float32Array;
        texture?: Texture;
        /** Alpha mask (glTF alphaMode MASK): pixels whose alpha (texture
         * alpha times vertex alpha) is below the cutoff, in [0,1], are
         * discarded by the GS alpha test; the rest stay opaque. */
        alphaCutoff?: number;
    }
    interface Geometry {
        positions: Float32Array; colors?: Float32Array;
        /** Triangle-list corners; copied into compact batches when storage is
         * smaller. The original triangle order and vertexCount are preserved. */
        indices?: Uint32Array;
        /** One nonzero xyz normal per source vertex; normalized during copy.
         * Missing DIFFUSE normals are generated per face, before expansion. */
        normals?: Float32Array;
        /** One finite uv pair per source vertex, |u|,|v| <= UV_LIMIT. Origin
         * top-left; outside [0,1] the texture's wrap mode applies. */
        texcoords?: Float32Array;
        /** Four joint indices and four nonnegative finite weights per source
         * vertex, supplied together. Each vertex needs a positive weight;
         * weights are normalized during copy.
         * Skin data needs a skin/joint palette to deform (e.g. a loaded glTF node). */
        joints?: Uint16Array;
        weights?: Float32Array;
        /** Concatenated xyz position deltas, one complete source-vertex block
         * per target (1..MAX_TARGETS). Scene3D.Node.setWeights controls the blend. */
        targetPositions?: Float32Array;
        /** Matching concatenated xyz normal deltas; requires base normals. */
        targetNormals?: Float32Array;
        material?: Material;
    }
    class Mesh {
        private constructor();
        /** xyz positions, optional normalized rgba, optional triangle-list indices. Honors subarray(). */
        static fromGeometry(geometry: Geometry): Mesh;
        /** Expanded triangle vertex count, at most MAX_VERTICES. */
        readonly vertexCount: number;
        /** Model-space AABB: minX, minY, minZ, maxX, maxY, maxZ. */
        getBounds(): number[]; getBounds(out: Float32Array): Float32Array;
        createInstance(): Instance;
        /** Drops this handle; existing instances retain the native mesh. */
        dispose(): void;
    }
    class Instance {
        private constructor();
        setPosition(x: number, y: number, z: number): this;
        setScale(x: number, y: number, z: number): this;
        /** Radians, XYZ local rotations composed Rz * Ry * Rx. */
        setRotationEuler(x: number, y: number, z: number): this;
        setRotationQuaternion(x: number, y: number, z: number, w: number): this;
        /** Owned snapshot, or fills and returns out; never a borrowed matrix. */
        getTransform(out?: Matrix4): Matrix4;
        /** Local TRS as set (rotation normalized, xyzw): a new Array, or out
         * filled and returned (no allocation per frame). */
        getPosition(): number[]; getPosition(out: Float32Array): Float32Array;
        getRotation(): number[]; getRotation(out: Float32Array): Float32Array;
        getScale(): number[]; getScale(out: Float32Array): Float32Array;
        dispose(): void;
    }
    /** Synchronous static OBJ/glTF/GLB loading; see docs/3D.md for the supported subset.
     * Errors name the file and the exact unsupported feature. */
    function load(path: string, material?: Material): Mesh;
    /** Self-contained GLB, at most 16 MiB. Borrows bytes for the call and
     * copies all native data; honors Uint8Array.subarray(), including unaligned
     * offsets. origin is a nonempty diagnostic name, not an I/O resolver.
     * URI buffers and external images are rejected. No upload; synchronous
     * parse/construction on the main thread, with the same static-mesh subset. */
    function loadMemory(bytes: ArrayBuffer | Uint8Array, origin: string, material?: Material): Mesh;
    type LoaderPhase = 'copy' | 'parse' | 'dependencies' | 'validate' | 'build' | 'done';
    /** Resumable loadMemory() of one static GLB mesh. The first steps ('copy',
     * 256 KiB each) snapshot the bytes into memory the loader owns; do not
     * modify the source before `phase` leaves 'copy'. Then the parse, the
     * glTF validation and the primitive build (texture decode is one unit;
     * vertex/index reads and the mesh stages are small slices). Dispose to
     * abandon; unreferenced loaders are freed by GC. */
    class Loader {
        private constructor();
        /** Phase names by native phase index (the order of phaseStatsInto). */
        static readonly PHASES: readonly string[];
        /** Runs up to `units` (1..64, default 1) consecutive units of the same
         * phase. false while work remains, true once finished. Throws the load
         * error, and keeps throwing it; then dispose(). */
        step(units?: number): boolean;
        /** Runs at least one unit, then more until `budgetMs` (0..1000, default 0 =
         * one unit) has elapsed: a single call for a time slice, timed by the
         * native loader. Same results as step(); false while work remains, true
         * once finished; lastUnits is the number of units that ran. */
        run(budgetMs?: number): boolean;
        /** Units, total time and largest single unit per phase so far. */
        /** Same numbers as `phaseStats`, written into a Float64Array (units, totalMs,
         * maxMs at index 3 * phase index; at least 3 * PHASES.length elements): no allocation. */
        phaseStatsInto(out: Float64Array): void;
        readonly phaseStats: { [phase: string]: { units: number; totalMs: number; maxMs: number } };
        /** The Mesh, after step() returned true. Spends the loader. */
        finish(): Mesh;
        dispose(): void;
        readonly phase: LoaderPhase | 'disposed';
        readonly lastPhase: LoaderPhase | 'disposed';
        /** Native steps the last step() call ran (at most `units`). */
        readonly lastUnits: number;
        /** Files named by relative URI (external buffers and images), listed after
         * the parse step when started with `{ dependencies: true }`; else empty.
         * Read each one yourself (the loader does no I/O) and give it to provide(). */
        readonly dependencies: { uri: string; image: boolean; provided: boolean }[];
        /** Hands over the bytes of dependencies[index] (ArrayBuffer/Uint8Array,
         * 1 byte to 16 MiB, once). They are used, not copied: do not modify the
         * buffer until finish() or dispose(). While files are missing step()
         * returns false and does nothing (phase 'dependencies'). Absolute, scheme,
         * drive and ".." URIs are rejected, at most 64 files. */
        provide(index: number, bytes: ArrayBuffer | Uint8Array): void;
        readonly unitsDone: number;
        readonly unitsTotal: number;
    }
    /** Starts a resumable loadMemory() (same rules and errors, found while stepping). *
     * `options.borrow: true` uses the bytes in place (no 'copy' phase and no snapshot
     * RAM) when they are 4-byte aligned, otherwise the snapshot is made as usual; the
     * buffer is pinned and must not be modified until finish() or dispose(). */
    function beginMemory(bytes: ArrayBuffer | Uint8Array, origin: string, material?: Material, options?: { dependencies?: boolean; borrow?: boolean }): Loader;
    /** Bulk setters, one call per frame instead of one per instance: values holds
     * x, y, z for instances[i] at values[3i..3i+2] (it may be longer). Every
     * value is checked finite before any instance changes. Returns the count. */
    function setPositions(instances: Instance[], values: Float32Array): number;
    /** Radians, composed Rz * Ry * Rx as Instance.setRotationEuler(). */
    function setRotationsEuler(instances: Instance[], values: Float32Array): number;
}


/* === Module: Render3D (render3d) === */
/** Native opaque unlit/diffuse and textured triangles with homogeneous clipping in C for
 * crossing objects; VU1 transforms and lights fully contained objects.
 * Draw never advances animation/physics. Enable Screen zbuffering. */
declare namespace Render3D {
    const CULL_NONE: 0; const CULL_BACK: 1; const CULL_FRONT: -1;
    type CullMode = 0 | 1 | -1;
    interface Stats {
        submittedObjects: number; culledObjects: number;
        /** Accepted objects drawn, even when clipping rejects all their triangles. */
        drawPasses: number;
        /** GS/VU1 passes emitted. Batch and Scene3D draws share one pass among
         * consecutive objects with the same camera, program and texture. */
        pipelinePasses: number;
        /** Triangle list sent to VU1 after native clipping; not rasterized count. */
        triangles: number; vuBatches: number;
        /** Source triangles of objects retained by AABB culling. */
        sourceTriangles: number;
        /** Source triangles partially clipped and producing visible polygons. */
        clippedTriangles: number;
        /** Source triangles rejected by precise clipping. */
        rejectedTriangles: number;
        /** Stream payload sent inline or by DMA_REF, including chunk padding
         * and skin joints/weights when applicable.
         * Excludes tags, constants, texture/program uploads, GS state and 2D draws. */
        geometryBytes: number;
        /** Objects crossing the screen edges drawn by VU1 without clipping,
         * inside the GS guard band (the scissor trims them). */
        guardBandObjects: number;
        /** Objects crossing the near plane clipped on VU1 (inside the guard
         * band otherwise); their triangles count before clipping. */
        nearClipObjects: number;
        /** Meshes with morph targets blended on VU1. */
        vuMorphObjects: number;
        /** Objects crossing the frustum beyond the guard band, clipped
         * triangle by triangle in C on the EE: the expensive path (a large
         * mesh around the camera costs milliseconds). Split such meshes. */
        cpuClipObjects: number;
    }
    /** Lights are borrowed for this call. Omitted lights mean black ambient and
     * no directional lights. UNLIT materials ignore lights. Scale 0
     * draws nothing (counted as culled); other singular DIFFUSE normal
     * transforms throw, naming the reason; drawing does not update lights or transforms.
     * Pass `stats` to reuse an object every frame: its fields are assigned and
     * it is returned, instead of allocating a new Stats per call. Pass `null`
     * to skip the per-call stats (returns undefined, the cheapest call) and
     * read the totals once per frame with frameStats(). */
    function draw<T extends object = Stats>(instance: Model3D.Instance, camera: Camera3D.Camera, cullMode?: CullMode,
        lights?: Lights.Set, stats?: T): T & Stats;
    function draw(instance: Model3D.Instance, camera: Camera3D.Camera, cullMode: CullMode | undefined,
        lights: Lights.Set | undefined, stats: null): undefined;
    /** Totals of every successful Render3D.draw, Batch.draw and Scene3D draw
     * since the last reset (with or without per-call stats). `reset`
     * (default true) clears them, so call it once per frame. */
    /** Linear RGB multiplier in [0, 1] (white by default) applied to the vertex colors of every
     * following draw, after lighting and before fog: clamp(color * lighting) * tint, or
     * color * tint for UNLIT. The mesh's colors are not touched and no VU1 time is added (one
     * constant quad per object, sent when it changes). Global state: set it before each draw or
     * group that needs another tint, and restore white (1, 1, 1). Texture/vertex alpha are
     * unaffected. Throws RangeError for a component outside [0, 1]. */
    function setTint(r: number, g: number, b: number): void;
    function getTint(): [number, number, number];
    function frameStats<T extends object = Stats>(stats?: T, reset?: boolean): T & Stats;
    /** Runs fn with one shared GS/VU1 pass: consecutive draws with the same
     * camera, program and texture skip the barrier, program upload, camera
     * constants and GS state (and unchanged lights). The pass closes when fn
     * returns or throws; fn's result is returned. Inside fn, draw only 3D:
     * no 2D drawing, flip or camera change. Groups do not nest. */
    function group<R>(fn: () => R): R;
    /** Synchronous scope for blended 3D draws, depth tested without depth writes.
     * -1 opaque, 0 darken (use black), 1 alpha, 2 additive. Restores state on
     * return/throw; scopes may nest, but cannot start inside group(). Draw
     * opaque receivers first. No sorting; callback must draw synchronously. */
    function withBlend<R>(mode: -1 | 0 | 1 | 2, fn: () => R): R;
    /** Captures opaque white geometry over transparent black in a GPU target.
     * Uses the camera passed to each draw, including skin/morph deformation;
     * ignores source texture, RGBA, lighting, fog and tint. No depth buffer.
     * Only synchronous Render3D/Scene3D draws in fn; no screen changes, 2D or
     * promises. Cannot nest/start in group(). Restores state on return/throw;
     * an exception invalidates the target until the next successful capture.
     * Draw opaque receivers afterwards, then project the captured texture. */
    function captureSilhouette<R>(target: Model3D.Texture, fn: () => R): R;
    class Batch {
        constructor();
        readonly size: number;
        /** Retains the native instance, independently of its JS handle. */
        add(instance: Model3D.Instance): this;
        clear(): this;
        /** Optional `stats` is reused and returned, as in Render3D.draw(); null returns undefined. */
        draw<T extends object = Stats>(camera: Camera3D.Camera, cullMode?: CullMode, lights?: Lights.Set,
            stats?: T): T & Stats;
        draw(camera: Camera3D.Camera, cullMode: CullMode | undefined, lights: Lights.Set | undefined,
            stats: null): undefined;
        dispose(): void;
    }
}


/* === Module: Scene3D (scene3d) === */
/** Native transform hierarchy. A Node is the scene-graph instance of a mesh;
 * world = parent world * local TRS. Setters only mark dirty flags: call
 * scene.update() (or attachLoop()) before draw and world queries, which throw
 * while the scene is stale instead of returning outdated data. */
declare namespace Scene3D {
    /** Releases reusable CPU skinning/morph buffers after draw returns, for
     * a level transition or memory pressure. They grow again when needed. */
    function trimScratch(): void;
    /** Levels from the root, root included. Deeper hierarchies are rejected. */
    const MAX_DEPTH: number;
    /** Bulk setters, one call per frame instead of one per node: values holds
     * x, y, z for nodes[i] at values[3i..3i+2] (it may be longer). Every
     * value is checked finite before any node changes. Returns the count. */
    function setPositions(nodes: Node[], values: Float32Array): number;
    /** Radians, composed Rz * Ry * Rx as Node.setRotationEuler(). */
    function setRotationsEuler(nodes: Node[], values: Float32Array): number;
    /** 2D physics on 3D nodes: x, y and an angle about Z (radians) per node,
     * the layout of Box2D's `world.readTransforms()`. Each node keeps its z.
     * ```js
     * world.readTransforms(bodies, transforms);
     * Scene3D.setTransforms2D(crates, transforms);
     * ``` */
    function setTransforms2D(nodes: Node[], values: Float32Array): number;
    interface UpdateStats { visitedNodes: number; worldUpdates: number; boundsUpdates: number; }
    /** Nearest raycast hit: node, distance along the ray, world point
     * (x, y, z), unit normal facing the ray (nx, ny, nz) and source triangle
     * index (-1 for an AABB hit). */
    interface RaycastHit {
        node: Node; distance: number; x: number; y: number; z: number;
        nx: number; ny: number; nz: number; triangle: number;
    }
    interface RaycastOptions {
        /** Test triangles (default true) or only the meshes' world AABBs. */
        precise?: boolean;
    }
    interface DrawStats extends Render3D.Stats {
        /** Subtrees rejected by their world bounds; their meshes count as culled. */
        culledSubtrees: number;
        /** Meshes sent to Render3D, sorted by pipeline in traversal order. */
        queuedObjects: number;
    }
    interface Bounds { min: [number, number, number]; max: [number, number, number]; }
    class Node {
        /** Retains the optional mesh natively, independently of its handle. */
        constructor(mesh?: Model3D.Mesh);
        /** Replaces the retained mesh; null removes it. */
        setMesh(mesh: Model3D.Mesh | null): this;
        readonly hasMesh: boolean;
        setPosition(x: number, y: number, z: number): this;
        setScale(x: number, y: number, z: number): this;
        /** Radians, XYZ local rotations composed Rz * Ry * Rx. */
        setRotationEuler(x: number, y: number, z: number): this;
        setRotationQuaternion(x: number, y: number, z: number, w: number): this;
        /** Native motion, integrated by scene.advance(dt) / attachLoop() without
         * a JS call per frame. Units per second in the parent space. */
        setVelocity(x: number, y: number, z: number): this;
        /** Angular velocity in rad/s about the local axes: direction is the
         * axis, length the speed. (0, 0, 0) stops the spin. */
        setSpin(x: number, y: number, z: number): this;
        /** Hidden nodes and descendants are not drawn nor included in bounds. */
        visible: boolean;
        /** Reparents child, keeping its local transform; the parent retains it.
         * Throws RangeError for cycles, scene roots and MAX_DEPTH overflow. */
        add(child: Node): this;
        /** Removes this node from its parent; harmless without one. */
        detach(): this;
        /** The same live JS object for this native parent, or null. Wrapper
         * identity (including subclass/properties) is preserved while live. */
        getParent(): Node | null;
        readonly childCount: number;
        /** The same live JS object for the child at index. */
        getChild(index: number): Node;
        /** Always current. Owned snapshot, or fills and returns out. */
        getLocalTransform(out?: Matrix4): Matrix4;
        /** Transform of the last update. Throws while stale or outside a scene. */
        getWorldTransform(out?: Matrix4): Matrix4;
        /** World AABB of visible meshes in the subtree, or null when empty.
         * Throws while stale or outside a scene. */
        getWorldBounds(): Bounds | null;
        /** Morph target weights (up to 8; missing ones become 0). A mesh with
         * morph targets is blended in C at draw: base + sum(weight * delta). */
        setWeights(weights: ArrayLike<number>): this;
        /** One weight per morph target of the node's mesh (empty without). */
        getWeights(): number[];
        /** Invalidates this shared JS wrapper (all aliases). Parents/scenes
         * retain the native node; later access can create another wrapper.
         * The wrapper cache is weak and does not keep JS objects alive. */
        dispose(): void;
    }
    class Scene {
        constructor();
        /** The same live JS object for the root node owned by the scene. */
        readonly root: Node;
        /** True when a node changed after the last update. */
        readonly stale: boolean;
        /** True while a Loop POST_UPDATE system updates this scene. */
        readonly attached: boolean;
        /** Integrates node motion (setVelocity/setSpin) for dt seconds and
         * returns the moved node count. attachLoop() does it every frame with
         * the Loop dt, before update(). */
        advance(dt: number): number;
        /** Recomputes dirty world transforms and subtree bounds. Optional
         * `stats` is reused and returned instead of allocating a new object;
         * null skips it and returns undefined. */
        update<T extends object = UpdateStats>(stats?: T): T & UpdateStats;
        update(stats: null): undefined;
        /** Culls subtrees, queues meshes and draws them through Render3D.
         * Never updates the scene; throws while stale. Lights are borrowed.
         * `stats` as in Render3D.draw(): reused, or null to return undefined;
         * the render totals feed Render3D.frameStats() either way. */
        draw<T extends object = DrawStats>(camera: Camera3D.Camera, cullMode?: Render3D.CullMode, lights?: Lights.Set,
            stats?: T): T & DrawStats;
        draw(camera: Camera3D.Camera, cullMode: Render3D.CullMode | undefined, lights: Lights.Set | undefined,
            stats: null): undefined;
        /** Nearest visible mesh hit by the ray (e.g. Camera3D.Camera.screenToRay())
         * within maxDistance (default unlimited), or null. Uses the transforms of
         * the last update(); throws while stale. Skinned meshes are skipped and
         * morphed meshes are tested in their base pose. Optional `out` is reused. */
        raycast<T extends object = RaycastHit>(ray: Camera3D.Ray, maxDistance?: number, options?: RaycastOptions,
            out?: T): (T & RaycastHit) | null;
        /** Nodes whose visible, unskinned mesh world AABB overlaps the box, in
         * traversal order. Optional `out` array is cleared, refilled and returned. */
        queryBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
            out?: Node[]): Node[];
        /** Updates natively in Loop POST_UPDATE. Lower priority runs first. */
        attachLoop(priority?: number): this;
        detachLoop(): this;
        /** Also detaches from the Loop; existing node handles stay valid. */
        dispose(): void;
    }
}


/* === Module: Animation3D (animation3d) === */
/** Keyframe clips sampled in native code and applied to Scene3D nodes. The
 * script starts and stops players; poses are not computed in JavaScript.
 * Players advance in one Loop system (attachLoop()) that runs before Scene3D
 * systems at the default priorities, or manually with advance(dt). */
declare namespace Animation3D {
    /** Default attachLoop() priority: before Scene3D.attachLoop() (0). */
    const LOOP_PRIORITY: number;
    interface Track {
        /** Index into the player's nodes; default 0. */
        target?: number;
        path: "position" | "rotation" | "scale" | "weights";
        /** Seconds, >= 0 and strictly increasing. */
        times: Float32Array;
        /** 3 floats per key (position, scale), 4 (rotation xyzw; normalized,
         * slerp on the short arc) or 1..8 (morph target weights, see
         * Scene3D.Node.setWeights(); values.length / times.length per key). */
        values: Float32Array;
        /** Default "linear". "cubic" is glTF CUBICSPLINE: Hermite between
         * keys using inTangents/outTangents (rotations normalized after). */
        interpolation?: "linear" | "step" | "cubic";
        /** "cubic" only: tangents per key, laid out like values, in value
         * units per second. */
        inTangents?: Float32Array;
        outTangents?: Float32Array;
    }
    /** Tracks are copied; the arrays can be reused afterwards. */
    class Clip {
        constructor(tracks: Track[]);
        /** Last key time of all tracks, in seconds. */
        readonly duration: number;
        /** Nodes a player needs: highest target + 1. */
        readonly targetCount: number;
        dispose(): void;
    }
    /** Binds a clip to nodes (retained, also after their handles are
     * disposed). Created stopped at time 0, speed 1, not looping. Players
     * stay alive until dispose(), even when no variable holds them. */
    class Player {
        constructor(clip: Clip, nodes: Scene3D.Node[]);
        play(): this;
        pause(): this;
        /** Pauses and rewinds (to the end when speed is negative). */
        stop(): this;
        /** Seconds; setting it seeks and applies the pose. */
        time: number;
        /** Negative plays backwards. */
        speed: number;
        loop: boolean;
        readonly playing: boolean;
        /** Advances by dt * speed seconds; true when it just reached the end. */
        advance(dt: number): boolean;
        dispose(): void;
    }
    /** Advances every playing player; returns how many reached their end. */
    function advance(dt: number): number;
    /** One native POST_UPDATE system for every player; idempotent. */
    function attachLoop(priority?: number): void;
    function detachLoop(): boolean;
    function isAttached(): boolean;
}


/* === Module: CameraRig3D (camerarig3d) === */
/** Native Camera3D controllers. The script configures a rig and feeds input
 * (rotate/zoom); following, orbiting and smoothing run in C every frame in one
 * Loop system (attachLoop()) after Scene3D updates world transforms, or
 * manually with update(dt). A rig keeps its camera alive, also after the
 * camera handle is disposed, and skips frames whose target node is stale.
 * Rigs stay active until dispose(), even when no variable holds them. */
declare namespace CameraRig3D {
    /** Default attachLoop() priority: after Scene3D.attachLoop() (0). */
    const LOOP_PRIORITY: number;
    interface Rig {
        /** null: Orbit uses its fixed centre; Follow stops moving. */
        setTarget(target: Scene3D.Node | null): this;
        /** Exponential smoothing in 1/s for the eye and the look point; 0 is
         * rigid (default). Frame-rate independent. */
        setSharpness(eye: number, look: number): this;
        /** The next update jumps to the goal without smoothing. */
        snap(): this;
        enabled: boolean;
        /** True when it moved the camera. */
        update(dt: number): boolean;
        dispose(): void;
    }
    class Follow implements Rig {
        constructor(camera: Camera3D.Camera, target: Scene3D.Node);
        /** Eye offset; local (default) turns and scales with the target,
         * otherwise it is added to the target's world position. Default 0, 2, 6. */
        setOffset(x: number, y: number, z: number, local?: boolean): this;
        /** Look point in the target's local space. Default 0, 0, 0. */
        setLookOffset(x: number, y: number, z: number): this;
        setTarget(target: Scene3D.Node | null): this;
        setSharpness(eye: number, look: number): this;
        snap(): this;
        enabled: boolean;
        update(dt: number): boolean;
        dispose(): void;
    }
    class Orbit implements Rig {
        /** Without a target, the centre is the fixed point of setCenter(). */
        constructor(camera: Camera3D.Camera, target?: Scene3D.Node | null);
        /** Offset from the target's world position, or the fixed centre. */
        setCenter(x: number, y: number, z: number): this;
        /** Radians: yaw about +Y (0 sits on +Z looking down -Z), pitch up. */
        setAngles(yaw: number, pitch: number): this;
        /** Input deltas, clamped to the limits. */
        rotate(yaw: number, pitch: number): this;
        zoom(delta: number): this;
        /** Pitch within -1.56..1.56 rad; 0 < distanceMin <= distanceMax.
         * Defaults -1.5, 1.5, 0.1, 1e6. */
        setLimits(pitchMin: number, pitchMax: number, distanceMin: number, distanceMax: number): this;
        readonly yaw: number;
        readonly pitch: number;
        /** Default 6. */
        distance: number;
        /** Yaw speed in rad/s. */
        autoRotate: number;
        setTarget(target: Scene3D.Node | null): this;
        setSharpness(eye: number, look: number): this;
        snap(): this;
        enabled: boolean;
        update(dt: number): boolean;
        dispose(): void;
    }
    /** Updates every enabled rig; returns how many moved their camera. */
    function update(dt: number): number;
    /** One native POST_UPDATE system for every rig; idempotent. */
    function attachLoop(priority?: number): void;
    function detachLoop(): boolean;
    function isAttached(): boolean;
}


/* === Module: Collision3D (collision3d) === */
/** Light 3D collision in C, for levels and characters; not a rigid body
 * solver. A `World` holds static triangles (level meshes, whole Scene3D or
 * glTF subtrees, boxes) in a bounding volume hierarchy, answers raycasts,
 * sphere casts and overlaps, and is what `Character`s walk on.
 *
 * Characters are upright ellipsoids placed by their feet, moved with
 * collide-and-slide (swept, so they never tunnel through thin walls). Up is
 * +Y. Faces up to `maxSlope` are ground (standing on them does not slide),
 * steeper faces are walls, edges up to `stepHeight` above the feet are
 * climbed, and walking down slopes and steps keeps them on the ground. They
 * move by themselves in one Loop system (`attachLoop()`), after the game's
 * update and before Scene3D, and stay active until `dispose()`.
 *
 * Triangles face their counter-clockwise side: characters and sphere casts
 * collide with front faces only, rays hit both sides. Layers and masks are
 * 32-bit flags (-1: all).
 *
 * ```js
 * const level = GLTF3D.load("models/level.glb");
 * scene.root.add(level.root);
 * const world = new Collision3D.World();
 * world.addNode(level.root);
 * const player = new Collision3D.Character(world, { radius: .4, height: 1.8, position: [0, 1, 0] });
 * player.bind(heroNode);                      // the node follows the feet
 * Collision3D.attachLoop(); scene.attachLoop();
 * Loop.run({ update() {
 *     player.vx = stick.x * 4; player.vz = stick.y * 4;
 *     if (pad.justPressed(Gamepad.CROSS) && player.onGround) player.vy = 5;
 * } });
 * ```
 */
declare namespace Collision3D {
    /** Default attachLoop() priority: after Animation3D (-100), before Scene3D (0). */
    const LOOP_PRIORITY: number;
    const MAX_TRIANGLES: number;
    type Vec3 = [number, number, number] | Float32Array;
    interface ShapeOptions {
        /** Default 1. */
        layer?: number;
    }
    interface QueryOptions {
        /** Layers hit. Default -1 (all). */
        mask?: number;
    }
    /** A hit along a ray or sweep; the normal points toward the query. */
    interface Hit {
        distance: number;
        x: number; y: number; z: number;
        nx: number; ny: number; nz: number;
        /** The shape id returned by add*(). */
        shape: number;
        /** Triangle index within the shape. */
        triangle: number;
    }
    class World {
        constructor();
        /** A mesh's triangles under transform (base pose for skinned or
         * morphed meshes). Returns the shape id. */
        addMesh(mesh: Model3D.Mesh, transform?: Matrix4 | null, options?: ShapeOptions): number;
        /** Every visible mesh of the subtree, with the node's ancestors'
         * transforms composed (no scene update needed). One shape. */
        addNode(node: Scene3D.Node, options?: ShapeOptions): number;
        /** An axis-aligned box, 12 triangles facing out. */
        addBox(min: Vec3, max: Vec3, options?: ShapeOptions): number;
        /** World-space triangles, 9 floats each (copied). */
        addTriangles(positions: Float32Array, options?: ShapeOptions): number;
        /** False for an unknown id. The tree is rebuilt by the next query. */
        remove(shape: number): boolean;
        setLayer(shape: number, layer: number): boolean;
        /** Nearest hit within maxDistance (world units), or null. out is
         * filled and returned instead of a new object. */
        raycast(origin: Vec3, direction: Vec3, maxDistance: number, options?: QueryOptions, out?: Hit): Hit | null;
        /** Many rays in one call: origins 3n floats, directions 3 (shared)
         * or 3n, out 4n floats filled with [distance, nx, ny, nz] per ray
         * (distance -1 on a miss). Returns the number of hits. */
        raycastMany(origins: Float32Array, directions: Float32Array, maxDistance: number,
            out: Float32Array, options?: QueryOptions): number;
        /** A sphere swept along direction: the first front face it touches. */
        sphereCast(center: Vec3, radius: number, direction: Vec3, maxDistance: number,
            options?: QueryOptions, out?: Hit): Hit | null;
        /** Ids of the shapes within radius (both sides; at most 64). */
        overlapSphere(center: Vec3, radius: number, options?: QueryOptions): number[];
        readonly triangleCount: number;
        /** Characters keep their world alive after this. */
        dispose(): void;
    }
    interface CharacterOptions {
        /** Default 0.4. */
        radius?: number;
        /** Default 1.8. */
        height?: number;
        /** Ledges up to this are climbed. Default 0.3. */
        stepHeight?: number;
        /** Degrees; steeper faces are walls. Default 45. */
        maxSlope?: number;
        /** Default [0, -9.81, 0]. */
        gravity?: Vec3;
        /** Default -1. */
        mask?: number;
        /** Feet. Default [0, 0, 0]. */
        position?: Vec3;
    }
    class Character {
        constructor(world: World, options?: CharacterOptions);
        /** Feet position. */
        readonly x: number;
        readonly y: number;
        readonly z: number;
        /** Velocity in units/s; vy is reset on landing and on ceilings. */
        vx: number;
        vy: number;
        vz: number;
        readonly onGround: boolean;
        readonly hitWall: boolean;
        readonly hitCeiling: boolean;
        /** [x, y, z] of the ground under the feet ([0, 1, 0] in the air). */
        readonly groundNormal: number[];
        /** Teleports, without collisions. */
        setPosition(x: number, y: number, z: number): this;
        setVelocity(x: number, y: number, z: number): this;
        /** Moves by a displacement with collisions, without gravity. */
        move(dx: number, dy: number, dz: number): this;
        /** Gravity, then velocity * dt with collisions. */
        step(dt: number): this;
        /** A node whose position follows the feet; null unbinds. */
        bind(node: Scene3D.Node | null): this;
        /** Disabled characters are skipped by the Loop system and step(). */
        enabled: boolean;
        dispose(): void;
    }
    /** Steps every enabled character. */
    function step(dt: number): void;
    /** One native POST_UPDATE system stepping every character; idempotent. */
    function attachLoop(priority?: number): void;
    function detachLoop(): boolean;
    function isAttached(): boolean;
}


/* === Module: Color (color) === */
/**
 * Packs RGBA components into the 32-bit color format used by AthenaEnv.
 *
 * The component order in the returned value is `0xAABBGGRR`:
 * red occupies the least-significant byte and alpha the most-significant.
 * Component values are converted to unsigned 8-bit values.
 *
 * The default alpha used by `new()` is `0x80`, matching the PS2 GS default
 * convention. Color helpers are pure and return a new packed value.
 *
 * @example
 * ```js
 * let tint = Color.new(255, 128, 0, 255);
 * tint = Color.setA(tint, 192);
 * console.log(Color.getR(tint), Color.getA(tint));
 * ```
 */
declare namespace Color {
    /** Packed `0xAABBGGRR` color value. */
    type Value = number;

    /** Creates a packed color from red, green, blue and optional alpha. */
    function new(r: number, g: number, b: number, a?: number): Value;
    /** Reads the red component in the range 0..255. */
    function getR(color: Value): number;
    /** Reads the green component in the range 0..255. */
    function getG(color: Value): number;
    /** Reads the blue component in the range 0..255. */
    function getB(color: Value): number;
    /** Reads the alpha component in the range 0..255. */
    function getA(color: Value): number;
    /** Returns `color` with its red component replaced. */
    function setR(color: Value, value: number): Value;
    /** Returns `color` with its green component replaced. */
    function setG(color: Value, value: number): Value;
    /** Returns `color` with its blue component replaced. */
    function setB(color: Value, value: number): Value;
    /** Returns `color` with its alpha component replaced. */
    function setA(color: Value, value: number): Value;
}


/* === Module: Thread (thread) === */
/**
 * EE thread management.
 *
 * Thread callbacks execute on native EE worker threads. Keep callbacks short,
 * avoid direct QuickJS runtime access from native workers, and use the
 * documented AthenaEnv synchronization boundaries.
 *
 * Example:
 * ```js
 * const worker = Thread.new(() => {
 *     System.delay();
 * }, 'worker', 32768, 16);
 * Thread.start(worker);
 * console.log(Thread.getStatus(worker));
 * Thread.destroy(worker);
 * ```
 */
declare namespace Thread {
    /** Opaque handle returned by `Thread.new()`. */
    interface Handle {
        readonly __brand: 'Thread';
    }

    /** Snapshot of one tracked native thread. */
    interface TaskInfo {
        /** Native EE thread ID. */
        id: number;
        /** Thread name. */
        name: string;
        /** Native status code. */
        status: number;
        /** Configured stack size in bytes. */
        stack: number;
    }

    /**
     * Creates a native EE thread.
     * @param callback Function executed by the new thread.
     * @param name Optional name, limited to 63 characters.
     * @param stackSize Stack size in bytes, at least 16384; defaults to 32768.
     *   JavaScript may use it all but 8 KB: deeper recursion throws a
     *   catchable "stack overflow" instead of overrunning the stack.
     * @param priority EE priority from 1 to 127; defaults to 16.
     */
    function new(
        callback: () => void,
        name?: string,
        stackSize?: number,
        priority?: number
    ): Handle;

    /** Starts execution and returns the native EE result code. */
    function start(thread: Handle): number;

    /** Requests thread termination and returns the native EE result code. */
    function stop(thread: Handle): number;

    /** Returns the native EE thread ID. */
    function getId(thread: Handle): number;

    /** Returns the current thread name. */
    function getName(thread: Handle): string;

    /** Replaces the thread name. */
    function setName(thread: Handle, name: string): void;

    /** Returns the native EE status code. */
    function getStatus(thread: Handle): number;

    /** Releases the thread handle. Stop it first; do not reuse the object. */
    function destroy(thread: Handle): void;

    /** Returns all active/tracked threads. */
    function list(): TaskInfo[];

    /** Force-terminates a native thread by ID. */
    function kill(id: number): number;

    interface ReadFileOptions {
        /** Decode the file as UTF-8 text and resolve with a string. Default false (ArrayBuffer). */
        text?: boolean;
        /** Refuse files larger than this many bytes. Default 16 MiB. */
        maxBytes?: number;
    }

    /** `poll()` of a read: bytes read so far and the file's size (0 until known). */
    interface ReadFileStatus<T> extends AthenaJobStatus<T> {
        bytesDone: number;
        bytesTotal: number;
    }

    /**
     * Reads a whole file on the shared job pool, in 64 KiB chunks, while
     * frames keep coming: large data files, or files on slow storage (disc,
     * USB). Resolves with an ArrayBuffer (no copy of the bytes read), or a
     * string with `text: true`. Rejects with an error that has `path` when
     * the file cannot be opened or read, or is larger than `maxBytes`.
     *
     * @example
     * ```js
     * const level = JSON.parse(await Thread.readFileAsync("levels/1.json", { text: true }));
     * ```
     */
    function readFileAsync(path: string, options: ReadFileOptions & { text: true }):
        AthenaJob<string, ReadFileStatus<string>>;
    function readFileAsync(path: string, options?: ReadFileOptions):
        AthenaJob<ArrayBuffer, ReadFileStatus<ArrayBuffer>>;
}

/**
 * A background job, as returned by `MemoryCard.readFileAsync()`,
 * `Archive.extractAsync()`, `Sound.loadSfxAsync()`, `Font.loadAsync()`...
 * Jobs run on a small shared pool of worker threads while frames keep
 * coming. Every job can be awaited, polled, waited for and cancelled; the
 * module functions (`MemoryCard.poll(job)`, ...) do the same.
 *
 * @example
 * ```js
 * const font = await Font.loadAsync("fonts/title.ttf", { size: 40 });
 *
 * const job = Archive.extractAsync("dlc.zip", "mass:/GAME/dlc");
 * Loop.run(() => {
 *     const status = job.poll();          // { state, result | error, ...progress }
 *     if (status.state === "running") drawProgress(status.bytesDone, status.bytesTotal);
 * });
 * ```
 */
interface AthenaJob<T, Status extends AthenaJobStatus<T> = AthenaJobStatus<T>> extends PromiseLike<T> {
    /** State without blocking; the result or error is converted once and kept. */
    poll(): Status;
    /** Blocks until the job settles or `timeoutMs` passes, then polls. */
    wait(timeoutMs?: number): Status;
    /** The job ends as `'cancelled'` unless it already finished. */
    cancel(): void;
}

interface AthenaJobStatus<T> {
    state: 'running' | 'done' | 'failed' | 'cancelled';
    /** When `state` is `'done'`. The same value on every later poll. */
    result?: T;
    /** When `state` is `'failed'` or `'cancelled'`. */
    error?: Error;
}


/* === Module: Font (font) === */
/**
 * Font loading and text rendering.
 *
 * The constructor optionally accepts a path to either a TrueType file or a legacy
 * bitmap font (`.bmp`, `.png` or `.jpg`, optionally with a `.dat` width file).
 * With no path, the embedded Quicksand Regular font is used. Text is queued
 * into the current graphics command stream.
 *
 * TrueType glyphs are rasterized once at `size` pixels and cached; `scale`
 * stretches them, so prefer a matching `size` for large text. The same file
 * at the same size is loaded once and shared, and at most 16 different
 * TrueType fonts are loaded at a time: call `free()` on fonts no longer used.
 * Glyphs keep their proportions on NTSC, PAL, 480p and 16:9 modes, and follow
 * `Screen.setMode()`.
 *
 * A glyph is rasterized the first time it is printed, which can hold that
 * frame: `preload()` (or the `preload` option of `loadAsync`) does it ahead,
 * a few milliseconds per frame. Text printed every frame is cheaper through
 * `render()`, which lays it out once.
 *
 * @example
 * ```js
 * const title = new Font("fonts/title.ttf", { size: 48 });
 * title.outlineColor = Color.new(0, 0, 0);
 * title.outline = 2;
 * title.print(320, 40, "Game Over\nPress START");   // \n starts a new line
 * ```
 */
declare class Font {
    /** Loads `path`, or the embedded font when omitted, undefined or null. */
    constructor(path?: string | null, options?: Font.Options);
    constructor(options: Font.Options);

    /**
     * Loads a font without stalling the frame loop. A TrueType file is read
     * on the shared job pool; a bitmap font's image and `.dat` widths are
     * decoded there, and its texture is uploaded when first drawn. The Font
     * is created on the script thread when the job is awaited or polled.
     *
     * With `preload`, the job resolves only once those glyphs are rasterized,
     * `budgetMs` per frame, so a loading screen hands over a font that prints
     * without a stall.
     *
     * @example
     * ```js
     * async function start() {
     *     const title = await Font.loadAsync("fonts/title.ttf", { size: 48, preload: true });
     *     Loop.run(() => title.print(40, 40, "Ready"));
     * }
     * start();
     * ```
     */
    static loadAsync(path?: string | null, options?: Font.AsyncOptions): Font.Job;
    /** Same as `job.poll()`, `job.wait()` and `job.cancel()`. `wait()` also finishes the preloading. */
    static poll(job: Font.Job): AthenaJobStatus<Font>;
    static wait(job: Font.Job, timeoutMs?: number): AthenaJobStatus<Font>;
    static cancel(job: Font.Job): void;

    /** The printable ASCII characters, from space to `~`: what `preload()` rasterizes by default. */
    static readonly ASCII: string;

    static readonly ALIGN_TOP: number;
    static readonly ALIGN_BOTTOM: number;
    static readonly ALIGN_VCENTER: number;
    static readonly ALIGN_LEFT: number;
    static readonly ALIGN_RIGHT: number;
    static readonly ALIGN_HCENTER: number;
    static readonly ALIGN_NONE: number;
    static readonly ALIGN_CENTER: number;

    scale: number;
    color: Color.Value;
    /** Horizontal alignment applies to each line. */
    align: number;
    outline: number;
    outlineColor: Color.Value;
    dropshadow: number;
    dropshadowColor: Color.Value;
    /** @deprecated Use `outlineColor`. */
    outline_color: Color.Value;
    /** @deprecated Use `dropshadowColor`. */
    dropshadow_color: Color.Value;
    /** TrueType rasterization size in pixels (0 for bitmap fonts). */
    readonly size: number;
    /** Distance between two lines at the current `scale`, in pixels. */
    readonly lineHeight: number;

    /** Queues `text`; `\n` starts a new line. */
    print(x: number, y: number, text: string): void;
    /** Width of the widest line and height of all lines, in pixels. */
    getTextSize(text: string): { width: number; height: number };
    /**
     * Keeps `text` ready to print repeatedly: its glyphs are placed once and
     * placed again only when `scale`, `align` or the video mode change. The
     * outline or shadow reuse the same placement.
     */
    render(text: string): FontRender;
    /**
     * Rasterizes the glyphs of `chars` (by default `Font.ASCII`) ahead of the
     * first print, spending at most `budgetMs` (default 2) per frame; `0`
     * rasterizes them all now. The first slice runs during the call, the
     * next ones once per frame, also before `Loop.run()` starts. Resolves
     * with the font; rejects if it is freed meanwhile. Bitmap fonts resolve
     * at once.
     *
     * @example
     * ```js
     * await hud.preload("0123456789:/ ", { budgetMs: 1 });
     * ```
     */
    preload(chars?: string, options?: Font.PreloadOptions): Promise<Font>;
    /**
     * Releases the font now instead of when the collector finds the object.
     * Using it afterwards throws; FontRender objects made from it throw too.
     */
    free(): void;
}

declare namespace Font {
    /** A `Font.loadAsync()` job. */
    interface Job extends AthenaJob<Font> {
        readonly __brand: 'FontJob';
    }

    interface Options {
        /** TrueType rasterization size in pixels, 6 to 128; defaults to 26. Ignored by bitmap fonts. */
        size?: number;
    }

    interface PreloadOptions {
        /** Milliseconds of rasterization per frame at most; `0` does it all at once. Defaults to 2. */
        budgetMs?: number;
    }

    interface AsyncOptions extends Options, PreloadOptions {
        /** Glyphs rasterized before the job resolves: a string of characters, or `true` for `Font.ASCII`. */
        preload?: string | boolean;
    }
}

declare class FontRender {
    print(x: number, y: number): void;
}


/* === Module: Gamepad (gamepad) === */
/**
 * Controller input for up to eight players, as a singleton.
 *
 * Supported controllers: DualShock 2 and other PS2 pads on both controller
 * ports, up to four per port through a multitap, and DualShock 3/4 over USB
 * (two) or Bluetooth (two, with a USB Bluetooth adapter).
 *
 * Only the two controller ports work out of the box. Multitap, USB and
 * Bluetooth each need an IOP driver that costs IOP memory, so they start
 * disabled; turn on the ones the program uses, preferably before the first
 * `update()`:
 * ```js
 * Gamepad.configure({ multitap: true, usb: true });
 * ```
 *
 * Players are logical: a controller that connects takes the lowest free
 * player and keeps it until it disconnects, whatever port or cable it uses.
 * Controllers already plugged in at start-up are assigned about half a
 * second after the first `update()`, in this order: port 1 slots A-D, port 2
 * slots A-D, USB, Bluetooth. Without multitaps, the pads on port 1 and port 2
 * therefore become players 0 and 1.
 *
 * Call `Gamepad.update()` once per frame. It polls every controller and
 * freezes a snapshot, so everything read from a `Player` during the frame is
 * cheap and consistent. `Gamepad.player(i)` always returns the same object.
 *
 * Analog values are normalized: sticks in [-1, 1], pressure and rumble
 * strength in [0, 1].
 *
 * Example:
 * ```js
 * const p1 = Gamepad.player(0);
 *
 * while (true) {
 *     Gamepad.update();
 *     if (p1.justDisconnected) pause();
 *     if (p1.justPressed(Gamepad.CROSS)) jump();
 *     const move = p1.leftStick();
 *     x += move.x * speed;
 *     if (hit) p1.rumble(0.8, 0, 200);
 *     Screen.flip();
 * }
 * ```
 */
declare namespace Gamepad {
    /** How the controller bound to a player is connected. */
    type Connection = "port" | "usb" | "bluetooth";

    /** State of one optional driver, see `Gamepad.drivers()`. */
    interface DriverState {
        /** Requested with `Gamepad.configure()`; all drivers start disabled. */
        readonly enabled: boolean;
        /** Loaded on the IOP and answering. */
        readonly ready: boolean;
    }

    /** One player. Obtain it with `Gamepad.player()`; it cannot be constructed. */
    interface Player {
        /** Player index, 0 to `MAX_PLAYERS - 1`. */
        readonly index: number;
        /** True while a controller is bound to this player. */
        readonly connected: boolean;
        /** True only on the update where a controller was bound to this player. */
        readonly justConnected: boolean;
        /** True only on the update where the controller went away. */
        readonly justDisconnected: boolean;
        /** How the controller is connected, or null when there is none. */
        readonly connection: Connection | null;
        /** Controller port (0 or 1) for `"port"` connections, otherwise -1. */
        readonly port: number;
        /** Multitap slot (0-3, 0 without a multitap) for `"port"` connections, otherwise -1. */
        readonly slot: number;
        /**
         * Kind of device, a `TYPE_*` value (`TYPE_NONE` when empty). A
         * DualShock 2 stays `TYPE_DUALSHOCK` in digital mode; see `analog`.
         */
        readonly type: DeviceType;
        /** True while the controller is in analog mode, i.e. its sticks are live. */
        readonly analog: boolean;
        /** Bitmask of the buttons held at the last update. */
        readonly buttons: number;
        /** Bitmask of the buttons held at the update before the last one. */
        readonly previousButtons: number;
        /** True when face, shoulder and d-pad buttons report real pressure (DualShock 2/3). */
        readonly hasPressure: boolean;
        /** True once the vibration motors are available. */
        readonly hasRumble: boolean;
        /**
         * Radial dead zone used by `leftStick()` and `rightStick()`, in
         * [0, 0.95]. Defaults to 0.15; set 0 for unfiltered values. Belongs to
         * the player, so it applies to whichever controller is bound.
         */
        deadzone: number;
        /** Same as `leftStick().x`, without allocating an object. */
        readonly leftX: number;
        /** Same as `leftStick().y`, without allocating an object. */
        readonly leftY: number;
        /** Same as `rightStick().x`, without allocating an object. */
        readonly rightX: number;
        /** Same as `rightStick().y`, without allocating an object. */
        readonly rightY: number;

        /** True when every button in `buttons` (e.g. `L1 | R1`) is held. */
        pressed(buttons: number): boolean;
        /** True on the update the `buttons` combination became fully held. */
        justPressed(buttons: number): boolean;
        /** True on the update the last held button of `buttons` was released. */
        justReleased(buttons: number): boolean;
        /** True when at least one button in `buttons` is held, e.g. any d-pad direction. */
        anyPressed(buttons: number): boolean;
        /** True on the update at least one button in `buttons` became held. */
        anyJustPressed(buttons: number): boolean;
        /**
         * Auto repeat for menus: true on the update a button in `buttons`
         * becomes held, then after `delayMs` (default 400) and every
         * `intervalMs` (default 100) while it stays held. Stateless, so it
         * can be called any number of times per frame.
         */
        repeatPressed(buttons: number, delayMs?: number, intervalMs?: number): boolean;
        /**
         * D-pad as a direction: each axis is -1, 0 or 1; y is negative upwards
         * like the sticks. Opposite directions held together cancel out.
         */
        dpad(): { x: -1 | 0 | 1; y: -1 | 0 | 1 };
        /**
         * Left stick in [-1, 1] with the dead zone applied; y is negative
         * upwards. Allocates an object per call; prefer `leftX`/`leftY` in
         * per-frame code for many players.
         */
        leftStick(): { x: number; y: number };
        /** Right stick in [-1, 1] with the dead zone applied; y is negative upwards. */
        rightStick(): { x: number; y: number };
        /**
         * How hard one button is pressed, in [0, 1]. Buttons without a sensor
         * report 1 while held. On a DualShock 4 only L2 and R2 are analog.
         */
        pressure(button: Button): number;
        /**
         * Vibrates the controller. `strong` drives the big motor and `weak`
         * the small one, both in [0, 1]; the small motor of the DualShock 2
         * and 3 only switches on (any `weak` above 0) or off. With
         * `durationMs` the motors stop by themselves, otherwise they run
         * until changed. Cleared when the controller disconnects; ignored
         * while the player has no controller.
         */
        rumble(strong: number, weak?: number, durationMs?: number): void;
        /** Stops both motors. */
        stopRumble(): void;
        /**
         * Requests analog (`true`, the default) or digital mode for PS2
         * controllers. When `lock` is true (default) the ANALOG button cannot
         * change it. Kept by the player and applied to every controller bound
         * to it. DualShock 3/4 are always analog.
         */
        setAnalog(enabled: boolean, lock?: boolean): void;
        /**
         * Stores the Bluetooth adapter's address in the DualShock 3/4 plugged
         * in over USB for this player, so it connects wirelessly once
         * unplugged. Needs the `usb` and `bluetooth` drivers.
         *
         * This **replaces the pairing saved in the controller**: a DualShock 3
         * paired with a PS3 stops connecting to it. It therefore requires an
         * explicit `{ overwrite: true }`; ask the user before calling it.
         *
         * Returns false when no Bluetooth adapter is present (see
         * `drivers().bluetooth.adapter`). Throws `TypeError` without the
         * confirmation or when the controller is not on USB. Blocks for a few
         * milliseconds.
         */
        pairBluetooth(options: { overwrite: true }): boolean;
        /**
         * Plain snapshot of the player (connection, type, buttons, sticks,
         * d-pad, capabilities), so `JSON.stringify(player)` and logging show
         * its state.
         */
        toJSON(): {
            index: number; connected: boolean; connection: Connection | null;
            port: number; slot: number; type: DeviceType; analog: boolean; buttons: number;
            leftStick: { x: number; y: number }; rightStick: { x: number; y: number };
            dpad: { x: number; y: number }; hasPressure: boolean; hasRumble: boolean;
            deadzone: number;
        };
    }

    /**
     * Polls every controller and captures this frame's snapshot. Call exactly
     * once per frame. The first call loads padman and the enabled drivers.
     * Throws `InternalError` when padman cannot be started; optional drivers
     * that fail are reported by `drivers()` instead.
     */
    function update(): void;
    /** Returns the persistent object of player `index` (0 to `MAX_PLAYERS - 1`). */
    function player(index: number): Player;
    /** All players, by index. The array cannot be modified. */
    const players: readonly Player[];
    /** Players with a controller bound, by index. */
    function connectedPlayers(): Player[];
    /**
     * First player whose `justPressed(buttons)` is true, or null. Useful for
     * "press START to join" screens.
     */
    function findJustPressed(buttons: number): Player | null;

    /**
     * Enables or disables optional drivers; omitted options keep their value.
     * All start disabled. An enabled driver is loaded on the next `update()`
     * and costs IOP memory from then on. Enable drivers before the first
     * update so the controllers on them join the start-up assignment order;
     * enabled later, they get players as they are found. Disabling a loaded
     * driver releases its controllers but does not unload it.
     */
    function configure(options: { multitap?: boolean; usb?: boolean; bluetooth?: boolean }): void;
    /**
     * Enabled and ready state of each optional driver. For Bluetooth,
     * `adapter` tells whether a USB Bluetooth adapter was found (one RPC; do
     * not call every frame).
     */
    function drivers(): {
        multitap: DriverState;
        usb: DriverState;
        bluetooth: DriverState & { readonly adapter: boolean };
    };
    /** True while a multitap is plugged into controller `port` (0 or 1). */
    function hasMultitap(port: number): boolean;
    /**
     * Exchanges the controllers of players `a` and `b`, with their buttons,
     * edges and rumble; either may be empty. Dead zone and analog preference
     * stay with each player and are applied to the controller it receives.
     * Use it to let whoever presses START first become player 0:
     * ```js
     * const who = Gamepad.findJustPressed(Gamepad.START);
     * if (who) Gamepad.swapPlayers(0, who.index);
     * ```
     */
    function swapPlayers(a: number, b: number): void;

    /** Number of players, and length of `players`. */
    const MAX_PLAYERS: 8;

    /*
     * Button bits. Combine them with `|` for the methods that take a mask,
     * e.g. `player.pressed(Gamepad.L1 | Gamepad.R1)`.
     */
    const SELECT: 0x0001;
    const L3: 0x0002;
    const R3: 0x0004;
    const START: 0x0008;
    const UP: 0x0010;
    const RIGHT: 0x0020;
    const DOWN: 0x0040;
    const LEFT: 0x0080;
    const L2: 0x0100;
    const R2: 0x0200;
    const L1: 0x0400;
    const R1: 0x0800;
    const TRIANGLE: 0x1000;
    const CIRCLE: 0x2000;
    const CROSS: 0x4000;
    const SQUARE: 0x8000;

    /** A single button, as taken by `pressure()`. */
    type Button = typeof SELECT | typeof L3 | typeof R3 | typeof START |
        typeof UP | typeof RIGHT | typeof DOWN | typeof LEFT |
        typeof L2 | typeof R2 | typeof L1 | typeof R1 |
        typeof TRIANGLE | typeof CIRCLE | typeof CROSS | typeof SQUARE;

    const TYPE_NONE: 0;
    const TYPE_NEJICON: 0x2;
    const TYPE_KONAMIGUN: 0x3;
    const TYPE_DIGITAL: 0x4;
    const TYPE_ANALOG: 0x5;
    const TYPE_NAMCOGUN: 0x6;
    const TYPE_DUALSHOCK: 0x7;
    const TYPE_JOGCON: 0xE;
    const TYPE_DUALSHOCK3: 0x1003;
    const TYPE_DUALSHOCK4: 0x1004;

    /** Value of `player.type`. */
    type DeviceType = typeof TYPE_NONE | typeof TYPE_NEJICON | typeof TYPE_KONAMIGUN |
        typeof TYPE_DIGITAL | typeof TYPE_ANALOG | typeof TYPE_NAMCOGUN |
        typeof TYPE_DUALSHOCK | typeof TYPE_JOGCON | typeof TYPE_DUALSHOCK3 |
        typeof TYPE_DUALSHOCK4;
}


/* === Module: GLTF3D (gltf3d) === */
/** glTF 2.0 / GLB scenes with their node hierarchy and animations.
 * Model3D.load() keeps reading single meshes; GLTF3D.load() reads whole
 * scenes: nodes become Scene3D nodes (TRS, or a matrix decomposed into TRS),
 * every triangle primitive a Model3D mesh (extra primitives of a mesh become
 * child nodes), and every animation an Animation3D clip whose targets are
 * node indices. Skins deform their meshes every draw (in C) from the joint
 * nodes, which the clips animate. Morph targets and CUBICSPLINE tracks are
 * supported within the limits of Model3D/Animation3D.
 * ```js
 * const hero = GLTF3D.load("models/hero.glb");
 * scene.root.add(hero.root);
 * const walk = new Animation3D.Player(hero.clips.walk, hero.nodes);
 * walk.loop = true; walk.play();
 * ``` */
declare namespace GLTF3D {
    interface Asset {
        /** Group holding the default scene's root nodes. */
        root: Scene3D.Node;
        /** Every node in file order: the clips' target indices. */
        nodes: Scene3D.Node[];
        /** Node names, "" when unnamed. */
        names: string[];
        /** Clips by animation name (the index for unnamed ones). */
        clips: { [name: string]: Animation3D.Clip };
    }
    /** material, as in Model3D.load(), replaces every primitive's material. */
    function load(path: string, material?: Model3D.Material): Asset;
    /** Self-contained GLB, at most 16 MiB. Borrows ArrayBuffer/Uint8Array
     * bytes only for this synchronous main-thread call; all scene data and
     * decoded pixels are copied. Subarrays may be unaligned (temporary copy).
     * origin is a nonempty diagnostic name. URI buffers/external images are
     * rejected before construction; no file I/O or GS upload. */
    function loadMemory(bytes: ArrayBuffer | Uint8Array, origin: string, material?: Model3D.Material): Asset;

    type LoaderPhase = 'copy' | 'parse' | 'dependencies' | 'validate' | 'nodes' | 'links' | 'skins' | 'clips' | 'done';
    /** Resumable GLB load: each step() runs one bounded unit on the main
     * thread. The first steps ('copy', 256 KiB each) snapshot the bytes into
     * memory the loader owns; the source is pinned until the phase leaves
     * 'copy', so do not modify it before that. Later units are atomic: the
     * parse, the validation, one primitive (including decoding its embedded
     * textures) or meshless node, the hierarchy links, one skin or one
     * animation. Dispose it to abandon the load; unreferenced loaders are
     * freed by GC. */
    class Loader {
        private constructor();
        /** Phase names by native phase index (the order of phaseStatsInto). */
        static readonly PHASES: readonly string[];
        /** Runs up to `units` (1..64, default 1) consecutive units of the same
         * phase. false while work remains, true once finished. Throws the load
         * error, and keeps throwing it; then dispose(). */
        step(units?: number): boolean;
        /** Runs at least one unit, then more until `budgetMs` (0..1000, default 0 =
         * one unit) has elapsed: a single call for a time slice, timed by the
         * native loader. Same results as step(); false while work remains, true
         * once finished; lastUnits is the number of units that ran. */
        run(budgetMs?: number): boolean;
        /** Units, total time and largest single unit per phase so far. */
        /** Same numbers as `phaseStats`, written into a Float64Array (units, totalMs,
         * maxMs at index 3 * phase index; at least 3 * PHASES.length elements): no allocation. */
        phaseStatsInto(out: Float64Array): void;
        readonly phaseStats: { [phase: string]: { units: number; totalMs: number; maxMs: number } };
        /** The Asset, after step() returned true. Spends the loader. */
        finish(): Asset;
        /** Frees whatever was not delivered; idempotent. */
        dispose(): void;
        /** The next unit's phase ('disposed' once finished or disposed). */
        readonly phase: LoaderPhase | 'disposed';
        /** The phase the last step() ran. */
        readonly lastPhase: LoaderPhase | 'disposed';
        /** Native steps the last step() call ran (at most `units`). */
        readonly lastUnits: number;
        /** Files named by relative URI (external buffers and images), listed after
         * the parse step when started with `{ dependencies: true }`; else empty.
         * Read each one yourself (the loader does no I/O) and give it to provide(). */
        readonly dependencies: { uri: string; image: boolean; provided: boolean }[];
        /** Hands over the bytes of dependencies[index] (ArrayBuffer/Uint8Array,
         * 1 byte to 16 MiB, once). They are used, not copied: do not modify the
         * buffer until finish() or dispose(). While files are missing step()
         * returns false and does nothing (phase 'dependencies'). Absolute, scheme,
         * drive and ".." URIs are rejected, at most 64 files. */
        provide(index: number, bytes: ArrayBuffer | Uint8Array): void;
        readonly unitsDone: number;
        /** 0 until validation has counted the units. */
        readonly unitsTotal: number;
    }
    /** Starts a resumable load of a self-contained GLB (see loadMemory for the
     * input rules, checked while stepping). Snapshots bytes <= 16 MiB while
     * the loader is in its 'copy' phase. *
     * `options.borrow: true` uses the bytes in place (no 'copy' phase and no snapshot
     * RAM) when they are 4-byte aligned, otherwise the snapshot is made as usual; the
     * buffer is pinned and must not be modified until finish() or dispose(). */
    function beginMemory(bytes: ArrayBuffer | Uint8Array, origin: string, material?: Model3D.Material, options?: { dependencies?: boolean; borrow?: boolean }): Loader;
}


/* === Module: LOD (lod) === */
/**
 * Distance-based level of detail for Scene3D nodes: forests, cities, crowds.
 *
 * A Group gives a node meshes by distance from the camera; beyond the last
 * level, or beyond the global draw distance, the node is hidden. Selection
 * runs in C, uses the node's world position of the last scene update (one
 * frame of latency) and touches the node only when its level changes, so it
 * must run before Scene3D's update: `setCamera()` adds a Loop POST_UPDATE
 * system at priority -100 (Scene3D's attachLoop() defaults to 0); games
 * without it call `LOD.update(camera)` before `scene.update()`. A
 * hysteresis band (default 10% of each threshold) stops flicker. While a
 * group is enabled it owns its node's `visible` flag. Keep Group handles
 * alive for as long as they are needed; disposing/collecting one removes it.
 *
 * Not in the default build: `node tools/modules.js configure --modules=lod,...`
 *
 * Example:
 * ```js
 * const groups = trees.map(tree => new LOD.Group(tree,
 *     [{ mesh: treeHigh, until: 15 }, { mesh: treeLow, until: 45 }, { mesh: billboard, until: 90 }]));
 * LOD.setCamera(camera);
 * LOD.setDrawDistance(90, { lights, color: [0.6, 0.7, 0.85] });   // fog hides the cut
 * ```
 */
declare namespace LOD {
    const MAX_LEVELS: 8;
    /** Group.level of a hidden node. */
    const HIDDEN: -1;
    interface Level {
        /** null hides the node in this band. */
        mesh: Model3D.Mesh | null;
        /** Used while the distance is below this (increasing, > 0). */
        until: number;
    }
    interface Stats {
        groups: number; hidden: number; changes: number; perLevel: number[];
        /** Groups whose level was computed this update (groups - the ones inside skipped cells). */
        evaluated: number;
        /** Grid cells visited / skipped whole (0 without setGrid). */
        cells: number; cellsSkipped: number;
    }
    class Group {
        /** Retains the node and meshes. hysteresis: 0 to 0.5 of each threshold (default 0.1). */
        constructor(node: Scene3D.Node, levels: Level[], options?: { hysteresis?: number });
        /** Current level, HIDDEN, or -2 before the first selection. */
        readonly level: number;
        /** Distance at the last evaluation (not refreshed while the grid skips the group's cell). */
        readonly distance: number;
        /** Disabled groups leave the node alone. */
        enabled: boolean;
        dispose(): void;
    }
    /** Selects levels every frame with this camera (retained); null stops. */
    function setCamera(camera: Camera3D.Camera | null): void;
    /** Selects every level now; returns the number of changes, or fills stats. */
    function update(camera: Camera3D.Camera): number;
    function update<T extends object>(camera: Camera3D.Camera, stats: T): T & Stats;
    /** Of the last selection. */
    function stats<T extends object = Stats>(out?: T): T & Stats;
    /**
     * Optional spatial index for many groups (0 turns it off, the default). Groups are binned by the
     * world position of their node into cells of `cellSize`; static groups cost nothing per update, and
     * a cell is skipped whole when all its groups are already hidden by distance and the cell lies
     * beyond their farthest threshold. The selection (levels, hysteresis, visibility) is identical to
     * the full traversal; `capacity` (default 1024) bounds the cells, extra groups are still evaluated
     * every update. Pick `cellSize` near the largest `until`. Moved nodes are noticed through Scene3D
     * updates, so nodes moved after the last `scene.update()` are seen one frame late, as without the grid.
     */
    function setGrid(cellSize: number, options?: { capacity?: number }): void;
    /** Multiplies every threshold (quality setting, default 1). */
    function setBias(bias: number): void;
    /**
     * Hides nodes beyond distance (0: no limit). With `lights`, sets their
     * fog from fogStart (default 60%) to distance in `color`, so the cut
     * fades instead of popping.
     */
    function setDrawDistance(distance: number, options?: { lights?: Lights.Set; fogStart?: number; color?: [number, number, number] }): void;
}


/* === Module: Draw (draw) === */
/**
 * Immediate-mode 2D primitives rendered by the PS2 GS.
 *
 * Coordinates may be fractional and are interpreted in screen space.
 * Drawing is queued; call `Screen.flip()` to present the completed frame.
 * Colors are packed `Color.Value` values.
 */
declare namespace Draw {
    /** Draws a single point. */
    function point(x: number, y: number, color: Color.Value): void;

    /** Draws a solid-color line segment. */
    function line(x1: number, y1: number, x2: number, y2: number,
        color: Color.Value): void;

    /** Draws a solid-color triangle. */
    function triangle(x1: number, y1: number, x2: number, y2: number,
        x3: number, y3: number, color: Color.Value): void;

    /** Draws a Gouraud-shaded triangle with one color per vertex. */
    function triangleGouraud(
        x1: number, y1: number, color1: Color.Value,
        x2: number, y2: number, color2: Color.Value,
        x3: number, y3: number, color3: Color.Value
    ): void;

    /** Draws a solid-color quadrilateral as a GS triangle strip. */
    function quad(x1: number, y1: number, x2: number, y2: number,
        x3: number, y3: number, x4: number, y4: number,
        color: Color.Value): void;

    /** Draws a Gouraud-shaded quadrilateral with one color per vertex. */
    function quadGouraud(
        x1: number, y1: number, color1: Color.Value,
        x2: number, y2: number, color2: Color.Value,
        x3: number, y3: number, color3: Color.Value,
        x4: number, y4: number, color4: Color.Value
    ): void;

    /**
     * Draws a solid-color rectangle. Width and height are at least 1 and
     * whole pixels; under a Camera2D camera they are world units, any
     * positive size (0.5 is 2 pixels at zoom 4), and turn with the camera.
     */
    function rect(x: number, y: number, width: number, height: number,
        color: Color.Value): void;

    /** Draws a circle outline or filled circle. */
    function circle(x: number, y: number, radius: number,
        color: Color.Value, filled?: boolean): void;
}


/* === Module: Screen (screen) === */
/**
 * Display, frame synchronization, VRAM statistics and GS state controls.
 *
 * A typical frame is `Screen.clear()`, drawing commands, then `Screen.flip()`.
 * Most numeric constants are raw PS2 GS values and are intended to be passed
 * back to this module rather than interpreted as application-level units.
 */
declare namespace Screen {
    /** Current video configuration accepted by `getMode()` and `setMode()`. */
    interface VideoMode {
        /** Video mode identifier such as `NTSC` or `PAL`. */
        mode: number;
        /** Visible width in pixels. */
        width: number;
        /** Visible height in pixels. */
        height: number;
        /** Color pixel storage format such as `CT32` or `CT24`. */
        psm: number;
        /** Interlaced/progressive mode. */
        interlace: number;
        /** Field/frame timing mode. */
        field: number;
        /** Depth-buffer pixel storage format. */
        psmz: number;
        /** Enables depth buffering. */
        zbuffering: boolean;
        /** Enables double-buffered presentation. */
        double_buffering: boolean;
        /** Reserved for future multi-pass rendering; only zero is currently accepted. */
        pass_count?: number;
    }

    /** Arguments for the GS alpha blend equation. */
    interface AlphaEquation {
        a: number;
        b: number;
        c: number;
        d: number;
        fix: number;
    }

    /** Pixel bounds used by the GS scissor register. */
    interface ScissorBounds {
        x0: number;
        y0: number;
        x1: number;
        y1: number;
    }

    /** Presents the completed draw buffer and synchronizes the frame. */
    function flip(): void;
    /** Clears the current draw buffer using a packed RGBA color. */
    function clear(color?: number): void;
    /** Blocks until the next vertical blank starts. */
    function waitVblankStart(): void;
    /** Enables or disables synchronization with vertical blank. */
    function setVSync(enabled: boolean): void;
    /** Enables or disables the on-screen frame counter. */
    function setFrameCounter(enabled: boolean): void;
    /**
     * Returns the total or used VRAM amount for the selected `VRAM_*`
     * accounting mode. `VRAM_UPLOADED` is the bytes uploaded to VRAM during
     * the last frame: a scene that keeps it high is thrashing VRAM.
     */
    function getMemoryStats(mode?: number): number;
    /** Returns currently unallocated VRAM in bytes. */
    function getFreeVRAM(): number;
    /** Returns the measured FPS over the requested positive frame interval. */
    function getFPS(interval: number): number;
    /** Returns the active video configuration. */
    function getMode(): VideoMode;
    /** Reconfigures the video mode and render targets; invalid modes throw. */
    function setMode(mode: VideoMode): void;
    /** Packs the five GS alpha-equation fields into a register value. */
    function alphaEquation(a: number, b: number, c: number, d: number,
        fix: number): bigint;
    /** Reads a supported GS parameter by its `Screen` constant. */
    function getParam(param: number): number | bigint | AlphaEquation | ScissorBounds;
    /** Writes a supported GS parameter by its `Screen` constant. */
    function setParam(param: number, value: number | bigint | AlphaEquation | ScissorBounds): void;
    /** Switches the active GS context and returns its native result code. */
    function switchContext(): number;
    /** Sends queued graphics commands without waiting for DMA, VIF/GIF completion, or VBlank. */
    function flush(): void;

    const VRAM_SIZE: number;
    const VRAM_USED_TOTAL: number;
    const VRAM_USED_STATIC: number;
    const VRAM_USED_DYNAMIC: number;
    const VRAM_UPLOADED: number;
    const ALPHA_TEST_ENABLE: number;
    const ALPHA_TEST_METHOD: number;
    const ALPHA_TEST_REF: number;
    const ALPHA_TEST_FAIL: number;
    const DST_ALPHA_TEST_ENABLE: number;
    const DST_ALPHA_TEST_METHOD: number;
    const DEPTH_TEST_ENABLE: number;
    const DEPTH_TEST_METHOD: number;
    const ALPHA_BLEND_EQUATION: number;
    const SCISSOR_BOUNDS: number;
    const PIXEL_ALPHA_BLEND_ENABLE: number;
    const COLOR_CLAMP_MODE: number;
    const ALPHA_NEVER: number;
    const ALPHA_ALWAYS: number;
    const ALPHA_LESS: number;
    const ALPHA_LEQUAL: number;
    const ALPHA_EQUAL: number;
    const ALPHA_GEQUAL: number;
    const ALPHA_GREATER: number;
    const ALPHA_NEQUAL: number;
    const ALPHA_FAIL_NO_UPDATE: number;
    const ALPHA_FAIL_FB_ONLY: number;
    const ALPHA_FAIL_ZB_ONLY: number;
    const ALPHA_FAIL_RGB_ONLY: number;
    const DST_ALPHA_ZERO: number;
    const DST_ALPHA_ONE: number;
    const DEPTH_NEVER: number;
    const DEPTH_ALWAYS: number;
    const DEPTH_GEQUAL: number;
    const DEPTH_GREATER: number;
    const SRC_RGB: number;
    const DST_RGB: number;
    const ZERO_RGB: number;
    const SRC_ALPHA: number;
    const DST_ALPHA: number;
    const ALPHA_FIX: number;
    const BLEND_DEFAULT: bigint;
    const BLEND_ADD_NOALPHA: bigint;
    const BLEND_ADD: bigint;
    const NTSC: number;
    const PAL: number;
    const DTV_480p: number;
    const DTV_576p: number;
    const DTV_720p: number;
    const DTV_1080i: number;
    const INTERLACED: number;
    const PROGRESSIVE: number;
    const FIELD: number;
    const FRAME: number;
    const CT32: number;
    const CT24: number;
    const CT16: number;
    const CT16S: number;
    const Z32: number;
    const Z24: number;
    const Z16: number;
    const Z16S: number;
    const DRAW_BUFFER: number;
    const DISPLAY_BUFFER: number;
    const DEPTH_BUFFER: number;
}


/* === Module: System Core (system) === */
/**
 * PS2 system, filesystem, timing and hardware helpers.
 *
 * Paths use the PS2 device syntax such as `host:/`, `mass:/` or `mc0:/`.
 * Return values from filesystem and device operations are native result codes;
 * callers should check them before continuing.
 *
 * Example:
 * ```js
 * console.log(System.bootPath);
 * for (const entry of System.listDir('host:/')) {
 *     console.log(entry.dir ? '[DIR]' : entry.size, entry.name);
 * }
 * System.sleep(16);
 * ```
 */
declare namespace System {
    /** One directory entry returned by `listDir()`. */
    interface DirectoryEntry {
        /** File or directory name. */
        name: string;
        /** File size in bytes; directory sizes may be zero. */
        size: number;
        /** True when this entry is a directory. */
        dir: boolean;
    }

    /** Memory counters returned by `getMemoryStats()`. */
    interface MemoryStats {
        /** Core/binary footprint in bytes. */
        core: number;
        /** Reserved native stack in bytes. */
        nativeStack: number;
        /** Current native allocations in bytes. */
        allocs: number;
        /** Highest observed current native allocation total in bytes since startup. */
        allocsPeak: number;
        /** Failed nonzero native allocation requests since startup. */
        allocationFailures: number;
        /** Total reported usage in bytes. */
        used: number;
        /** Total arena and mapped regions requested from the EE heap. */
        heapReserved: number;
        /** Bytes in allocator in-use chunks, including chunk overhead. */
        heapAllocated: number;
        /** Approximate allocator metadata/alignment overhead in bytes. */
        heapOverhead: number;
        /** Bytes in reusable free chunks. */
        heapFree: number;
        /** Number of free chunks in the allocator. */
        heapFreeChunks: number;
        /** Free bytes in the topmost releasable chunk. */
        heapTopFree: number;
        /** Free bytes outside the top chunk; a fragmentation indicator. */
        heapNonTopFree: number;
        /** Bytes allocated by the QuickJS runtime, measured like `allocs` and part of it. */
        jsHeap: number;
        /** Current QuickJS allocation ceiling in bytes. Initially half of free RAM at runtime start; may be recalculated with `setNativeMemoryHeadroom()`. */
        jsLimit: number;
        /** Live JavaScript objects. */
        jsObjects: number;
    }

    /** EE CPU information returned by `getCPUInfo()`. */
    interface CPUInfo {
        /** EE CPU implementation identifier. */
        implementation: number;
        /** EE CPU revision identifier. */
        revision: number;
        /** Installed EE RAM size in bytes. */
        RAMSize: number;
        /** EE bus clock frequency. */
        BUSClock: number;
        /** EE CPU clock frequency. */
        CPUClock: number;
        /** PS2 machine type identifier. */
        MachineType: number;
    }

    /** Recalculates the QuickJS heap ceiling using current free EE memory and
     * leaves `bytes` available for native assets at this snapshot. Call at a
     * phase boundary before loading assets. Native allocations made later can
     * consume this headroom. At least 64 KiB must remain available for JS.
     * Returns the resulting QuickJS allocation limit in bytes. */
    function setNativeMemoryHeadroom(bytes: number): number;

    /** Memory-card status returned by `getMCInfo()`. */
    interface MemoryCardInfo {
        /** Memory-card type identifier. */
        type: number;
        /** Free memory reported by the card driver. */
        freemem: number;
        /** Format/status flag reported by the card driver. */
        format: number;
    }

    /** GS GPU information returned by `getGPUInfo()`. */
    interface GPUInfo {
        revision: number;
        id: number;
    }

    /** One registered filesystem/device entry. */
    interface DeviceInfo {
        name: string;
        desc: string;
    }

    /** The path from which the application booted (e.g. "mass0:/", "cdfs:/") */
    const bootPath: string;
    /** Legacy alias for bootPath. */
    const boot_path: string;

    /** Lists entries in a directory or path relative to `bootPath`. */
    function listDir(path?: string): DirectoryEntry[];

    /** Removes an empty directory and returns the underlying system result. */
    function removeDirectory(path: string): number;

    /** Copies a file and returns zero on success. */
    function copyFile(source: string, destination: string): number;

    /** Moves or renames a file and returns zero on success. */
    function moveFile(source: string, destination: string): number;
    /** Renames a file or directory and returns the native result code. */
    function rename(source: string, destination: string): number;

    /** Returns raw EE CPU clock ticks. */
    function getTicks(): number;

    /** Returns high-resolution elapsed time in milliseconds. */
    function getMilliseconds(): number;

    /** Suspends the current EE thread for the specified milliseconds. */
    function sleep(ms: number): void;

    /** Returns currently used EE RAM in bytes. */
    function getUsedMemory(): number;

    /** Returns remaining available EE RAM in bytes. */
    function getFreeMemory(): number;

    /** Yields briefly to the EE scheduler. */
    function delay(): void;

    /** Returns memory counters from the legacy System API. */
    function getMemoryStats(): MemoryStats;

    /** Returns basic EE CPU and memory information. */
    function getCPUInfo(): CPUInfo;

    /** Returns basic GS GPU information. */
    function getGPUInfo(): GPUInfo;

    /** Returns the console temperature in Celsius when supported. */
    function getTemperature(): number | undefined;

    /** Returns memory-card information for a controller port (0 or 1). */
    function getMCInfo(port?: number): MemoryCardInfo;

    /** Returns information about a mass-storage block device. */
    function getBDMInfo(device: string): { name: string; index: number } | undefined;

    /** Returns currently registered file-system devices. */
    function devices(): DeviceInfo[];

    /** Mounts a block device at a file-system mount point. */
    function mount(mountpoint: string, blockdev: string, mode?: number): number;

    /** Unmounts a file-system device. */
    function umount(device: string): number;

    /** Loads an ELF using the legacy Athena loader. */
    function loadELF(path: string, args?: string[]): number;

    /** Enables or disables the legacy dark-mode flag. */
    function setDarkMode(enabled: boolean): void;

    /** Forces a QuickJS garbage-collection cycle. */
    function gc(): void;

    /** Exit application to the PS2 browser/OSDSYS */
    function exit(): void;

    /** Alias for exiting to the PS2 browser/OSDSYS. */
    function exitToBrowser(): void;
}


/* === Module: Debug (debug) === */
/**
 * On-screen diagnostics, for the console where there is no terminal.
 *
 * Everything is drawn after the game's draw by a Loop system that exists only
 * while something is on. Games with their own loop call `Debug.frame(dt)`
 * after drawing. The overlay text refreshes 4 times per second and is laid
 * out once per refresh; the frame-time graph, the console tail and the
 * rects, lines and circles are computed and drawn in C, so a hitbox per
 * entity per frame allocates nothing. The overlay shows its own cost
 * ("debug x ms").
 *
 * It never takes the game down: arguments are checked at the call (a bad
 * color throws there), and an error while drawing turns the module off and
 * is logged once. Shapes are capped at 2048 (texts too); the oldest go and
 * the overlay counts them.
 *
 * The panels stay inside the title-safe area (5% of each edge), which CRT
 * TVs do not cut, and use the built-in font at 16 px.
 *
 * Not in the default build: `node tools/modules.js configure --modules=debug,...`
 *
 * Example:
 * ```js
 * Debug.overlay(true);                          // FPS, CPU, RAM, JS heap, VRAM, graph
 * Debug.console(true, { lines: 6 });            // last lines of console.log
 * Debug.watch("player", () => `${player.x | 0},${player.y | 0} ${player.state}`);
 * Debug.toggleWith(Gamepad.L3 | Gamepad.R3);    // show / hide everything
 *
 * // In update(): hitboxes for a second, in world coordinates.
 * Debug.rect(enemy.x, enemy.y, 16, 16, Color.new(255, 0, 0), { seconds: 1, space: "world" });
 * Debug.text(enemy.x, enemy.y - 10, "hit!", { seconds: 0.5, space: "world" });
 * ```
 */
declare namespace Debug {
    interface ShapeOptions {
        /** How long it stays, in real seconds (default 0: this frame only). */
        seconds?: number;
        /** "screen" (default) or "world", through `setView()`. */
        space?: "screen" | "world";
        /** Filled instead of an outline (rect and circle). */
        filled?: boolean;
    }

    interface TextOptions extends ShapeOptions {
        /** Text color (default white). */
        color?: Color.Value;
    }

    interface ConsoleOptions {
        /** Screen lines shown, 1 to 40 (default 8). */
        lines?: number;
    }

    interface View {
        /** World point at the top-left corner of the screen (default 0). */
        x?: number;
        y?: number;
        /** Screen pixels per world unit (default 1). */
        scale?: number;
    }

    interface Config {
        /**
         * Frame budget in milliseconds for the graph colors. 0 (default)
         * derives it from the video mode (60 Hz, or 50 Hz for PAL and 576p)
         * and `vsyncInterval`.
         */
        budgetMs?: number;
        /** The `vsyncInterval` given to Loop.run(), 1 to 4 (default 1; 2 for 30 fps). */
        vsyncInterval?: number;
        /**
         * Distance from the screen edges in pixels, one number or { x, y }.
         * null (default) is the title-safe area, 5% of each side.
         */
        margin?: number | { x: number; y: number } | null;
        /** Font of every text (default the built-in font at 16 px). */
        font?: Font;
    }

    /** Figures of the frame-time graph. */
    interface FrameStats {
        samples: number;
        frameAvg: number;
        frameMax: number;
        cpuAvg: number;
        cpuMax: number;
    }

    /**
     * Shows or hides the stats panel: FPS, CPU and frame time (average and
     * peak of the last 60 frames) and the frame budget, RAM, free VRAM, the
     * module's own cost, the watches, and a frame-time graph: green under 75% of the budget, yellow up to it, red
     * over it, magenta for a dropped frame. Returns whether it is on.
     * Measured on the PS2: about 1.1 ms per frame with the console (0.95 ms
     * compact; the graph is about 0.45 ms of it). The overlay shows its own
     * cost as "debug x ms".
     */
    function overlay(on?: boolean, options?: OverlayOptions): boolean;

    interface OverlayOptions {
        /** Draw the frame-time graph (default true). */
        graph?: boolean;
        /** Only the FPS line and the watches (default false). */
        compact?: boolean;
        /**
         * Adds the JavaScript heap size and object count (default false).
         * Reading them walks the whole heap: 6.7 ms in one frame on the PS2,
         * so it happens every 5 seconds, and is off by default because a
         * busy game would drop a frame each time.
         */
        heap?: boolean;
    }

    /**
     * Shows or hides the last lines the script printed (console.log, print,
     * errors), wrapped to the screen; lines that look like errors are red.
     * Returns whether it is on.
     */
    function console(on?: boolean, options?: ConsoleOptions): boolean;

    /**
     * Adds `name: read()` to the overlay, evaluated 4 times per second;
     * errors show inline and long values are cut at 48 characters.
     */
    function watch(name: string, read: () => unknown): void;
    /** Removes a watch; returns whether it existed. */
    function unwatch(name: string): boolean;

    /** Rectangle outline (or filled), for this frame or `seconds`. Default color red. */
    function rect(x: number, y: number, width: number, height: number,
        color?: Color.Value, options?: ShapeOptions): void;
    function line(x1: number, y1: number, x2: number, y2: number,
        color?: Color.Value, options?: ShapeOptions): void;
    function circle(x: number, y: number, radius: number,
        color?: Color.Value, options?: ShapeOptions): void;
    /**
     * Many rectangles in one call, from a Float32Array of x, y, width,
     * height groups (length a multiple of 4), checked and queued in C: for
     * the hitboxes of many entities, far cheaper than one `rect()` each.
     * Groups with a value that is not finite are skipped. Returns how many
     * were queued.
     */
    function rects(values: Float32Array, color?: Color.Value, options?: ShapeOptions): number;
    /** Many lines in one call, from x1, y1, x2, y2 groups; see `rects()`. */
    function lines(values: Float32Array, color?: Color.Value, options?: ShapeOptions): number;
    function text(x: number, y: number, text: unknown, options?: TextOptions): void;
    /** Removes every shape and text still on screen. */
    function clear(): void;

    /**
     * Shows and hides everything when the `buttons` combination is pressed
     * on the controller of `port` (0 or 1). The pad is read without
     * Gamepad.update(), so the game's justPressed() is unaffected. `null`
     * removes the shortcut.
     */
    function toggleWith(buttons: number | null, port?: 0 | 1): void;
    /** Shows or hides everything, like the shortcut; returns whether shown. */
    function show(on?: boolean): boolean;

    /**
     * World space of shapes drawn with `space: "world"`: screen = (world - x/y) * scale.
     * Used without a camera: while `Camera2D.getCurrent()` has one, world
     * shapes and texts follow it (zoom and rotation included) instead.
     */
    function setView(view: View): void;
    function configure(options: Config): void;

    /**
     * For games that do not use Loop.run(): call after drawing, before
     * Screen.flip(). `dt` is the frame time in seconds; `cpuMs` (optional)
     * feeds the graph. Not needed with Loop.run(): there it does nothing and
     * warns once.
     */
    function frame(dt: number, cpuMs?: number): void;

    /** Figures of the graph over the last `frames` frames (default 60). */
    function frameStats(frames?: number): FrameStats;
}


/* === Module: Profiler (profiler) === */
/**
 * Where the frame time goes, measured in C.
 *
 * Timer scopes read the EE cycle counter (COP0 Count) in C, so a begin/end
 * pair costs far less than two System.getMilliseconds() calls; counters sum
 * values per frame. Each frame closes into a ring of the last `HISTORY`
 * frames, from which `stats()` gives the last value, average, 95th
 * percentile and peak. Timers are inclusive: nested scopes count in their
 * parents too. A single begin/end span must be shorter than about 14 s (the
 * counter wraps).
 *
 * Not in the default build: `node tools/modules.js configure --modules=profiler,...`
 * (brings Loop and Debug).
 *
 * Example:
 * ```js
 * import * as Render3D from "Render3D";
 * Profiler.auto();                       // close frames after every Loop draw
 * Profiler.attachRender3D(Render3D);     // 3d.* counters + C clipper warning
 * Profiler.overlay(true);                // one line per scope in Debug
 *
 * const AI = Profiler.scope("ai");       // ids skip the name lookup
 * Profiler.begin(AI); updateAI(); Profiler.end(AI);
 * Profiler.measure("physics", () => world.step(dt));
 * Profiler.count("chunks.rebuilt", rebuilt);
 * ```
 */
declare namespace Profiler {
    /** Frames kept per scope (120). */
    const HISTORY: number;
    const MAX_SCOPES: number;
    /** Open scopes at once. */
    const MAX_DEPTH: number;
    /** A scope id from scope()/counter(), or its name (1 to 31 printable characters). */
    type Scope = number | string;

    interface Stats {
        name: string;
        kind: "timer" | "counter";
        /** Frames in the window. */
        samples: number;
        /** Per frame: milliseconds for timers, summed values for counters. */
        last: number;
        average: number;
        p95: number;
        peak: number;
        /** begin() (or count()) calls in the last frame and on average. */
        lastCalls: number;
        averageCalls: number;
    }

    /** Id of a timer scope, registered on first use. Scope 0 is "frame". */
    function scope(name: string): number;
    /** Id of a counter, registered on first use. */
    function counter(name: string): number;
    /** Opens a timer scope; a name is registered on first use. */
    function begin(scope: Scope): void;
    /** Closes the innermost scope; when given, it must be that scope (throws otherwise). */
    function end(scope?: Scope): void;
    /** Runs fn inside a timer scope and returns its result; closes on throw too. */
    function measure<R>(scope: Scope, fn: () => R): R;
    /** Adds value (default 1) to a counter for this frame. */
    function count(scope: Scope, value?: number): void;
    /** Raw unsigned clock; wraps after about 14.5 s on the EE. */
    function ticks(): number;
    /** Converts an unsigned tick difference: ticksToMilliseconds((end - start) >>> 0). */
    function ticksToMilliseconds(ticks: number): number;
    /**
     * Closes the frame and returns its length in ms. Not needed with auto().
     * Open scopes are split: their time so far goes to this frame.
     */
    function frame(): number;
    /** Closes the frames after every draw of Loop.run(). Returns whether on. */
    function auto(on?: boolean): boolean;
    /** Stats over the last `frames` frames (default the whole history). Optional `out` is reused. */
    function stats<T extends object = Stats>(scope: Scope, frames?: number, out?: T): T & Stats;
    /** Registered scope names, by id. */
    function names(): string[];
    /** Unmatched end() calls and begin() beyond MAX_DEPTH since the reset. */
    function errors(): number;
    /**
     * Records Render3D.frameStats() at each frame() as the counters
     * 3d.triangles, 3d.objects, 3d.passes, 3d.culled and 3d.cpuClip, and
     * logs (at most every 5 s, unless `warn: false`) when objects are
     * clipped in C on the EE. Pass the Render3D namespace, or null to stop.
     */
    function attachRender3D(render3d: typeof Render3D | null, options?: { warn?: boolean }): void;
    /** Shows a line per scope in the Debug overlay (turning it on), over `frames` frames (default 60). */
    function overlay(on?: boolean, options?: { frames?: number }): boolean;
    /** The overlay line of a scope, e.g. "1.23 ms p95 2.10 max 3.40". */
    function describe(scope: Scope, frames?: number): string;
    /** Stats of every scope (allocates; for logs and tests). */
    function report(frames?: number): Stats[];
    /** Prints report() with console.log. */
    function log(frames?: number): void;
    /** Clears the history; forget = true also drops the names (ids become invalid). */
    function reset(forget?: boolean): void;
}


/* === Module: Shadows (shadows) === */
/** Static and captured texture shadow decals. Render opaque receivers first.
 * Textures use Model3D.Texture, independently of Image.
 * Position/scale accept xyz objects or arrays; rotation is a normalized xyzw
 * quaternion. Properties return copies; assigning TRS replaces setTransform. */
declare namespace Shadows {
    const SHADOW_BLEND_DARKEN: 0;
    const SHADOW_BLEND_ALPHA: 1;
    const SHADOW_BLEND_ADD: 2;
    type Vec3 = {x: number; y: number; z: number} | [number, number, number] | Float32Array;
    type Quaternion = {x: number; y: number; z: number; w: number} | [number, number, number, number] | Float32Array;
    /** GPU silhouette texture owner. Keep this alive while a projector uses
     * its texture; dispose the projector before the map. */
    class ShadowMap {
        constructor(width?: number, height?: number, filter?: 0 | 1);
        readonly texture: Model3D.Texture;
        /** Independent light camera; match its aspect to width/height. The
         * callback receives that camera for Scene3D/animated caster draws.
         * Materials and camera objects are never modified by capture. */
        capture(camera: Camera3D.Camera, caster: Model3D.Instance): undefined;
        capture<R>(camera: Camera3D.Camera, caster: (camera: Camera3D.Camera) => R): R;
        dispose(): void;
    }
    class Projector {
        /** Omitted texture creates a soft circular blob owned by the projector.
         * Supplied textures are borrowed: keep the handle live until dispose(). */
        constructor(texture?: Model3D.Texture);
        position: Vec3;
        rotation: Quaternion;
        scale: Vec3;
        setTransform(matrix: Matrix4): this;
        setSize(width: number, height: number): this;
        /** Grid dimensions 2..64; default 2x2, on the local XZ plane. */
        setGrid(x: number, z: number): this;
        /** Direction rays travel, normalized; default (0,-1,0). */
        setLightDir(x: number, y: number, z: number): this;
        /** Offset opposite lightDir, applied to all nodes; default .01. */
        setBias(bias: number): this;
        setLightOffset(distance: number): this;
        /** Minimum hit normal Y in [-1,1]; -1 disables the filter. */
        setSlopeLimit(cosine: number): this;
        /** Linear RGBA in [0,1]; default black with .75 opacity. */
        setColor(r: number, g: number, b: number, a: number): this;
        setBlend(mode: 0 | 1 | 2): this;
        setUVRect(u0: number, v0: number, u1: number, v1: number): this;
        /** Casts a segment centered on each transformed node along lightDir.
         * Misses/steep nodes omit incident triangles. The world is borrowed.
         * Queries run every render; geometry rebuilds only when it changes. */
        enableRaycast(world: Collision3D.World | null, rayLength?: number, enable?: boolean): this;
        /** Requires a camera and Screen zbuffering. Depth tests stay enabled,
         * depth writes disabled; restores GS state. Avoid calling in group().
         * Returns undefined when no triangle survives terrain projection. */
        render(camera: Camera3D.Camera, stats?: object | null): Render3D.Stats | undefined;
        dispose(): void;
    }
}


/* === Module: TileMap (tilemap) === */
/**
 * VU1-accelerated batched sprite and tilemap rendering.
 *
 * A `Descriptor` holds textures and materials; an `Instance` pairs one with a
 * native sprite buffer. Sprites are streamed to a VU1 microprogram in
 * batches, so thousands of quads cost little EE time. Draws are queued like
 * any other drawing; call `Screen.flip()` to present them.
 *
 * @example
 * ```js
 * const descriptor = new TileMap.Descriptor({
 *     textures: ["tiles.png"],
 *     materials: [{ textureIndex: 0, endOffset: 1 }],
 * });
 * const map = new TileMap.Instance({
 *     descriptor,
 *     spriteBuffer: TileMap.SpriteBuffer.fromObjects([
 *         { x: 0, y: 0, w: 32, h: 32, u2: 32, v2: 32 },
 *         { x: 32, y: 0, w: 32, h: 32, u1: 32, u2: 64, v2: 32 },
 *     ]),
 * });
 *
 * while (true) {
 *     Screen.clear();
 *     map.render(0, 0);
 *     Screen.flip();
 * }
 * ```
 */
declare namespace TileMap {
    /**
     * One draw state for a contiguous run of sprites. Material `i` draws the
     * sprites after material `i - 1`'s `endOffset` up to and including its
     * own `endOffset`.
     */
    interface Material {
        /**
         * Index into the descriptor's textures, or -1 for untextured
         * sprites. Defaults to 0 when the descriptor has textures, otherwise
         * -1.
         */
        textureIndex?: number;
        /**
         * Alpha blend equation from `Screen.alphaEquation()`. Defaults to
         * the current `Screen` equation at render time.
         */
        blendMode?: number;
        /** Index of the last sprite this material draws. Must not decrease. */
        endOffset: number;
    }

    /**
     * Tileset geometry. Tile `id` is the cell at column `id % columns`, row
     * `Math.floor(id / columns)` of the atlas texture, starting at texel
     * `margin + column * (tileWidth + spacing)` (likewise for rows).
     */
    interface Atlas {
        tileWidth: number;
        tileHeight: number;
        columns: number;
        /** When set, tile ids must be below `columns * rows`. */
        rows?: number;
        /**
         * Texels around the atlas edge. Default 0. For an extruded atlas
         * (tiles padded by `e` texels of their own border, so LINEAR
         * filtering at fractional zoom does not bleed neighbours) use
         * `margin: e` and `spacing: 2 * e`.
         */
        margin?: number;
        /** Texels between neighbouring tiles. Default 0. */
        spacing?: number;
    }

    interface DescriptorOptions {
        /** Required by `Instance.fromGrid()` and `Instance.setTiles()`. */
        atlas?: Atlas;
        /**
         * Textures by path or `Image`. Paths are loaded synchronously. An
         * `Image` that is still loading (for example from an `ImageList`) or
         * was freed skips the sprites of its materials until it is ready.
         */
        textures?: Array<string | Image>;
        /** At least one material, ordered by `endOffset`. */
        materials: Material[];
    }

    /** Immutable render description shared by any number of instances. */
    class Descriptor {
        constructor(options: DescriptorOptions);
        readonly materialCount: number;
        /** The `Image` objects the descriptor keeps alive. */
        readonly textures: Image[];
        readonly atlas: Atlas | undefined;
    }

    /** Tile id that hides a cell: `setTiles`/`fromGrid` give it zero size. */
    const EMPTY: number;

    /** Tile ids: a `Uint16Array` is used without copying. */
    type TileIds = Uint16Array | Int16Array | number[];

    interface GridOptions {
        /** Descriptor with an `atlas`. */
        descriptor: Descriptor;
        columns: number;
        rows: number;
        /** Row-major tile ids, `columns * rows` long; default all 0. */
        tiles?: TileIds;
        /** Cell size on screen; defaults to the atlas tile size. */
        tileWidth?: number;
        tileHeight?: number;
        zindex?: number;
    }

    interface RenderOptions {
        /** Draw only sprites [first, first + count). Disables culling. */
        first?: number;
        count?: number;
        /**
         * Grid instances draw only the cells on screen (plus one cell of
         * margin) by default; `false` draws every cell.
         */
        cull?: boolean;
    }

    /**
     * Native sprite storage. Buffers that are rendered must be 16-byte
     * aligned; `SpriteBuffer.create()` and `fromObjects()` always are. A
     * plain `new ArrayBuffer()` may not be.
     */
    type SpriteStorage = ArrayBuffer | ArrayBufferView;

    interface InstanceOptions {
        descriptor: Descriptor;
        /** Sprite records laid out as described by `TileMap.layout`. */
        spriteBuffer?: SpriteStorage;
    }

    /** A descriptor plus a sprite buffer that can be rendered. */
    class Instance {
        constructor(options: InstanceOptions);
        /**
         * Builds a row-major grid in native code: cell (column, row) is
         * sprite `row * columns + column` at (column * tileWidth,
         * row * tileHeight). Grid instances cull to what the current camera
         * shows in `render()` (the screen without one). Culling assumes
         * cells stay near their position: a
         * sprite moved more than one cell away may be skipped.
         */
        static fromGrid(options: GridOptions): Instance;
        readonly descriptor: Descriptor;
        /** Sprites in the current buffer, or 0 without a buffer. */
        readonly spriteCount: number;
        /** Sprites queued by the last `render()`, after culling. */
        readonly lastDrawCount: number;
        /** Grid geometry for `fromGrid()` instances, else undefined. */
        readonly grid: { columns: number; rows: number;
            tileWidth: number; tileHeight: number } | undefined;
        /**
         * Queues sprites at (x, y) plus the camera offset, through the current
         * camera (Camera2D), on VU1: zoomed, and under a rotation each sprite
         * becomes a triangle strip (in batches of 36). Sprites are read
         * when the frame is sent, so writes made to the buffer after
         * `render()` and before `Screen.flip()` may or may not be shown this
         * frame.
         */
        render(x: number, y: number, options?: RenderOptions): void;
        /** Moves sprites [first, first + count) in native code. */
        translate(first: number, count: number, dx: number, dy: number): void;
        /** Sets the color (0-255, 128 = neutral) of a sprite range. */
        setColor(first: number, count: number, r: number, g: number,
            b: number, a?: number): void;
        /**
         * Points sprites from `first` at atlas tiles, one per id, and sets
         * their size to the cell (grid) or atlas tile size; `EMPTY` hides a
         * sprite. All ids are validated before anything is written.
         */
        setTiles(first: number, tiles: TileIds): void;
        /**
         * Uses another buffer from now on. Waits for queued draws that read
         * the previous one, so replacing buffers mid-frame stalls briefly.
         */
        replaceSpriteBuffer(buffer: SpriteStorage): void;
        /** Returns the current buffer; edits through a `DataView` are live. */
        getSpriteBuffer(): SpriteStorage | undefined;
        /**
         * Copies `count` sprites (default: all of `source`) into the buffer
         * starting at sprite `dstOffset`. `source` needs no alignment.
         */
        updateSprites(dstOffset: number, source: SpriteStorage,
            count?: number): void;
    }

    /** Fields accepted by `SpriteBuffer.fromObjects()`. */
    interface SpriteObject {
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        /** Texture coordinates in texels. */
        u1?: number;
        v1?: number;
        u2?: number;
        v2?: number;
        /**
         * Depth. The VU program passes the raw bits of this float to the
         * GS, so it orders correctly only for non-negative values and a
         * 24- or 32-bit Z buffer; with the default 16-bit Z buffer, depth
         * testing tiles is unreliable.
         */
        zindex?: number;
        /** Color channels 0-255; default 128 (0x80, neutral modulation). */
        r?: number;
        g?: number;
        b?: number;
        a?: number;
    }

    namespace SpriteBuffer {
        /** Allocates `count` zeroed sprites. */
        function create(count: number): ArrayBuffer;
        /** Builds a buffer from objects; missing fields are 0 (colors 128). */
        function fromObjects(sprites: SpriteObject[]): ArrayBuffer;
    }

    /** Byte layout of one sprite record, for `DataView` access. */
    const layout: {
        readonly stride: number;
        readonly offsets: {
            readonly x: number;
            readonly y: number;
            readonly w: number;
            readonly h: number;
            readonly u1: number;
            readonly v1: number;
            readonly u2: number;
            readonly v2: number;
            /** Colors are 32-bit unsigned integers. */
            readonly r: number;
            readonly g: number;
            readonly b: number;
            readonly a: number;
            readonly zindex: number;
        };
    };

    /**
     * Hardware debugging switches, for bisecting problems that appear only
     * on a real console. They slow rendering; leave them off otherwise.
     */
    interface Diagnostics {
        /** FLUSHA and TEX0/TEX1 before every batch, as the old renderer. */
        flushEachBatch: boolean;
        /** Write back the whole data cache instead of the sprite range. */
        fullCacheFlush: boolean;
        /** Sprites per VU1 batch, 1-50 (default 50; under a rotating camera at most 36). */
        batchSize: number;
        /**
         * Under a rotating camera, triangles made by the EE instead of the
         * rotated VU1 program. The EE path ignores zindex.
         */
        rotatedOnEE: boolean;
    }

    /** Changes the given switches; the others keep their current value. */
    function setDiagnostics(options: Partial<Diagnostics>): void;
    function getDiagnostics(): Diagnostics;

    /**
     * Offsets every instance drawn afterwards; defaults to (0, 0). Kept for
     * existing code: `Camera2D` moves (and zooms and turns) TileMaps along
     * with every other draw. Both combine: this offset applies first.
     */
    function setCamera(x: number, y: number): void;
    function getCamera(): { x: number; y: number };
}
