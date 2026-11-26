// A client for the public read endpoints of the ohmagif API (/api/v1). Every
// request carries an API key; the endpoints answer pages on any site the key
// allows.

import { asObject, DEFAULT_BASE_URL, isGifId, parseGif, RATINGS, siteURL, type Gif, type Rating } from "./gif.js";

export interface OhmagifFetchOptions {
  /**
   * Your API key, omg_ and 32 letters or digits, from
   * https://ohmagif.com/account/keys. Anyone using a page can read a key
   * sent from it: list the sites the key is for there, and other web pages
   * are refused.
   */
  apiKey: string;
  /** The site, https://ohmagif.com by default. */
  baseURL?: string;
  /** Milliseconds to wait for an answer, 10000 by default; 0 waits forever. */
  timeout?: number;
  /** A fetch to use instead of the global one. */
  fetch?: typeof globalThis.fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface PageOptions extends RequestOptions {
  /** 0 to 1000, 0 by default. */
  offset?: number;
  /** 1 to 50, 25 by default. */
  limit?: number;
  /** The highest rating to include. */
  rating?: Rating;
}

export interface Pagination {
  /** Every match, including those past the last reachable offset. */
  total_count: number;
  /** GIFs in this page. */
  count: number;
  /** The offset this page was asked for. */
  offset: number;
  /** The offset of the next page, null after the last one. */
  next: number | null;
}

export interface GifsResult {
  data: Gif[];
  pagination: Pagination;
}

export interface GifResult {
  data: Gif;
}

export interface Reaction {
  slug: string;
  name: string;
  /** Live GIFs filed under the reaction. */
  gifs: number;
  /** Its top GIF, null while it has none. */
  top: Gif | null;
}

export interface ReactionsResult {
  data: Reaction[];
}

/**
 * A request the API refused or did not answer. `code` is the API's own
 * (key_required, invalid_key, site_not_allowed, not_found, removed,
 * rate_limited, ...) or one of: invalid_id (no request was sent), network,
 * timeout, invalid_response.
 */
export class OhmagifError extends Error {
  readonly status: number;
  readonly code: string;
  /** Seconds to wait before asking again, when the API said. */
  readonly retryAfter: number | null;

  constructor(status: number, code: string, message: string, retryAfter: number | null = null) {
    super(message);
    this.name = "OhmagifError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const API_KEY = /^omg_[0-9A-Za-z]{32}$/;

/** Whether value is an ohmagif API key: omg_ and 32 letters or digits. */
export function isApiKey(value: unknown): value is string {
  return typeof value === "string" && API_KEY.test(value);
}

const MAX_LIMIT = 50;
const MAX_OFFSET = 1000;
const TAG_SLUG = /^[a-z0-9-]{1,80}$/;


function pageParams(options: PageOptions): Record<string, string> {
  const { offset = 0, limit = 25, rating } = options;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be 1 to ${MAX_LIMIT}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > MAX_OFFSET) {
    throw new RangeError(`offset must be 0 to ${MAX_OFFSET}`);
  }
  const params: Record<string, string> = { limit: String(limit), offset: String(offset) };
  if (rating !== undefined) {
    if (!RATINGS.includes(rating)) throw new RangeError("rating must be g, pg or pg13");
    params.rating = rating;
  }
  return params;
}

function retryAfter(res: Response): number | null {
  const v = res.headers.get("Retry-After");
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 0) return n;
  const at = Date.parse(v);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

function invalid(status: number): OhmagifError {
  return new OhmagifError(status, "invalid_response", "Unreadable answer from ohmagif");
}

/** A count from the API: a non-negative integer, or null. */
function count(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
}

/** Joins the caller's signal and the timeout into one. */
function deadline(signal: AbortSignal | undefined, ms: number) {
  if (!ms) return { signal, timedOut: () => false, done: () => {} };
  const ctrl = new AbortController();
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    ctrl.abort(new DOMException("Timed out", "TimeoutError"));
  }, ms);
  const forward = () => ctrl.abort(signal?.reason);
  if (signal?.aborted) forward();
  else signal?.addEventListener("abort", forward, { once: true });
  return {
    signal: ctrl.signal,
    timedOut: () => expired,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forward);
    },
  };
}

export class OhmagifFetch {
  readonly #base: string;
  readonly #key: string;
  readonly #timeout: number;
  readonly #fetch: typeof globalThis.fetch;

