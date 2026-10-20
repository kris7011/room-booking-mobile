import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { clampScrollOffset, scrollDeltaToReveal } from '../../src/utils/scroll-into-view';

describe('scrollDeltaToReveal', () => {
  test('does not scroll when the item is visible with its margin', () => {
    assert.equal(scrollDeltaToReveal({ itemStart: 100, itemEnd: 150, visibleStart: 0, visibleEnd: 500, margin: 16 }), 0);
    // Exactly on the margin is still visible.
    assert.equal(scrollDeltaToReveal({ itemStart: 16, itemEnd: 484, visibleStart: 0, visibleEnd: 500, margin: 16 }), 0);
  });

  test('scrolls forward just enough to show an item past the end', () => {
    // Focused input 600–648 in window coordinates, keyboard top at 500:
    // scroll 648 + 16 - 500 = 164 so it ends 16 above the keyboard.
    assert.equal(scrollDeltaToReveal({ itemStart: 600, itemEnd: 648, visibleStart: 80, visibleEnd: 500, margin: 16 }), 164);
  });

  test('scrolls forward when the item is partly hidden at the end', () => {
    assert.equal(scrollDeltaToReveal({ itemStart: 470, itemEnd: 518, visibleStart: 0, visibleEnd: 500, margin: 16 }), 34);
  });

  test('scrolls back to show an item before the start', () => {
    assert.equal(scrollDeltaToReveal({ itemStart: -40, itemEnd: 8, visibleStart: 0, visibleEnd: 500, margin: 16 }), -56);
    // A day chip half hidden at the left edge of the strip.
    assert.equal(scrollDeltaToReveal({ itemStart: 300, itemEnd: 370, visibleStart: 320, visibleEnd: 710, margin: 12 }), -32);
  });

  test('on a small screen shows the start of an item that does not fit with its margins', () => {
    // Only 60 px between the header and the keyboard, input is 48 px high
    // plus 2 × 16 margin = 80: align the input's top 16 below the visible top.
    assert.equal(scrollDeltaToReveal({ itemStart: 400, itemEnd: 448, visibleStart: 100, visibleEnd: 160, margin: 16 }), 284);
  });

  test('works without a margin', () => {
    assert.equal(scrollDeltaToReveal({ itemStart: 490, itemEnd: 510, visibleStart: 0, visibleEnd: 500 }), 10);
  });
});

describe('clampScrollOffset', () => {
  test('keeps the offset inside the scrollable range', () => {
    assert.equal(clampScrollOffset(-20, 1000, 400), 0);
    assert.equal(clampScrollOffset(250, 1000, 400), 250);
    assert.equal(clampScrollOffset(900, 1000, 400), 600);
  });

  test('is 0 when the content fits the viewport', () => {
    assert.equal(clampScrollOffset(50, 300, 400), 0);
  });
});
