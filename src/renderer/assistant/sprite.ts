/** Frame-by-frame character animation. The placeholder draws a simple face onto a sheet at runtime; to use real art,
 *  swap the sheet for a PNG sprite sheet (frames laid out in a grid) without touching the player. */

export interface SpriteAnimation {
  first: number;
  count: number;
}

/** All animation states the chibi Gwen sprite can play. `drag` reuses the `doll` frames. */
export type CharacterAnimation =
  | 'idle'
  | 'idle_in'
  | 'walk'
  | 'run'
  | 'haste'
  | 'jump'
  | 'greet'
  | 'dive_in'
  | 'dive_out'
  | 'cast_start'
  | 'think'
  | 'interact'
  | 'laugh'
  | 'laugh2'
  | 'dance_in'
  | 'dance'
  | 'doll'
  | 'taunt'
  | 'hurt'
  | 'celebrate'
  | 'recall'
  | 'recall_out'
  | 'death'
  | 'drag';

export interface SpriteSheet {
  /** The sheet: a PNG image (real art) or a canvas (placeholder). */
  image: CanvasImageSource;
  frameW: number;
  frameH: number;
  columns: number;
  animations: Record<CharacterAnimation, SpriteAnimation>;
}

/** Builds a sheet from a preloaded image laid out as a uniform grid of frames. */
export function imageSheet(
  image: CanvasImageSource,
  frameW: number,
  frameH: number,
  columns: number,
  animations: SpriteSheet['animations'],
): SpriteSheet {
  return { image, frameW, frameH, columns, animations };
}

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
      idle_in: { first: 0, count: 4 },
      walk: { first: 4, count: 4 },
      run: { first: 4, count: 4 },
      haste: { first: 4, count: 4 },
      jump: { first: 4, count: 4 },
      greet: { first: 4, count: 4 },
      dive_in: { first: 0, count: 4 },
      dive_out: { first: 4, count: 4 },
      cast_start: { first: 4, count: 4 },
      think: { first: 4, count: 4 },
      interact: { first: 4, count: 4 },
      laugh: { first: 4, count: 4 },
      laugh2: { first: 4, count: 4 },
      dance_in: { first: 4, count: 4 },
      dance: { first: 4, count: 4 },
      doll: { first: 0, count: 4 },
      taunt: { first: 4, count: 4 },
      hurt: { first: 4, count: 4 },
      celebrate: { first: 4, count: 4 },
      recall: { first: 4, count: 4 },
      recall_out: { first: 4, count: 4 },
      death: { first: 4, count: 4 },
      drag: { first: 0, count: 4 },
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
  /** One-shot animations queued to play in order before settling on `loopAnim`. */
  private queue: CharacterAnimation[] = [];
  /** What to loop once the queue drains (or when `play` is called). */
  private loopAnim: CharacterAnimation = 'idle';
  /** Whether the current animation is a one-shot (queue) that must advance when it ends. */
  private once = false;

  constructor(private canvas: HTMLCanvasElement, private sheet: SpriteSheet, fps = 12) {
    this.fps = fps;
    this.canvas.width = sheet.frameW;
    this.canvas.height = sheet.frameH;
    this.draw();
  }

  /** Loop a single animation forever. */
  play(anim: CharacterAnimation): void {
    if (this.anim === anim && this.queue.length === 0 && !this.once) return;
    this.anim = anim;
    this.loopAnim = anim;
    this.queue = [];
    this.once = false;
    this.frame = 0;
    this.acc = 0;
    this.draw();
  }

  /** Play a one-shot animation once, then fall back to `fallback` (default `idle`). */
  playOnce(anim: CharacterAnimation, fallback: CharacterAnimation = 'idle'): void {
    this.playSequence([anim], fallback);
  }

  /** Play each one-shot in `sequence` in order, then loop `loop` (default `idle`). */
  playSequence(sequence: CharacterAnimation[], loop: CharacterAnimation = 'idle'): void {
    this.queue = [...sequence];
    this.loopAnim = loop;
    this.advanceQueue();
  }

  start(): void {
    cancelAnimationFrame(this.raf);
    let prev = performance.now();
    const tick = (now: number): void => {
      this.acc += now - prev;
      prev = now;
      const interval = 1000 / this.fps;
      while (this.acc >= interval) {
        this.acc -= interval;
        const a = this.sheet.animations[this.anim];
        this.frame += 1;
        if (this.frame >= a.count) {
          this.frame = 0;
          if (this.once) this.advanceQueue();
        }
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
    this.queue = [];
    this.once = false;
    this.draw();
  }

  /** Move to the next queued one-shot, or settle on the loop animation. */
  private advanceQueue(): void {
    if (this.queue.length > 0) {
      this.anim = this.queue.shift() as CharacterAnimation;
      this.once = true;
      this.frame = 0;
      this.acc = 0;
    } else {
      this.anim = this.loopAnim;
      this.once = false;
      this.frame = 0;
      this.acc = 0;
    }
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
