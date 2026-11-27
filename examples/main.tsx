import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { gifLabel, isApiKey, OhmagifFetch, type Gif as GifData } from "../src/index.js";
import { GifFromId, gifSize, Grid } from "../src/react/index.js";

const params = new URLSearchParams(location.search);
const base = params.get("base") ?? undefined;
// Where that ohmagif serves its files, http://localhost:8080/media for one
// run locally.
const media = params.get("media") ?? undefined;
const key = params.get("key") ?? import.meta.env.OHMAGIF_API_KEY ?? "";
let gf: OhmagifFetch;

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 250;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 320;

/**
 * A sent message holds the GIF's id, the size of its file and what it
 * shows: enough to draw it without a request, and nothing that goes stale.
 */
interface Sent {
  id: string;
  width: number;
  height: number;
  alt: string;
}

interface Message extends Sent {
  key: number;
}

/** The width a message shows a GIF at: its own size, within 420 x 320. */
function fit(size: { width: number; height: number }) {
  return Math.min(MAX_WIDTH, size.width, Math.floor((MAX_HEIGHT * size.width) / size.height));
}

/**
 * A GIF in a message, drawn from the message alone: its file comes from
 * the CDN, and the API is not asked.
 */
function GifMessage({ id, width, height, alt }: Sent) {
  const [failed, setFailed] = useState(false);
  const size = { width, height };
  const shown = fit(size);
  if (failed) {
    return (
      <span className="placeholder" style={gifSize(size, shown, { hideAttribution: true })}>
        GIF unavailable
      </span>
    );
  }
  return <GifFromId id={id} size={size} width={shown} alt={alt} baseURL={base} mediaURL={media} onError={() => setFailed(true)} />;
}

function Picker({ onPick, onClose }: { onPick: (gif: GifData) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [term, setTerm] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The grid is as wide as the room the scrollbar leaves.
  const [width, setWidth] = useState(0);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);
  const fetchGifs = useCallback(
    (offset: number, signal: AbortSignal) => {
      const options = { offset, limit: PAGE_SIZE, rating: "pg" as const, signal };
      return term ? gf.search(term, options) : gf.trending(options);
    },
    [term],
  );
  return (
    <div className="picker" role="dialog" aria-label="GIFs" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search GIFs" aria-label="Search GIFs" />
      <div className="picker-scroll" ref={scroller}>
        {width > 0 && (
          <Grid
            key={term}
            fetchGifs={fetchGifs}
            width={width}
            columns={2}
            gutter={6}
            noLink
            onGifClick={onPick}
            uploadURL={gf.uploadURL}
            noResultsMessage={<p className="status">No GIFs found</p>}
            loader={() => <p className="status">Loading</p>}
          />
        )}
      </div>
    </div>
  );
}

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [open, setOpen] = useState(false);
  const pick = useCallback((gif: GifData) => {
    setMessages((m) => [...m, { key: Date.now(), id: gif.id, width: gif.width, height: gif.height, alt: gifLabel(gif) }]);
    setOpen(false);
  }, []);
  return (
    <>
      <h1>Chat</h1>
      <ol className="messages" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.key}>
            <code>ohmagif:{m.id}</code>
            <GifMessage id={m.id} width={m.width} height={m.height} alt={m.alt} />
          </li>
        ))}
      </ol>
      <div className="composer">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          GIF
        </button>
        {open && <Picker onPick={pick} onClose={() => setOpen(false)} />}
      </div>
    </>
  );
}

const root = createRoot(document.getElementById("app")!);
if (isApiKey(key)) {
  gf = new OhmagifFetch({ apiKey: key, baseURL: base });
  root.render(
    <StrictMode>
      <Chat />
    </StrictMode>,
  );
} else {
  root.render(<p className="status">No API key: set OHMAGIF_API_KEY, or ?key=</p>);
}
