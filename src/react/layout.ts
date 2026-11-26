import { tinyFrameSize, type Gif } from "../gif.js";

/** The card's border, all round, in CSS pixels. */
export const CARD_BORDER = 1;
/** The credit line under the frame, in CSS pixels. */
export const CREDIT_LINE_HEIGHT = 28;
/** The shorter credit line under a grid's tiles, in CSS pixels. */
export const TILE_CREDIT_LINE_HEIGHT = 18;

export interface Size {
  width: number;
  height: number;
}

export interface SizeOptions {
  /**
   * The whole file, its credit strip showing, without the card and its
   * credit line. gifSize then takes the file's size, not the frame's.
   */
  hideAttribution?: boolean;
}

/**
 * The room a GIF takes when shown `width` pixels wide: its frame (the file
 * without its credit strip) in a card with the credit line under it, as
 * Grid and Gif draw it. Reserve this while the GIF is fetched and nothing
 * moves when it arrives. `frame` is frameSize(gif), or the size kept with
 * a message.
 */
export function gifSize(frame: Size, width: number, options: SizeOptions = {}): Size {
  return cardSize(frame, width, CREDIT_LINE_HEIGHT, options);
}

function cardSize(frame: Size, width: number, creditLine: number, options: SizeOptions): Size {
  const card = options.hideAttribution ? 0 : 2 * CARD_BORDER;
  const line = options.hideAttribution ? 0 : creditLine;
  const inner = Math.max(0, width - card);
  // Not rounded: a frame a fraction of a pixel too high shows the top of
  // the credit strip.
  return { width, height: (inner * frame.height) / frame.width + card + line };
}

export interface Box extends Size {
  x: number;
  y: number;
}

/**
 * Places GIFs in columns, each into the shortest column so far, in the
 * order given. A GIF already placed keeps its place when more are added,
 * so a new page never moves what is on screen.
 */
export function masonry(gifs: readonly Gif[], width: number, columns: number, gutter: number, options: SizeOptions = {}) {
  const cols = Math.max(1, Math.floor(columns) || 1);
  const gap = Math.max(0, gutter);
  const colWidth = Math.max(0, (width - gap * (cols - 1)) / cols);
  const heights: number[] = new Array<number>(cols).fill(0);
  const boxes: Box[] = gifs.map((gif) => {
    let c = 0;
    for (let i = 1; i < cols; i++) if (heights[i]! < heights[c]!) c = i;
    // Grids show tiny.avif, so its frame, or the whole file without the
    // card, is the tile's shape.
    const shape = options.hideAttribution ? gif.files.tiny : tinyFrameSize(gif);
    const { height } = cardSize(shape, colWidth, TILE_CREDIT_LINE_HEIGHT, options);
    const box = { x: c * (colWidth + gap), y: heights[c]!, width: colWidth, height };
    heights[c] = box.y + box.height + gap;
    return box;
  });
  return { boxes, height: boxes.length ? Math.max(...heights) - gap : 0 };
}
