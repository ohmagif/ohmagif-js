import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { frameSize, isApiKey, OhmagifError, OhmagifFetch, type Gif as GifData } from "../src/index.js";
import { Gif, gifSize, Grid } from "../src/react/index.js";

const params = new URLSearchParams(location.search);
const base = params.get("base") ?? undefined;
const key = params.get("key") ?? import.meta.env.OHMAGIF_API_KEY ?? "";
let gf: OhmagifFetch;

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 250;
const MAX_WIDTH = 420;
const MAX_HEIGHT = 320;

/**
 * A sent message holds the GIF's id and the size of its frame, to keep its
 * room before it loads: nothing that can go stale.
 */
interface Sent {
  id: string;
  width: number;
  height: number;
}

interface Message extends Sent {
  key: number;
}

/** The width a message shows a GIF at: its own size, within 420 x 320. */
function fit(frame: { width: number; height: number }) {
  return Math.min(MAX_WIDTH, frame.width + 2, Math.floor((MAX_HEIGHT * frame.width) / frame.height) + 2);
}

/** A GIF in a message, asked for by id each time it shows. */
function GifMessage({ id, width, height }: Sent) {
  const [gif, setGif] = useState<GifData | null>(null);
  const [failed, setFailed] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    gf.gif(id, { signal: ctrl.signal }).then(
      ({ data }) => setGif(data),
      (err: unknown) => {
        if (ctrl.signal.aborted) return;
        setFailed(err instanceof OhmagifError && (err.code === "not_found" || err.code === "removed") ? "GIF removed" : "GIF unavailable");
      },
    );
    return () => ctrl.abort();
  }, [id, attempt]);
  // The room the GIF will take, known from the message alone, so nothing
  // moves when it arrives.
  const box = gifSize({ width, height }, fit({ width, height }));
  if (failed) return <span className="placeholder" style={box}>{failed}</span>;
  if (!gif) return <span className="placeholder" style={box} />;
  // A file address that stopped working means the GIF was rendered again:
  // asking for it once more gives the new one.
  return <Gif gif={gif} width={box.width} onError={() => attempt === 0 && setAttempt(1)} />;
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
    setMessages((m) => [...m, { key: Date.now(), id: gif.id, ...frameSize(gif) }]);
    setOpen(false);
  }, []);
  return (
    <>
      <h1>Chat</h1>
      <ol className="messages" aria-label="Messages">
        {messages.map((m) => (
          <li key={m.key}>
            <code>ohmagif:{m.id}</code>
            <GifMessage id={m.id} width={m.width} height={m.height} />
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
