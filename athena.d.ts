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
        private constructor();
        static readonly NEAREST: 0; static readonly LINEAR: 1;
        /** Addressing per axis: CLAMP (to edge, the default), REPEAT on both
         * axes, or REPEAT_U / REPEAT_V on one. */
        static readonly CLAMP: 0; static readonly REPEAT_U: 1; static readonly REPEAT_V: 2; static readonly REPEAT: 3;
        /** Copies 0xAABBGGRR pixels; alpha (0..255) matters only to alphaCutoff materials. Power-of-two sizes 1..512;
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
         * and stored as RGBA8. Defaults to white; alpha is used by alphaCutoff. */
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
