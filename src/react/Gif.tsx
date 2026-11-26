"use client";

import type { MouseEvent } from "react";
import type { Gif as GifData } from "../gif.js";
import { Card } from "./Card.js";

export interface GifProps {
  gif: GifData;
  /**
   * Width in CSS pixels, card included. gifSize(frameSize(gif), width) is
   * the room it takes. It never grows past its container.
   */
  width: number;
  /** The frame does not link to the GIF's page; the credit line still does. */
  noLink?: boolean;
  /** Called on a click on the frame. With noLink, the frame is a button. */
  onGifClick?: (gif: GifData, e: MouseEvent<HTMLElement>) => void;
  /** The whole file, its credit strip showing, without the card and its credit line. */
  hideAttribution?: boolean;
  /** Load the file only once the GIF is near the screen. On by default. */
  lazyLoad?: boolean;
  className?: string;
  onLoad?: () => void;
  /** The file did not load: the GIF was taken down, or the network failed. */
  onError?: () => void;
}

/**
 * One GIF at a given width: its frame, cut from the credit strip in the
 * file, in a card with the credit line under it, as ohmagif's embed shows
 * it.
 */
export function Gif({ gif, width, noLink = false, onGifClick, hideAttribution = false, lazyLoad = true, className, onLoad, onError }: GifProps) {
  const click = onGifClick && ((e: MouseEvent<HTMLElement>) => onGifClick(gif, e));
  return (
    <Card
      gif={gif}
      width={width}
      link={!noLink}
      onClick={click}
      hideAttribution={hideAttribution}
      lazy={lazyLoad}
      onLoad={onLoad}
      onError={onError}
      className={className ? `ohmagif-gif ${className}` : "ohmagif-gif"}
      style={{ width, maxWidth: "100%" }}
    />
  );
}
