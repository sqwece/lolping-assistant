import { desktopCapturer, type NativeImage } from 'electron';
import { clampRect } from '../shared/geometry';
import type { Rect } from './coords';

/** The whole display's thumbnail, for cropping a region later. `displayPhys` is the display's rect in physical pixels. */
export async function captureDisplayThumbnail(displayId: number, displayPhys: Rect): Promise<NativeImage | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: displayPhys.width, height: displayPhys.height },
  });
  const source = sources.find((s) => s.display_id === String(displayId));
  const thumbnail = source?.thumbnail;
  return thumbnail && !thumbnail.isEmpty() ? thumbnail : null;
}

/** Crops a DIP region out of a whole-display thumbnail and returns it as a PNG `data:` URL. */
export function cropToDataUrl(thumbnail: NativeImage, displayDip: Rect, scale: number, dipRect: Rect): string | null {
  const size = thumbnail.getSize();
  // The thumbnail is the whole display in physical pixels; the DIP region is scaled onto it before cropping.
  const local = clampRect(
    (dipRect.x - displayDip.x) * scale,
    (dipRect.y - displayDip.y) * scale,
    dipRect.width * scale,
    dipRect.height * scale,
    { x: 0, y: 0, width: size.width, height: size.height },
  );
  const cropped = thumbnail.crop(local);
  return `data:image/png;base64,${cropped.toPNG().toString('base64')}`;
}

/** Captures and crops a DIP region of one display in one step (the fallback when no pre-captured frame is available). */
export async function captureRect(
  displayId: number,
  displayPhys: Rect,
  displayDip: Rect,
  scale: number,
  dipRect: Rect,
): Promise<string | null> {
  const thumbnail = await captureDisplayThumbnail(displayId, displayPhys);
  return thumbnail ? cropToDataUrl(thumbnail, displayDip, scale, dipRect) : null;
}
