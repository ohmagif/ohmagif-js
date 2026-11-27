"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { DEFAULT_BASE_URL, httpURL, type Gif as GifData } from "../gif.js";
import { buttonStyle, Card } from "./Card.js";
import { masonry } from "./layout.js";

/**
 * One page of GIFs, as OhmagifFetch's search, trending and tag answer it.
 * `next` is the offset of the following page (null after the last one);
 * without it the next page starts at `offset + count`.
 */
export interface GridPage {
  data: readonly GifData[];
  pagination: { offset: number; count: number; total_count: number; next?: number | null };
}

export interface GridProps {
  /**
   * Fetches the page at an offset. The grid aborts the signal when it
   * unmounts. Give the grid a new `key` to start again from the first
   * page (a new search, say).
   */
  fetchGifs: (offset: number, signal: AbortSignal) => Promise<GridPage>;
  /** Width in CSS pixels. */
  width: number;
  columns: number;
  /** Space between GIFs in CSS pixels, 6 by default. */
  gutter?: number;
  /** Tiles are buttons rather than links to the GIF's page. */
  noLink?: boolean;
  /** Tiles are the whole file, its credit strip showing, without the card and its credit line. */
  hideAttribution?: boolean;
  onGifClick?: (gif: GifData, e: MouseEvent<HTMLElement>) => void;
  /** Every GIF the grid holds, after each page. */
  onGifsFetched?: (gifs: GifData[]) => void;
  onGifsFetchError?: (error: unknown) => void;
  /** Shown when the first page is empty. */
  noResultsMessage?: ReactNode;
  /**
   * The upload page, offered when nothing matched and after the last page;
   * OhmagifFetch's uploadURL. null offers nothing.
   */
  uploadURL?: string | null;
  /** Shown above the Retry button when a page did not load. */
  errorMessage?: ReactNode;
  /** Shown while a page loads. */
  loader?: ElementType;
  className?: string;
}

type Status = "idle" | "loading" | "error" | "done";

// useLayoutEffect has nothing to do on a server and React 18 warns there.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The element the grid scrolls in, or null for the page itself. */
function scrollParent(el: Element): Element | null {
  for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return p;
  }
  return null;
}

function DefaultLoader() {
  return (
    <div className="ohmagif-loading" role="status">
      Loading
    </div>
  );
}

const endStyle: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "12px 0" };

interface TileProps {
  gif: GifData;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Whether the tile is within a screen of the visible area. */
  near: boolean;
  link: boolean;
  hideAttribution: boolean;
  onClick: (gif: GifData, e: MouseEvent<HTMLElement>) => void;
}

const Tile = memo(function Tile({ gif, x, y, w, h, near, link, hideAttribution, onClick }: TileProps) {
  // The picture is only there while the tile is near the screen; the tile
  // keeps its size and its name without it.
  return (
    <Card
      gif={gif}
      id={gif.id}
      width={w}
      picture={near}
      tinyOnly
      link={link}
      onClick={(e) => onClick(gif, e)}
      hideAttribution={hideAttribution}
      shortCredit
      className="ohmagif-tile"
      style={{ position: "absolute", left: x, top: y, width: w, height: h }}
    />
  );
});

const nobody: ReadonlySet<string> = new Set();

/**
 * GIFs in columns, loading the next page as the end comes near. Only the
 * tiles within a screen of the visible area hold a picture, so a long
 * scroll costs no more to show than the first page.
 */
