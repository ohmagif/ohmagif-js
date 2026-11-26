import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { frameSize, gifLabel, tinyFrameSize, type Gif } from "../gif.js";
import { CARD_BORDER, CREDIT_LINE_HEIGHT, TILE_CREDIT_LINE_HEIGHT } from "./layout.js";
import { Picture } from "./Picture.js";

// The card is the one ohmagif's embed draws (templates/embed.html): the
// frame on white with a 1 px border and 6 px corners, and a 28 px credit
// line under it, "GIF by @handle on ohmagif.com". Here the whole line links
// to the GIF's page. Each colour is a custom property a page can set; by
// default it follows the page's color-scheme, as the embed follows the
// system's.

const card = "var(--ohmagif-card, light-dark(#FFFFFF, #1D1B18))";
const border = "var(--ohmagif-border, light-dark(#E9E5DE, #2F2C27))";
const muted = "var(--ohmagif-muted, light-dark(#6F6A62, #A7A196))";
const link = "var(--ohmagif-link, light-dark(#2F6B12, #B8E07A))";
const placeholder = "var(--ohmagif-placeholder, rgba(128, 128, 128, 0.16))";
const radius = "var(--ohmagif-radius, 6px)";

/** Narrower than this, the credit line starts at the handle. */
export const FULL_CREDIT_WIDTH = 280;

const reset: CSSProperties = { boxSizing: "border-box", margin: 0, padding: 0, border: 0, font: "inherit", textAlign: "left" };

const cardStyle: CSSProperties = {
  ...reset,
  display: "block",
  overflow: "hidden",
  background: card,
  borderWidth: CARD_BORDER,
  borderStyle: "solid",
  borderColor: border,
  borderRadius: radius,
  color: "inherit",
  textDecoration: "none",
};

const frameBase: CSSProperties = {
  ...reset,
  display: "block",
  width: "100%",
  // The frame's shape alone decides its height, whatever a page's own
  // rules say about buttons.
  height: "auto",
  // The frame's box: the credit strip under it in the file is cut off.
  overflow: "hidden",
  background: placeholder,
  // A focus ring drawn inside is never cut off by a scrolling parent or
  // covered by the next GIF.
  outlineOffset: -2,
};

const creditStyle: CSSProperties = {
  ...reset,
  display: "block",
  height: CREDIT_LINE_HEIGHT,
  padding: "6px 10px",
  fontSize: 14,
  lineHeight: "16px",
  color: muted,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  textDecoration: "none",
  cursor: "pointer",
  outlineOffset: -2,
};

/** A grid tile's credit line: "by @handle", small. */
const shortCreditStyle: CSSProperties = {
  ...creditStyle,
  height: TILE_CREDIT_LINE_HEIGHT,
  padding: "3px 6px",
  fontSize: 10,
  lineHeight: "12px",
};

const handleStyle: CSSProperties = { color: link, fontWeight: 600 };

/** A control at the end of a grid: Retry, or Upload to ohmagif. */
export const buttonStyle: CSSProperties = {
  ...reset,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: border,
  borderRadius: 4,
  background: card,
  color: link,
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1,
  textDecoration: "none",
  whiteSpace: "nowrap",
  cursor: "pointer",
};

const external = { target: "_blank", rel: "noopener noreferrer", referrerPolicy: "no-referrer" } as const;

export interface CardProps {
  gif: Gif;
  /** The width the card is shown at, in CSS pixels. */
  width: number;
  /** Whether the picture is there: a grid leaves it out far from the screen. */
  picture?: boolean;
  /** tiny.avif whatever the width, as a grid shows it. */
  tinyOnly?: boolean;
  /** The card links to the GIF's page. */
  link: boolean;
  /** Called on a click on the frame. Without link, it makes the frame a button. */
  onClick?: (e: MouseEvent<HTMLElement>) => void;
  /** Leave out the card and its credit line: the frame alone. */
  hideAttribution?: boolean;
  /** The grid's shorter credit line, "by @handle". */
  shortCredit?: boolean;
  lazy?: boolean;
  onLoad?: () => void;
  onError?: () => void;
  className: string;
  /** Size and place, from the caller. */
  style: CSSProperties;
  id?: string;
}

/** A GIF cut to its frame, in the embed's card with the credit line under it. */
export function Card({
  gif,
  width,
  picture = true,
  tinyOnly = false,
  link,
  onClick,
  hideAttribution = false,
  shortCredit = false,
  lazy,
  onLoad,
  onError,
  className,
  style,
  id,
}: CardProps) {
  const frame = tinyOnly ? tinyFrameSize(gif) : frameSize(gif);
  const frameWidth = hideAttribution ? width : width - 2 * CARD_BORDER;
  const label = gifLabel(gif);
  const pic = picture ? (
    <Picture gif={gif} width={frameWidth} tinyOnly={tinyOnly} alt="" lazy={lazy} onLoad={onLoad} onError={onError} />
  ) : null;
  const shape: CSSProperties = { ...frameBase, aspectRatio: `${frame.width} / ${frame.height}` };
  const pointer = link || onClick ? { cursor: "pointer" } : null;
  const data = id ? { "data-ohmagif-id": id } : {};

  // The frame alone: one element, named for those who cannot see it.
  if (hideAttribution) {
    const s = { ...shape, ...pointer, borderRadius: radius, ...style };
    const cls = `${className} ohmagif-frame`;
    if (link) {
      return (
        <a {...data} {...external} className={cls} href={gif.url} aria-label={label} style={s} onClick={onClick}>
          {pic}
        </a>
      );
    }
    if (onClick) {
      return (
        <button {...data} type="button" className={cls} aria-label={label} style={s} onClick={onClick}>
          {pic}
        </button>
      );
    }
    return (
      <span {...data} role="img" className={cls} aria-label={label} style={s}>
        {pic}
      </span>
    );
  }

  const handle = <span style={handleStyle}>@{gif.creator.handle}</span>;
  const words: ReactNode = shortCredit ? (
    <>by {handle}</>
  ) : width >= FULL_CREDIT_WIDTH ? (
    <>GIF by {handle} on ohmagif.com</>
  ) : (
    <>{handle} on ohmagif.com</>
  );
  const credit = shortCredit ? shortCreditStyle : creditStyle;
  const cls = `${className} ohmagif-card`;
  const s = { ...cardStyle, ...style };

  // The whole card is one link to the GIF's page.
  if (link) {
    return (
      <a {...data} {...external} className={cls} href={gif.url} style={{ ...s, ...pointer }} onClick={onClick}>
        <span role="img" aria-label={label} className="ohmagif-frame" style={shape}>
          {pic}
        </span>
        <span className="ohmagif-credit" style={credit}>
          {words}
        </span>
      </a>
    );
  }

  // The frame does what the page wants (pick it, say); the credit line
  // links to the GIF's page.
  return (
    <span {...data} className={cls} style={s}>
      {onClick ? (
        <button type="button" aria-label={label} className="ohmagif-frame" style={{ ...shape, ...pointer }} onClick={onClick}>
          {pic}
        </button>
      ) : (
        <span role="img" aria-label={label} className="ohmagif-frame" style={shape}>
          {pic}
        </span>
      )}
      <a {...external} className="ohmagif-credit" href={gif.url} style={credit}>
        {words}
      </a>
    </span>
  );
}
