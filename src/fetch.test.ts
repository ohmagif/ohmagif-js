import { afterEach, describe, expect, it, vi } from "vitest";
import { OhmagifError, OhmagifFetch } from "./fetch.js";
import { apiGif, gifId, json } from "./test/fixtures.js";

type Call = { url: URL; init: RequestInit };

/** A client whose requests are recorded and answered by `answer`. */
function client(answer: (url: URL) => Response | Promise<Response> = () => json({ results: [], next: null, total: 0 }), options = {}) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {} });
    return answer(url);
  });
  return { gf: new OhmagifFetch({ fetch, ...options }), calls, fetch };
}

function list(n: number, extra: Record<string, unknown> = {}) {
  return json({ results: Array.from({ length: n }, (_, i) => apiGif(gifId(i + 1))), next: n, total: 100, ...extra });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("requests", () => {
  it("asks for trending GIFs without anything of the page", async () => {
    const { gf, calls } = client(() => list(2));
    const res = await gf.trending();
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url.href).toBe("https://ohmagif.com/api/v1/trending?limit=25&offset=0");
    expect(init).toMatchObject({ method: "GET", credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" });
    expect(init.headers).toEqual({ Accept: "application/json" });
    expect(res.data.map((g) => g.id)).toEqual([gifId(1), gifId(2)]);
    expect(res.pagination).toEqual({ total_count: 100, count: 2, offset: 0, next: 2 });
  });

  it("searches for the trimmed words with paging and a rating", async () => {
    const { gf, calls } = client(() => list(1));
    await gf.search("  side eye & co/ü ", { offset: 25, limit: 12, rating: "pg" });
    const { url } = calls[0]!;
    expect(url.pathname).toBe("/api/v1/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "side eye & co/ü", limit: "12", offset: "25", rating: "pg" });
  });

  it("asks for a tag by its slug", async () => {
    const { gf, calls } = client(() => list(1));
    await gf.tag(" Side-Eye ", { limit: 5 });
    expect(calls[0]!.url.href).toBe("https://ohmagif.com/api/v1/tags/side-eye?limit=5&offset=0");
  });

  it("asks for one GIF by its id", async () => {
    const { gf, calls } = client(() => json(apiGif("eTxuLnWv7C")));
    const { data } = await gf.gif("eTxuLnWv7C");
    expect(calls[0]!.url.href).toBe("https://ohmagif.com/api/v1/gifs/eTxuLnWv7C");
    expect(data.id).toBe("eTxuLnWv7C");
  });

  it.each([
    ["alone", "  omg_abc  "],
    ["in the options", { apiKey: "omg_abc" }],
  ])("sends a key given %s as a bearer token", async (_, options) => {
    const sent: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => (sent.push(init), list(0)));
    await new OhmagifFetch(options).trending();
    expect(sent[0]!.headers).toEqual({ Accept: "application/json", Authorization: "Bearer omg_abc" });
  });

  it("sends no key when the key is blank", async () => {
    const { gf, calls } = client(() => list(0), { apiKey: "   " });
    await gf.trending();
    expect(calls[0]!.init.headers).toEqual({ Accept: "application/json" });
  });

  it("uses the global fetch, called unbound", async () => {
    const seen: unknown[] = [];
    vi.stubGlobal("fetch", function (this: unknown) {
      seen.push(this);
      return Promise.resolve(list(0));
    });
    await new OhmagifFetch().trending();
    expect(seen).toEqual([undefined]);
  });

  it("talks to another site", async () => {
    const { gf, calls } = client(() => list(0), { baseURL: "http://localhost:8080/" });
    await gf.trending();
    expect(calls[0]!.url.href).toBe("http://localhost:8080/api/v1/trending?limit=25&offset=0");
  });

  it.each(["ftp://ohmagif.com", "javascript:alert(1)", "ohmagif.com", "https://ohmagif.com/?x=1", "https://ohmagif.com/#x", "https://u:p@ohmagif.com"])(
    "refuses the site %s",
    (baseURL) => {
      expect(() => new OhmagifFetch({ baseURL })).toThrow(TypeError);
    },
  );

  it("names the upload page of its site", () => {
    expect(new OhmagifFetch().uploadURL).toBe("https://ohmagif.com/upload");
    expect(new OhmagifFetch({ baseURL: "http://localhost:8080/" }).uploadURL).toBe("http://localhost:8080/upload");
  });

  it("refuses a negative timeout", () => {
    expect(() => new OhmagifFetch({ timeout: -1 })).toThrow(RangeError);
  });
});

describe("checks before a request", () => {
  it.each([
    ["an empty search", (gf: OhmagifFetch) => gf.search("   ")],
    ["a limit of 0", (gf: OhmagifFetch) => gf.trending({ limit: 0 })],
    ["a limit of 51", (gf: OhmagifFetch) => gf.trending({ limit: 51 })],
    ["a fractional limit", (gf: OhmagifFetch) => gf.trending({ limit: 2.5 })],
    ["a negative offset", (gf: OhmagifFetch) => gf.trending({ offset: -1 })],
    ["an offset past 1000", (gf: OhmagifFetch) => gf.trending({ offset: 1001 })],
    ["an unknown rating", (gf: OhmagifFetch) => gf.trending({ rating: "r" as "g" })],
    ["a tag with a slash", (gf: OhmagifFetch) => gf.tag("../admin")],
  ])("refuses %s", async (_, call) => {
    const { gf, fetch } = client();
    await expect(call(gf)).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["", "abc", "../../admin", "eTxuLnWv7C/../x", "eTxuLnWv7%2F", "eTxuLnWv7C?x=1", "eTxuLnWv7C#x"])("refuses the id %j", async (id) => {
    const { gf, fetch } = client();
    await expect(gf.gif(id)).rejects.toMatchObject({ name: "OhmagifError", code: "invalid_id", status: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("answers", () => {
  it("drops GIFs that do not check out and keeps the rest", async () => {
    const { gf } = client(() =>
      json({
        results: [apiGif(gifId(1)), apiGif(gifId(2), { url: "javascript:alert(1)" }), { id: "x" }, null, apiGif(gifId(3))],
        next: 5,
        total: 9,
      }),
    );
    const res = await gf.trending({ limit: 5 });
    expect(res.data.map((g) => g.id)).toEqual([gifId(1), gifId(3)]);
    expect(res.pagination).toEqual({ total_count: 9, count: 2, offset: 0, next: 5 });
  });

  it("ends paging at a next that does not move forward", async () => {
    for (const next of [null, 0, 25, -5, "50", 1.5]) {
      const { gf } = client(() => list(1, { next }));
      const res = await gf.trending({ offset: 25 });
      expect(res.pagination.next, String(next)).toBeNull();
    }
  });

  it("counts what it has when the total is missing", async () => {
    const { gf } = client(() => list(3, { total: undefined }));
    expect((await gf.trending({ offset: 10 })).pagination.total_count).toBe(13);
  });

  it("reads the reactions and passes over broken ones", async () => {
    const { gf, calls } = client(() =>
      json({
        results: [
          { slug: "side-eye", name: "side-eye", gifs: 12, top: apiGif(gifId(1)) },
          { slug: "oops", name: "oops", gifs: "many", top: null },
          { slug: "../x", name: "x", gifs: 1, top: null },
          { slug: "ok", name: 5 },
          "nope",
        ],
      }),
    );
    const { data } = await gf.reactions();
    expect(calls[0]!.url.pathname).toBe("/api/v1/reactions");
    expect(data.map((r) => [r.slug, r.gifs, r.top?.id ?? null])).toEqual([
      ["side-eye", 12, gifId(1)],
      ["oops", 0, null],
    ]);
  });

  it.each([
    ["a list without results", (gf: OhmagifFetch) => gf.trending(), json({ data: [] })],
    ["a GIF that does not check out", (gf: OhmagifFetch) => gf.gif("eTxuLnWv7C"), json({ id: "eTxuLnWv7C" })],
    ["reactions without results", (gf: OhmagifFetch) => gf.reactions(), json({})],
    ["a body that is not JSON", (gf: OhmagifFetch) => gf.trending(), new Response("<html>", { status: 200 })],
  ])("rejects %s as invalid_response", async (_, call, res) => {
    const { gf } = client(() => res);
    await expect(call(gf)).rejects.toMatchObject({ code: "invalid_response", status: 200 });
  });
});

describe("failures", () => {
  it("passes on the API's code and sentence", async () => {
    const { gf } = client(() => json({ error: "No such GIF", code: "not_found" }, { status: 404 }));
    const err = await gf.gif("eTxuLnWv7C").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OhmagifError);
    expect(err).toMatchObject({ status: 404, code: "not_found", message: "No such GIF", retryAfter: null });
  });

  it("says when to ask again after a rate limit", async () => {
    const { gf } = client(() => json({ error: "Slow down", code: "rate_limited" }, { status: 429, headers: { "Retry-After": "30" } }));
    await expect(gf.trending()).rejects.toMatchObject({ status: 429, code: "rate_limited", retryAfter: 30 });
  });

  it("reads Retry-After as a date", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-11-24T12:00:00Z") });
    const { gf } = client(() => new Response("", { status: 503, headers: { "Retry-After": "Tue, 24 Nov 2026 12:01:00 GMT" } }));
    await expect(gf.trending()).rejects.toMatchObject({ status: 503, code: "http_503", retryAfter: 60 });
  });

  it("ignores a Retry-After it cannot read", async () => {
    const { gf } = client(() => new Response("", { status: 503, headers: { "Retry-After": "soon" } }));
    await expect(gf.trending()).rejects.toMatchObject({ retryAfter: null });
  });

  it("names an error page by its status", async () => {
    const { gf } = client(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(gf.trending()).rejects.toMatchObject({ status: 502, code: "http_502", message: "ohmagif answered 502" });
  });

  it("says when there is no answer", async () => {
    const gf = new OhmagifFetch({ fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(gf.trending()).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("gives up after the timeout", async () => {
    vi.useFakeTimers();
    const gf = new OhmagifFetch({
      timeout: 2000,
      fetch: (_, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    });
    const pending = gf.trending().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).toMatchObject({ code: "timeout", message: "No answer from ohmagif within 2 s" });
  });

  it("waits forever with a timeout of 0", async () => {
    const seen: (AbortSignal | null | undefined)[] = [];
    const gf = new OhmagifFetch({ timeout: 0, fetch: async (_, init) => (seen.push(init?.signal), list(0)) });
    await gf.trending();
    expect(seen).toEqual([null]);
  });

  it("says when there is no answer with a timeout of 0", async () => {
    const gf = new OhmagifFetch({ timeout: 0, fetch: () => Promise.reject(new TypeError("Failed to fetch")) });
    await expect(gf.trending()).rejects.toMatchObject({ code: "network" });
  });

  it("rejects with the fetch's error when the caller's signal has no reason", async () => {
    // Browsers from before abort reasons (Safari 15.3 and older) leave it out.
    const signal = { aborted: true, reason: undefined, addEventListener() {}, removeEventListener() {} } as unknown as AbortSignal;
    const failure = new DOMException("Aborted", "AbortError");
    const gf = new OhmagifFetch({ fetch: () => Promise.reject(failure) });
    await expect(gf.trending({ signal })).rejects.toBe(failure);
  });

  it("rejects with the caller's reason when the caller aborts", async () => {
    const ctrl = new AbortController();
    const gf = new OhmagifFetch({
      fetch: (_, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))),
    });
    const pending = gf.search("cats", { signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects at once when the caller aborted already", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const gf = new OhmagifFetch({
      fetch: (_, init) => (init?.signal?.aborted ? Promise.reject(init.signal.reason) : Promise.resolve(list(0))),
    });
    await expect(gf.trending({ signal: ctrl.signal })).rejects.toMatchObject({ name: "AbortError" });
  });

  it("stops reading a body the caller aborted", async () => {
    const ctrl = new AbortController();
    const gf = new OhmagifFetch({
      fetch: async () =>
        Object.assign(new Response(null, { status: 200 }), {
          // The caller gives up while the body is on its way.
          json: () =>
            new Promise((_, reject) => {
              ctrl.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
              ctrl.abort();
            }),
        }),
    });
    await expect(gf.trending({ signal: ctrl.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