export function Grid({
  fetchGifs,
  width,
  columns,
  gutter = 6,
  noLink = false,
  hideAttribution = false,
  onGifClick,
  onGifsFetched,
  onGifsFetchError,
  noResultsMessage = "No GIFs found",
  uploadURL = `${DEFAULT_BASE_URL}/upload`,
  errorMessage = "GIFs did not load",
  loader: Loader = DefaultLoader,
  className,
}: GridProps) {
  const [gifs, setGifs] = useState<GifData[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [near, setNear] = useState<ReadonlySet<string>>(nobody);
  // Without IntersectionObserver every tile holds its picture.
  const [everyPicture, setEveryPicture] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  const callbacks = useRef({ fetchGifs, onGifClick, onGifsFetched, onGifsFetchError });
  useIsoLayoutEffect(() => {
    callbacks.current = { fetchGifs, onGifClick, onGifsFetched, onGifsFetchError };
  });
  // What loading decides on, read and written outside of rendering.
  const [s] = useState(() => ({
    status: "idle" as Status,
    next: 0,
    all: [] as GifData[],
    seen: new Set<string>(),
    endNear: false,
    ctrl: null as AbortController | null,
  }));

  const load = useCallback(() => {
    const ctrl = s.ctrl;
    if (s.status !== "idle" || !s.endNear || !ctrl) return;
    const offset = s.next;
    s.status = "loading";
    setStatus("loading");
    const settle = (status: Status) => {
      s.status = status;
      setStatus(status);
    };
    new Promise<GridPage>((resolve) => resolve(callbacks.current.fetchGifs(offset, ctrl.signal))).then(
      (page) => {
        if (ctrl.signal.aborted) return;
        const data = Array.isArray(page?.data) ? page.data : [];
        const fresh = data.filter((g) => !s.seen.has(g.id));
        for (const g of fresh) s.seen.add(g.id);
        if (fresh.length) s.all = [...s.all, ...fresh];
        const p = page?.pagination;
        const next =
          p?.next !== undefined ? p.next : data.length && p ? p.offset + (p.count || data.length) : null;
        const done = next === null || next <= offset || (p !== undefined && next >= p.total_count);
        if (next !== null) s.next = next;
        setGifs(s.all);
        settle(done ? "done" : "idle");
        callbacks.current.onGifsFetched?.(s.all);
      },
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        settle("error");
        callbacks.current.onGifsFetchError?.(err);
      },
    );
  }, [s]);

  useIsoLayoutEffect(() => {
    const ctrl = new AbortController();
    s.ctrl = ctrl;
    const box = boxRef.current!;
    const end = endRef.current!;
    if (typeof IntersectionObserver === "undefined") {
      // Every picture at once, and the first page only.
      setEveryPicture(true);
      s.endNear = true;
      load();
      return () => {
        ctrl.abort();
        s.ctrl = null;
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        const add: string[] = [];
        const drop: string[] = [];
        for (const e of entries) {
          if (e.target === end) {
            s.endNear = e.isIntersecting;
            continue;
          }
          // Every other target is a tile, which carries its GIF's id.
          (e.isIntersecting ? add : drop).push((e.target as HTMLElement).dataset.ohmagifId!);
        }
        if (add.length || drop.length) {
          setNear((prev) => {
            const next = new Set(prev);
            for (const id of add) next.add(id);
            for (const id of drop) next.delete(id);
            return next;
          });
        }
        load();
      },
      // A screen's height ahead: pictures and the next page are there
      // before they are scrolled to.
      { root: scrollParent(box), rootMargin: "100% 0px" },
    );
    observer.current = io;
    io.observe(end);
    // Tiles are already there when a hidden grid shows again (in an
    // <Activity>, say): its effects start over, its elements stay.
    for (const el of Array.from(box.children)) io.observe(el);
    return () => {
      io.disconnect();
      observer.current = null;
      ctrl.abort();
      s.ctrl = null;
      // The aborted request never settles; a remount starts it again.
      if (s.status === "loading") s.status = "idle";
    };
  }, [s, load]);

  // New tiles are watched as they appear (observing one twice does nothing).
  useIsoLayoutEffect(() => {
    const io = observer.current;
    if (io && boxRef.current) for (const el of Array.from(boxRef.current.children)) io.observe(el);
  }, [gifs]);

  // After a page, or a retry, look at the end again: watching it anew makes
  // the observer report where it is now, so a page that did not fill the
  // screen is followed by the next one.
  useIsoLayoutEffect(() => {
    const io = observer.current;
    if (status !== "idle" || !io || !endRef.current) return;
    io.unobserve(endRef.current);
    io.observe(endRef.current);
  }, [status]);

  // Only the error state shows the button.
  const retry = useCallback(() => {
    s.status = "idle";
    setStatus("idle");
    if (!observer.current) load();
  }, [s, load]);

  const click = useCallback((gif: GifData, e: MouseEvent<HTMLElement>) => callbacks.current.onGifClick?.(gif, e), []);
  const layout = useMemo(
    () => masonry(gifs, width, columns, gutter, { hideAttribution }),
    [gifs, width, columns, gutter, hideAttribution],
  );
  const upload = httpURL(uploadURL);

  return (
    <div className={className ? `ohmagif-grid ${className}` : "ohmagif-grid"} style={{ width, maxWidth: "100%" }}>
      <div ref={boxRef} style={{ position: "relative", width, height: layout.height }}>
        {gifs.map((gif, i) => {
          const b = layout.boxes[i]!;
          return (
            <Tile
              key={gif.id}
              gif={gif}
              x={b.x}
              y={b.y}
              w={b.width}
              h={b.height}
              near={everyPicture || near.has(gif.id)}
              link={!noLink}
              hideAttribution={hideAttribution}
              onClick={click}
            />
          );
        })}
      </div>
      <div ref={endRef} aria-hidden="true" style={{ height: 1 }} />
      {status === "loading" && <Loader />}
      {status === "done" && (gifs.length === 0 || upload) && (
        <div className="ohmagif-end" style={endStyle}>
          {gifs.length === 0 && noResultsMessage}
          {upload && (
            <a
              className="ohmagif-upload"
              href={upload}
              target="_blank"
              rel="noopener noreferrer"
              referrerPolicy="no-referrer"
              style={buttonStyle}
            >
              Upload to ohmagif
            </a>
          )}
        </div>
      )}
      {status === "error" && (
        <div className="ohmagif-error" role="alert" style={endStyle}>
          {errorMessage}
          <button type="button" style={buttonStyle} onClick={retry}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
