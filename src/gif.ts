// The GIF object of the ohmagif API, and the checks every answer passes
// before any of it reaches a page.

/** The site the API and its pages are on. */
export const DEFAULT_BASE_URL = "https://ohmagif.com";

/** How suitable a GIF is: g, pg or pg13. ohmagif hosts nothing above pg13. */
export type Rating = "g" | "pg" | "pg13";

export const RATINGS: readonly Rating[] = ["g", "pg", "pg13"];

/** One file of a GIF. Every file carries its creator's credit. */
export interface GifFile {
  url: string;
  type: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Creator {
  handle: string;
  name: string;
  url: string;
}

/** A GIF as the ohmagif API describes it. */
export interface Gif {
  /** 10 characters from [0-9A-Za-z]. */
  id: string;
  /** A short caption. */
  title: string;
  /** What happens in the GIF, for alt text. */
  description: string;
  /** The GIF's page on ohmagif.com. */
  url: string;
  embed_url: string;
  embed_width: number;
  embed_height: number;
  /** RFC 3339, UTC. */
  created: string;
  /** Size of `files.full`, credit strip included. */
  width: number;
  height: number;
  /** Seconds. */
  duration: number;
  rating: Rating;
  tags: string[];
  reaction: string | null;
  creator: Creator;
  files: {
    /** Animated AVIF at the GIF's own size. */
    full: GifFile;
    /** Animated AVIF, 320 px wide. */
    tiny: GifFile;
    /** The first frame as JPEG, for clients without AVIF. */
    poster: GifFile;
  };
}

const GIF_ID = /^[0-9A-Za-z]{10}$/;

/** Whether a value is an ohmagif GIF id. */
export function isGifId(value: unknown): value is string {
  return typeof value === "string" && GIF_ID.test(value);
}

type Obj = Record<string, unknown>;

export function asObject(value: unknown): Obj | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Obj) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** A non-negative finite number. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** A positive integer, as every pixel size is. */
function size(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}

/**
 * An absolute http or https address, or null. Anything else (javascript:,
 * data:, a relative path) never reaches an href or a src.
 */
export function httpURL(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
}

function file(value: unknown): GifFile | null {
  const o = asObject(value);
  if (!o) return null;
  const url = httpURL(o.url);
  const type = str(o.type);
  const width = size(o.width);
  const height = size(o.height);
  if (!url || type === null || !width || !height) return null;
  return { url, type, width, height, bytes: num(o.bytes) ?? 0 };
}

function creator(value: unknown): Creator | null {
  const o = asObject(value);
  if (!o) return null;
  const handle = str(o.handle);
  const url = httpURL(o.url);
  if (!handle || !url) return null;
  return { handle, name: str(o.name) ?? handle, url };
}

function isRating(value: unknown): value is Rating {
  return RATINGS.includes(value as Rating);
}

/**
 * Checks one GIF of an answer and copies the fields this package knows,
 * nothing else. Answers null for anything that is not a complete GIF, so a
 * bad entry drops out of a list rather than breaking the page.
 */
export function parseGif(value: unknown): Gif | null {
  const o = asObject(value);
  if (!o || !isGifId(o.id)) return null;
  const url = httpURL(o.url);
  const embedURL = httpURL(o.embed_url);
  const width = size(o.width);
  const height = size(o.height);
  const by = creator(o.creator);
  const files = asObject(o.files);
  const full = file(files?.full);
  const tiny = file(files?.tiny);
  const poster = file(files?.poster);
  if (!url || !embedURL || !width || !height || !by || !full || !tiny || !poster || !isRating(o.rating)) {
    return null;
  }
  return {
    id: o.id,
    title: str(o.title) ?? "",
    description: str(o.description) ?? "",
    url,
    embed_url: embedURL,
    embed_width: size(o.embed_width) ?? width,
    embed_height: size(o.embed_height) ?? height,
    created: str(o.created) ?? "",
    width,
    height,
    duration: num(o.duration) ?? 0,
    rating: o.rating,
    tags: Array.isArray(o.tags) ? o.tags.filter((t): t is string => typeof t === "string") : [],
    reaction: str(o.reaction),
    creator: by,
    files: { full, tiny, poster },
  };
}

/** The text that names a GIF to someone who cannot see it. */
export function gifLabel(gif: Gif): string {
  return gif.description || gif.title || "GIF";
}

/**
 * Height in pixels of the credit strip under the frame of every file, full,
 * tiny and poster alike. A saved or shared file keeps it; a page showing
 * the GIF cuts it off and lays the credit over the frame instead, as
 * ohmagif.com does.
 */
export const CREDIT_STRIP_HEIGHT = 24;

/** A file's height without its credit strip. */
export function frameHeight(file: GifFile): number {
  return file.height > CREDIT_STRIP_HEIGHT ? file.height - CREDIT_STRIP_HEIGHT : file.height;
}

/**
 * The size of the GIF's frame at full size, without the credit strip: the
 * shape the components show it in. Keep this with a message to reserve
 * the GIF's room before it loads.
 *
 * tiny.avif and full.avif round their frames apart by a fraction of a
 * pixel, and a browser shows either. This is the shorter of the two shapes
 * in whole pixels, so whichever it shows, the strip stays out of sight.
 */
export function frameSize(gif: Gif): { width: number; height: number } {
  const { full, tiny } = gif.files;
  const fromTiny = Math.floor((full.width * frameHeight(tiny)) / tiny.width);
  return { width: full.width, height: Math.max(1, Math.min(frameHeight(full), fromTiny)) };
}

/** The frame of tiny.avif, the shape of a GIF in a grid. */
export function tinyFrameSize(gif: Gif): { width: number; height: number } {
  return { width: gif.files.tiny.width, height: frameHeight(gif.files.tiny) };
}
