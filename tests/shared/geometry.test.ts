import { describe, expect, it } from 'vitest';
import { WHEEL, pickSlice, regionRect } from '../../src/shared/geometry';

const at = (deg: number, r = 150) => {
  // deg measured clockwise from straight up (N), screen y points down
  const rad = ((deg - 90) * Math.PI) / 180;
  return pickSlice(r * Math.cos(rad), r * Math.sin(rad));
};

describe('pickSlice', () => {
  it('maps the 8 compass directions to slices 0..7 clockwise from N', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map((d) => at(d))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('returns -1 inside the dead zone and a slice at its edge', () => {
    expect(pickSlice(0, -(WHEEL.innerR - 1))).toBe(-1);
    expect(pickSlice(0, 0)).toBe(-1);
    expect(pickSlice(0, -WHEEL.innerR)).toBe(0);
  });

  it('splits slices exactly at ±22.5° and wraps around N', () => {
    expect(at(22.4)).toBe(0);
    expect(at(22.6)).toBe(1);
    expect(at(-1)).toBe(0);
    expect(at(-22.6)).toBe(7);
    expect(at(359.9)).toBe(0);
  });

  it('honours a custom dead zone', () => {
    expect(pickSlice(0, -50, 40)).toBe(0);
    expect(pickSlice(0, -30, 40)).toBe(-1);
  });
});

describe('regionRect', () => {
  it('centres a square on the point', () => {
    expect(regionRect(100, 100, 40, 1000, 1000)).toEqual({ x: 80, y: 80, width: 40, height: 40 });
  });

  it('clamps to the top-left edge', () => {
    expect(regionRect(10, 10, 40, 1000, 1000)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
  });

  it('clamps to the bottom-right edge', () => {
    expect(regionRect(995, 995, 40, 1000, 1000)).toEqual({ x: 960, y: 960, width: 40, height: 40 });
  });

  it('shrinks to the whole bounds when the region is larger than them', () => {
    expect(regionRect(50, 50, 200, 100, 80)).toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });
});
