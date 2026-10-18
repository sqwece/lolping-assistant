/** Frame-by-frame character animation. The placeholder draws a simple face onto a sheet at runtime; to use real art,
 *  swap the sheet for a PNG sprite sheet (frames laid out in a grid) without touching the player. */

export interface SpriteAnimation {
  first: number;
  count: number;
}

export interface SpriteSheet {
  /** The sheet: a PNG image (real art) or a canvas (placeholder). */
  image: CanvasImageSource;
  frameW: number;
  frameH: number;
  columns: number;
  animations: Record<'idle' | 'run' | 'jump', SpriteAnimation>;
}

export type CharacterAnimation = keyof SpriteSheet['animations'];

/** Builds a placeholder sheet: 4 idle frames (blink + bob) then 4 run frames (lean), in one row. */
export function placeholderSheet(color: string, shadow: string): SpriteSheet {
  const frameW = 90;
  const frameH = 90;
  const count = 8;
  const sheet = document.createElement('canvas');
  sheet.width = frameW * count;
  sheet.height = frameH;
  const ctx = sheet.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  for (let i = 0; i < count; i++) drawFrame(ctx, i * frameW, 0, frameW, frameH, color, shadow, i);
  return {
    image: sheet,
    frameW,
    frameH,
    columns: count,
    animations: {
      idle: { first: 0, count: 4 },
      run: { first: 4, count: 4 },
      jump: { first: 4, count: 4 },
    },
  };
}

/** One placeholder frame: a round face with eyes and a mouth; idle bobs and blinks, run leans. */
function drawFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  color: string,
  shadow: string,
  frame: number,
): void {
  const cx = ox + w / 2;
  const cy = oy + h / 2;
  const r = 38;
  const bob = frame === 2 || frame === 3 ? 3 : 0;
  const blink = frame === 1 || frame === 3;
  const lean = frame >= 4 ? (frame % 2 === 0 ? -4 : 4) : 0;
  const y = cy + bob;
  const x = cx + lean;

  const grad = ctx.createLinearGradient(cx - r, y - r, cx + r, y + r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, shadow);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  if (blink) {
    ctx.fillRect(x - 18, y - 8, 12, 3);
    ctx.fillRect(x + 6, y - 8, 12, 3);
  } else {
    ctx.beginPath();
    ctx.ellipse(x - 12, y - 6, 5, 7, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 12, y - 6, 5, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y + 6, 9, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

/** Steps a SpriteSheet's animation onto a canvas with requestAnimationFrame. */
export class SpritePlayer {
  private anim: CharacterAnimation = 'idle';
  private fps: number;
  private raf = 0;
  private frame = 0;
  private acc = 0;

  constructor(private canvas: HTMLCanvasElement, private sheet: SpriteSheet, fps = 6) {
    this.fps = fps;
    this.canvas.width = sheet.frameW;
    this.canvas.height = sheet.frameH;
    this.draw();
  }

  play(anim: CharacterAnimation): void {
    if (this.anim === anim) return;
    this.anim = anim;
    this.frame = 0;
    this.acc = 0;
    this.draw();
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    let prev = performance.now();
    const tick = (now: number): void => {
      this.acc += now - prev;
      prev = now;
      const a = this.sheet.animations[this.anim];
      const interval = 1000 / this.fps;
      while (this.acc >= interval) {
        this.acc -= interval;
        this.frame = (this.frame + 1) % a.count;
      }
      this.draw();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }

  setSheet(sheet: SpriteSheet): void {
    this.sheet = sheet;
    this.canvas.width = sheet.frameW;
    this.canvas.height = sheet.frameH;
    this.frame = 0;
    this.acc = 0;
    this.draw();
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    const { image, frameW, frameH, columns } = this.sheet;
    const a = this.sheet.animations[this.anim];
    const index = a.first + this.frame;
    const sx = (index % columns) * frameW;
    const sy = Math.floor(index / columns) * frameH;
    ctx.clearRect(0, 0, frameW, frameH);
    ctx.drawImage(image, sx, sy, frameW, frameH, 0, 0, frameW, frameH);
  }
}
