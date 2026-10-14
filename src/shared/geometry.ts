/** Wheel geometry in CSS pixels (matches prototype/wheel-demo.html). */
export const WHEEL = { innerR: 86, outerR: 188, extR: 288, iconR: 137, iconSize: 48 } as const;

/**
 * Slice under an offset from the wheel centre. Screen coordinates (y down).
 * Returns -1 inside the dead zone, else 0..7 where 0 = N and indices go clockwise.
 * Slices are 45° wide and centred on the compass directions.
 */
export function pickSlice(dx: number, dy: number, deadZone: number = WHEEL.innerR): number {
  if (Math.hypot(dx, dy) < deadZone) return -1;
  const deg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 22.5 + 360) % 360;
  return Math.floor(deg / 45) % 8;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A square capture region of `sizePx` centred on (cx, cy), clamped to stay inside width×height. */
export function regionRect(cx: number, cy: number, sizePx: number, width: number, height: number): Rect {
  const half = sizePx / 2;
  const w = Math.min(sizePx, width);
  const h = Math.min(sizePx, height);
  const x = Math.max(0, Math.min(cx - half, width - w));
  const y = Math.max(0, Math.min(cy - half, height - h));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
}
