// Static labels share one VU1 sprite batch. Changing values use cached C layouts.
export class NativeHUD {
    constructor(staticLines, dynamicLineCount) {
        this.font = new Font({size: 14});
        this.font.preload('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ :.-/', {budgetMs: 0});
        this.lines = new Array(dynamicLineCount);
        const glyphs = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ :.-/';
        const sprites = [];
        for (const line of staticLines) {
            for (let i = 0; i < line.text.length; i++) {
                const glyph = glyphs.indexOf(line.text[i]);
                if (glyph < 0) continue;
                const u1 = (glyph % 16) * 8, v1 = Math.floor(glyph / 16) * 16;
                sprites.push({x: line.x + i * 8, y: line.y, w: 8, h: 16,
                    u1, v1, u2: u1 + 8, v2: v1 + 16});
            }
        }
        const image = new Image('hud.png');
        if (!image.ready() || !image.lock()) throw new Error('HUD atlas could not be loaded into VRAM');
        const descriptor = new TileMap.Descriptor({textures: [image],
            materials: [{textureIndex: 0, endOffset: sprites.length - 1}]});
        this.staticLabels = new TileMap.Instance({descriptor,
            spriteBuffer: TileMap.SpriteBuffer.fromObjects(sprites)});
    }
    setLine(index, x, y, value) {
        const line = this.lines[index];
        if (line && line.value === value && line.x === x && line.y === y) return;
        this.lines[index] = {x, y, value, rendered: this.font.render(value)};
    }
    draw() {
        this.staticLabels.render(0, 0);
        for (const line of this.lines) if (line) line.rendered.print(line.x, line.y);
    }
}
