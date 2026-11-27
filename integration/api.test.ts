import { describe, expect, it } from "vitest";
import { CREDIT_STRIP_HEIGHT, DEFAULT_MEDIA_URL, fileURL, frameSize, OhmagifError, OhmagifFetch, tinyFrameSize, type Gif } from "../src/index.js";

const baseURL = process.env.OHMAGIF_BASE_URL ?? "https://ohmagif.com";
const mediaURL = process.env.OHMAGIF_MEDIA_URL ?? DEFAULT_MEDIA_URL;
const apiKey = process.env.OHMAGIF_API_KEY ?? "";
if (!apiKey) throw new Error("OHMAGIF_API_KEY is not set: an ohmagif API key");

/**
 * A client that also keeps, for each list it was answered, how many GIFs the
 * answer held before they were checked, and the headers it came with.
 */
function client() {
  const sent: number[] = [];
  const headers: Headers[] = [];
  const gf = new OhmagifFetch({
    apiKey,
    baseURL,
    fetch: async (input, init) => {
      const res = await fetch(input, init);
      headers.push(res.headers);
      const body = (await res.clone().json().catch(() => null)) as { results?: unknown } | null;
      if (Array.isArray(body?.results)) sent.push(body.results.length);
      return res;
    },
  });
  return { gf, sent, headers };
}

/** What the components rely on, for one GIF. */
function expectUsable(g: Gif) {
  const { full, tiny, poster } = g.files;
  expect(g.url.startsWith(`${baseURL}/`)).toBe(true);
  expect([full.type, tiny.type, poster.type]).toEqual(["image/avif", "image/avif", "image/jpeg"]);
  // Each file is where fileURL puts it, so a message that keeps the id can
  // show the GIF without a request.
  expect([full.url, tiny.url, poster.url]).toEqual([fileURL(g.id, "full", mediaURL), fileURL(g.id, "tiny", mediaURL), fileURL(g.id, "poster", mediaURL)]);
  // width and height are the full file's, credit strip and all.
  expect([full.width, full.height]).toEqual([g.width, g.height]);
  expect([poster.width, poster.height]).toEqual([g.width, g.height]);
  expect(tiny.width).toBe(Math.min(320, full.width));
  expect(full.height).toBeGreaterThan(CREDIT_STRIP_HEIGHT);
  expect(tiny.height).toBeGreaterThan(CREDIT_STRIP_HEIGHT);
  // The frame the card shows leaves the strip out of both files.
  const frame = frameSize(g);
  expect(frame.width).toBe(full.width);
  expect(frame.height).toBeLessThanOrEqual(full.height - CREDIT_STRIP_HEIGHT);
  expect(frame.height).toBeGreaterThanOrEqual(full.height - CREDIT_STRIP_HEIGHT - 2);
  expect(frame.height / frame.width).toBeLessThanOrEqual(tinyFrameSize(g).height / tiny.width + 1e-9);
}

describe("the live API", () => {
  it("answers trending GIFs that all check out, to any page", async () => {
    const { gf, sent, headers } = client();
    const { data, pagination } = await gf.trending({ limit: 25 });
    expect(data.length).toBeGreaterThan(0);
    expect(data).toHaveLength(sent[0]!);
    for (const g of data) expectUsable(g);
    expect(pagination).toMatchObject({ offset: 0, count: data.length });
    expect(headers[0]!.get("access-control-allow-origin")).toBe("*");
  });

  it("pages on from next without repeating a GIF", async () => {
    const { gf } = client();
    const first = await gf.trending({ limit: 10 });
    expect(first.pagination.next).toBe(10);
    const second = await gf.trending({ limit: 10, offset: first.pagination.next! });
    expect(second.data.length).toBeGreaterThan(0);
    const ids = new Set(first.data.map((g) => g.id));
    expect(second.data.filter((g) => ids.has(g.id))).toEqual([]);
  });

  it("finds GIFs for a word, and none for nonsense", async () => {
    const { gf, sent } = client();
    const found = await gf.search("dance", { limit: 10, rating: "pg" });
    expect(found.data.length).toBeGreaterThan(0);
    expect(found.data).toHaveLength(sent[0]!);
    expect(found.data.every((g) => g.rating === "g" || g.rating === "pg")).toBe(true);
    const none = await gf.search("zqxjvkwpfh");
    expect(none).toEqual({ data: [], pagination: { total_count: 0, count: 0, offset: 0, next: null } });
  });

  it("lists the reactions, and a reaction's GIFs by its slug", async () => {
    const { gf, sent } = client();
    const { data } = await gf.reactions();
    expect(data.length).toBeGreaterThan(0);
    expect(data).toHaveLength(sent[0]!);
    const reaction = data.find((r) => r.gifs > 0)!;
    expect(reaction.top).not.toBeNull();
    expectUsable(reaction.top!);
    const tagged = await gf.tag(reaction.slug, { limit: 10 });
    expect(tagged.data.length).toBeGreaterThan(0);
    expect(tagged.data).toHaveLength(sent[1]!);
  });

  it("answers one GIF by its id, and not_found for one that is not there", async () => {
    const { gf } = client();
    const [listed] = (await gf.trending({ limit: 1 })).data;
    const { data } = await gf.gif(listed!.id);
    expect(data).toEqual(listed);
    const missing = await gf.gif("zzzzzzzzzz").catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(OhmagifError);
    expect(missing).toMatchObject({ status: 404, code: "not_found" });
  });

  it("refuses a request without a key, and one with a key it does not know", async () => {
    const bare = await fetch(`${baseURL}/api/v1/trending`);
    expect(bare.status).toBe(401);
    expect(await bare.json()).toMatchObject({ code: "key_required" });
    const unknown = new OhmagifFetch({ apiKey: `omg_${"0".repeat(32)}`, baseURL });
    await expect(unknown.trending()).rejects.toMatchObject({ status: 401, code: "invalid_key" });
  });

  it("serves the files it names", async () => {
    const { gf } = client();
    const [g] = (await gf.trending({ limit: 1 })).data;
    for (const f of [g!.files.tiny, g!.files.full, g!.files.poster]) {
      const res = await fetch(f.url);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe(f.type);
      await res.body?.cancel();
    }
  });
});
