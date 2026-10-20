// Pure scroll arithmetic, shared by the keyboard handling (vertical) and the
// day picker (horizontal). All values are along one axis and in one
// coordinate space; the callers measure, this only decides.

export interface RevealRequest {
  /** Where the item starts and ends. */
  itemStart: number;
  itemEnd: number;
  /** The part of the scroll view the user can actually see. */
  visibleStart: number;
  visibleEnd: number;
  /** Space to keep between the item and the visible edges, when it fits. */
  margin?: number;
}

/**
 * How far to scroll (positive = towards the end) so the whole item is
 * visible with `margin` around it, or 0 when it already is. Scrolls as little
 * as possible. When the item and its margins do not fit, the item's start is
 * shown, because that is where an input's text and a label begin.
 */
export function scrollDeltaToReveal({ itemStart, itemEnd, visibleStart, visibleEnd, margin = 0 }: RevealRequest): number {
  const first = visibleStart + margin;
  const last = visibleEnd - margin;

  if (itemEnd - itemStart > last - first) return itemStart - first;
  if (itemStart < first) return itemStart - first;
  if (itemEnd > last) return itemEnd - last;
  return 0;
}

/** Keeps a scroll offset between 0 and the furthest the content can scroll. */
export function clampScrollOffset(offset: number, contentSize: number, viewportSize: number): number {
  return Math.min(Math.max(offset, 0), Math.max(contentSize - viewportSize, 0));
}
