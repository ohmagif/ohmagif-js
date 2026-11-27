import type { CSSProperties } from "react";
import type { Gif } from "../gif.js";

const pictureStyle: CSSProperties = { display: "contents" };
// As wide as the frame and as high as the file: the frame's box is cut to
// the frame, so the credit strip at the bottom of the file falls outside
// it. Whichever file the browser picks, its own shape decides where the
// strip starts. The strip is as high in tiny as in full, so the two files
// are not the same shape: a frame that shows the whole file takes one.
const imgStyle: CSSProperties = { display: "block", width: "100%", height: "auto" };

export interface PictureProps {
  files: Gif["files"];
  /** The width the frame is shown at, in CSS pixels. */
  width: number;
  /**
   * This file whatever the width and density: tiny as a grid shows it, full
   * where the whole file shows. Without it the browser picks by density.
   */
  only?: "tiny" | "full";
  alt: string;
  lazy?: boolean;
  onLoad?: () => void;
  onError?: () => void;
}

/**
 * The animated AVIF, with the poster for a browser that cannot show AVIF.
 * The browser picks tiny or full by the screen's density unless told only
 * one. The width and height attributes are the size the file is shown at,
 * so the page knows it before a byte arrives.
 */
export function Picture({ files, width, only, alt, lazy = false, onLoad, onError }: PictureProps) {
  const { full, tiny, poster } = files;
  const both = !only && full.width > tiny.width;
  const file = only === "tiny" ? tiny : full;
  const srcSet = both ? `${tiny.url} ${tiny.width}w, ${full.url} ${full.width}w` : file.url;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round((width * file.height) / file.width));
  return (
    <picture style={pictureStyle}>
      <source type="image/avif" srcSet={srcSet} sizes={both ? `${Math.ceil(width)}px` : undefined} />
      <img
        src={poster.url}
        alt={alt}
        width={w}
        height={h}
        decoding="async"
        loading={lazy ? "lazy" : undefined}
        referrerPolicy="no-referrer"
        style={imgStyle}
        onLoad={onLoad}
        onError={onError}
      />
    </picture>
  );
}
