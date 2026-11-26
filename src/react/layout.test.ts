import { describe, expect, it } from "vitest";
import { gif } from "../test/fixtures.js";
import { gifSize, masonry } from "./layout.js";

/** A GIF whose tiny file has a frame 320 wide and `h` high, the credit strip under it. */
function tall(n: number, h: number) {
  const files = { tiny: { url: "https://i.ohmagif.com/t.avif", type: "image/avif", width: 320, height: h + 24, bytes: 1 } };
  const g = gif(n);
  return { ...g, files: { ...g.files, ...files } };
}

describe("masonry", () => {
  it("puts each GIF into the shortest column", () => {
    // Two columns of 157 px: (320 - 6) / 2.
    const { boxes, height } = masonry([tall(1, 640), tall(2, 320), tall(3, 320), tall(4, 320)], 320, 2, 6, { hideAttribution: true });
    expect(boxes).toEqual([
      { x: 0, y: 0, width: 157, height: 314 },
      { x: 163, y: 0, width: 157, height: 157 },
      { x: 163, y: 163, width: 157, height: 157 },
      { x: 0, y: 320, width: 157, height: 157 },
    ]);
    expect(height).toBe(477);
  });

  it("keeps the places of earlier GIFs when more come", () => {
    const first = [tall(1, 400), tall(2, 200), tall(3, 300)];
    const before = masonry(first, 500, 3, 4).boxes;
    const after = masonry([...first, tall(4, 100), tall(5, 500)], 500, 3, 4).boxes;
    expect(after.slice(0, 3)).toEqual(before);
  });

  it("is empty without GIFs", () => {
    expect(masonry([], 320, 2, 6)).toEqual({ boxes: [], height: 0 });
  });

  it("takes at least one column and no negative gutter", () => {
    expect(masonry([tall(1, 320)], 300, 0, -10, { hideAttribution: true }).boxes).toEqual([{ x: 0, y: 0, width: 300, height: 300 }]);
    expect(masonry([tall(1, 320)], 300, Number.NaN, 0).boxes[0]!.width).toBe(300);
  });

  it("makes room for the card and its credit line", () => {
    // 157 px wide: a frame of 155 inside the border, 155 high for a square,
    // then the 28 px line and the border above and below.
    expect(masonry([tall(1, 320)], 320, 2, 6).boxes[0]).toEqual({ x: 0, y: 0, width: 157, height: 185 });
  });
});

describe("gifSize", () => {
  it("is the frame at the width, inside the card, with the credit line", () => {
    expect(gifSize({ width: 640, height: 400 }, 322)).toEqual({ width: 322, height: 230 });
    expect(gifSize({ width: 640, height: 400 }, 320, { hideAttribution: true })).toEqual({ width: 320, height: 200 });
  });

  it("keeps the fraction, so the frame is cut where the strip starts", () => {
    expect(gifSize({ width: 346, height: 205 }, 270).height).toBeCloseTo((268 * 205) / 346 + 30, 10);
  });

  it("is never negative", () => {
    expect(gifSize({ width: 10, height: 10 }, 1)).toEqual({ width: 1, height: 30 });
  });
});
