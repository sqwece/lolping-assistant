import { desktopCapturer } from 'electron';
import { regionRect } from '../shared/geometry';
import type { Rect } from './coords';

/**
 * Captures a square region around a point on one display as a PNG `data:` URL, ready for the
 * vision model. `displayPhys` and `center` are physical screen pixels (the helper's space).
 *
 * The exact physical→thumbnail scaling may need a pass once wired to real pings (Phase 5):
 * desktopCapturer's thumbnail size is a request, and the OS can adjust it for DPI.
 */
export async function captureRegion(
  displayId: number,
  displayPhys: Rect,
  center: { x: number; y: number },
  sizePx: number,
): Promise<string | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: displayPhys.width, height: displayPhys.height },
  });
  const source = sources.find((s) => s.display_id === String(displayId));
  const thumbnail = source?.thumbnail;
  if (!thumbnail || thumbnail.isEmpty()) return null;
  const size = thumbnail.getSize();
  // The thumbnail is the whole display; `center` is global physical → display-local.
  const rect = regionRect(center.x - displayPhys.x, center.y - displayPhys.y, sizePx, size.width, size.height);
  const cropped = thumbnail.crop(rect);
  return `data:image/png;base64,${cropped.toPNG().toString('base64')}`;
}
