"use client";

import { fileURL, gifURL, TINY_WIDTH, type Gif } from "../gif.js";
import { Card } from "./Card.js";
import type { Size } from "./layout.js";

export interface GifFromIdProps {
  id: string;
  /**
   * The size of its full file, credit strip included: gif.width and
   * gif.height, kept with the id. gifSize(size, width, { hideAttribution:
   * true }) is the room it takes.
   */
  size: Size;
  /** Width in CSS pixels. It never grows past its container. */
  width: number;
  /** What the GIF shows, for those who cannot see it: gifLabel(gif), kept with the id. */
  alt?: string;
  /** The GIF does not link to its page. */
  noLink?: boolean;
  /** Load the file only once the GIF is near the screen. On by default. */
  lazyLoad?: boolean;
  /** The site of the GIF's page, DEFAULT_BASE_URL by default. */
  baseURL?: string;
  /** Where its files are, DEFAULT_MEDIA_URL by default. */
  mediaURL?: string;
  className?: string;
  onLoad?: () => void;
  /** The file did not load: the GIF was taken down, or the network failed. */
  onError?: () => void;
}

/**
 * A GIF from what a message keeps, its id and size, without a request: the
 * whole file, the credit strip along its bottom included, linking to the
 * GIF's page. Nothing for an id that is not one.
 */
export function GifFromId({ id, size, width, alt = "", noLink = false, lazyLoad = true, baseURL, mediaURL, className, onLoad, onError }: GifFromIdProps) {
  const page = gifURL(id, baseURL);
  if (!page || !Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width < 1 || size.height < 1) return null;
  const file = (name: keyof Gif["files"], type: string, w: number, h: number) => ({ url: fileURL(id, name, mediaURL)!, type, width: w, height: h, bytes: 0 });
  const tinyHeight = Math.max(1, Math.round((TINY_WIDTH * size.height) / size.width));
  // Only what the card reads when it shows the file alone.
  const gif: Gif = {
    id,
    title: "",
    description: alt,
    url: page,
    embed_url: "",
    embed_width: 0,
    embed_height: 0,
    created: "",
    width: size.width,
    height: size.height,
    duration: 0,
    rating: "g",
    tags: [],
    reaction: null,
    creator: { handle: "", name: "", url: "" },
    files: {
      full: file("full", "image/avif", size.width, size.height),
      tiny: file("tiny", "image/avif", TINY_WIDTH, tinyHeight),
      poster: file("poster", "image/jpeg", size.width, size.height),
    },
  };
  return (
    <Card
      gif={gif}
      width={width}
      link={!noLink}
      hideAttribution
      lazy={lazyLoad}
      onLoad={onLoad}
      onError={onError}
      className={className ? `ohmagif-gif ${className}` : "ohmagif-gif"}
      style={{ width, maxWidth: "100%" }}
    />
  );
}