  /** Takes the options, or an API key alone. */
  constructor(options: OhmagifFetchOptions | string) {
    const o: Partial<OhmagifFetchOptions> = typeof options === "string" ? { apiKey: options } : (options ?? {});
    const key = typeof o.apiKey === "string" ? o.apiKey.trim() : "";
    if (!isApiKey(key)) throw new TypeError("apiKey must be an ohmagif key: omg_ and 32 letters or digits");
    this.#key = key;
    this.#base = siteURL(o.baseURL ?? DEFAULT_BASE_URL, "baseURL");
    this.#timeout = o.timeout ?? 10_000;
    if (!Number.isFinite(this.#timeout) || this.#timeout < 0) throw new RangeError("timeout must be 0 or more");
    // Called unbound: a fetch kept as a method throws "Illegal invocation"
    // in browsers.
    const f = o.fetch ?? globalThis.fetch;
    this.#fetch = (input, init) => f(input, init);
  }

  /** The page where people upload GIFs, for a link out of a picker. */
  get uploadURL(): string {
    return `${this.#base}/upload`;
  }

  /** GIFs matching the words, best match first. */
  async search(term: string, options: PageOptions = {}): Promise<GifsResult> {
    const q = term.trim();
    if (!q) throw new RangeError("term is empty");
    return this.#list("/search", { q, ...pageParams(options) }, options);
  }

  /** The GIFs shared most over the last days. */
  async trending(options: PageOptions = {}): Promise<GifsResult> {
    return this.#list("/trending", pageParams(options), options);
  }

  /** GIFs with a tag or reaction, by its slug (see reactions()). */
  async tag(slug: string, options: PageOptions = {}): Promise<GifsResult> {
    const s = slug.trim().toLowerCase();
    if (!TAG_SLUG.test(s)) throw new RangeError(`not a tag slug: ${slug}`);
    return this.#list(`/tags/${s}`, pageParams(options), options);
  }

  /**
   * One GIF by its id. A GIF that is gone rejects with code not_found or
   * removed; an id that is not one rejects with invalid_id, without a
   * request. Ask again rather than keep the answer for long: file addresses
   * change when a GIF is rendered again, and the old files go an hour later.
   */
  async gif(id: string, options: RequestOptions = {}): Promise<GifResult> {
    if (!isGifId(id)) throw new OhmagifError(0, "invalid_id", "Not a GIF id");
    const { body, status } = await this.#get(`/gifs/${id}`, {}, options.signal);
    const gif = parseGif(body);
    if (!gif) throw invalid(status);
    return { data: gif };
  }

  /** The curated reactions, each with its top GIF. */
  async reactions(options: RequestOptions = {}): Promise<ReactionsResult> {
    const { body, status } = await this.#get("/reactions", {}, options.signal);
    const results = asObject(body)?.results;
    if (!Array.isArray(results)) throw invalid(status);
    const data: Reaction[] = [];
    for (const raw of results) {
      const r = asObject(raw);
      if (!r || typeof r.slug !== "string" || !TAG_SLUG.test(r.slug) || typeof r.name !== "string") continue;
      data.push({ slug: r.slug, name: r.name, gifs: count(r.gifs) ?? 0, top: parseGif(r.top) });
    }
    return { data };
  }

  async #list(path: string, params: Record<string, string>, options: RequestOptions): Promise<GifsResult> {
    const { body, status } = await this.#get(path, params, options.signal);
    const o = asObject(body);
    if (!o || !Array.isArray(o.results)) throw invalid(status);
    const data = o.results.map(parseGif).filter((g): g is Gif => g !== null);
    const offset = Number(params.offset);
    const next = count(o.next);
    return {
      data,
      pagination: {
        total_count: count(o.total) ?? offset + data.length,
        count: data.length,
        offset,
        // A next page must move forward, or a paging loop never ends.
        next: next !== null && next > offset ? next : null,
      },
    };
  }

  async #get(path: string, params: Record<string, string>, signal?: AbortSignal) {
    const url = new URL(`${this.#base}/api/v1${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const headers = { Accept: "application/json", Authorization: `Bearer ${this.#key}` };
    const d = deadline(signal, this.#timeout);
    let res: Response;
    let body: unknown;
    try {
      res = await this.#fetch(url.href, {
        method: "GET",
        headers,
        // Nothing of the page travels with the request: no cookies, and not
        // the address of the page (a chat room, a draft) it was made from.
        credentials: "omit",
        referrerPolicy: "no-referrer",
        mode: "cors",
        signal: d.signal ?? null,
      });
      try {
        body = await res.json();
      } catch (err) {
        // A body that is not JSON (a proxy's error page) is checked below;
        // an abort while reading is not.
        if (d.signal?.aborted) throw err;
      }
    } catch (err) {
      if (signal?.aborted) throw signal.reason ?? err;
      if (d.timedOut()) {
        throw new OhmagifError(0, "timeout", `No answer from ohmagif within ${this.#timeout / 1000} s`);
      }
      throw new OhmagifError(0, "network", "No answer from ohmagif");
    } finally {
      d.done();
    }
    if (!res.ok) {
      const o = asObject(body);
      const code = typeof o?.code === "string" ? o.code : `http_${res.status}`;
      const message = typeof o?.error === "string" ? o.error : `ohmagif answered ${res.status}`;
      throw new OhmagifError(res.status, code, message, retryAfter(res));
    }
    if (body === undefined) throw invalid(res.status);
    return { body, status: res.status };
  }
}
