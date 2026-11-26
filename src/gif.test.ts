import { describe, expect, it } from "vitest";
import { fileURL, frameHeight, frameSize, gifLabel, gifURL, httpURL, isGifId, parseGif, tinyFrameSize } from "./gif.js";
import { apiGif, gif } from "./test/fixtures.js";

describe("isGifId", () => {
  it("takes 10 letters and digits only", () => {
    expect(isGifId("eTxuLnWv7C")).toBe(true);
    for (const bad of ["", "eTxuLnWv7", "eTxuLnWv7C1", "../gifs/xy", "eTxuLnWv7%", "eTxuLn-v7C", "eTxuLnWv7\n", 42, null]) {
      expect(isGifId(bad), String(bad)).toBe(false);
    }
  });
});

describe("fileURL and gifURL", () => {
  it("build a GIF's file and page from its id", () => {
    expect(fileURL("eTxuLnWv7C", "full")).toBe("https://i.ohmagif.com/g/eTxuLnWv7C/full.avif");
    expect(fileURL("eTxuLnWv7C", "tiny")).toBe("https://i.ohmagif.com/g/eTxuLnWv7C/tiny.avif");
    expect(fileURL("eTxuLnWv7C", "poster", "http://localhost:8080/media/")).toBe("http://localhost:8080/media/g/eTxuLnWv7C/poster.jpg");
    expect(gifURL("eTxuLnWv7C")).toBe("https://ohmagif.com/g/eTxuLnWv7C");
    expect(gifURL("eTxuLnWv7C", "http://localhost:8080")).toBe("http://localhost:8080/g/eTxuLnWv7C");
  });

  it("give nothing for an id that is not one", () => {
    for (const bad of ["", "../gifs/xy", "eTxuLnWv7%", 42, null]) {
      expect(fileURL(bad, "full"), String(bad)).toBeNull();
      expect(gifURL(bad), String(bad)).toBeNull();
    }
  });

  it("refuse a site that is not a plain http or https address", () => {
    expect(() => fileURL("eTxuLnWv7C", "full", "javascript:alert(1)")).toThrow("mediaURL must be http or https");
    expect(() => fileURL("eTxuLnWv7C", "full", "i.ohmagif.com")).toThrow("mediaURL is not an address");
    expect(() => gifURL("eTxuLnWv7C", "https://ohmagif.com/?x=1")).toThrow("baseURL takes no query, fragment or credentials");
  });
});

describe("httpURL", () => {
  it("keeps absolute http and https addresses", () => {
    expect(httpURL("https://i.ohmagif.com/g/x/full.avif")).toBe("https://i.ohmagif.com/g/x/full.avif");
    expect(httpURL("http://localhost:8080/media/x")).toBe("http://localhost:8080/media/x");
  });

  it("refuses every other scheme and anything that is not an address", () => {
    for (const bad of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:image/gif;base64,AA", "/g/x", "//evil.example/x", "blob:https://x/y", "", 1, undefined]) {
      expect(httpURL(bad), String(bad)).toBeNull();
    }
  });
});

describe("parseGif", () => {
  it("copies a complete GIF", () => {
    const g = parseGif(apiGif("eTxuLnWv7C"));
    expect(g).toMatchObject({
      id: "eTxuLnWv7C",
      url: "https://ohmagif.com/g/title-eTxuLnWv7C",
      width: 640,
      height: 424,
      rating: "g",
      reaction: "oops",
      creator: { handle: "mira", name: "Mira Rautio" },
    });
    expect(g?.files.tiny).toEqual({ url: "https://i.ohmagif.com/g/eTxuLnWv7C/tiny.avif", type: "image/avif", width: 320, height: 224, bytes: 22771 });
  });

  it("keeps only the fields it knows", () => {
    const text = JSON.stringify(apiGif("eTxuLnWv7C", { extra: "<script>", creator: { handle: "mira", url: "https://ohmagif.com/@mira", email: "x" } }));
    // A "__proto__" key first in the answer's own object.
    const g = parseGif(JSON.parse(`{"__proto__":{"polluted":true},${text.slice(1)}`));
    expect(g).not.toHaveProperty("extra");
    expect(Object.getPrototypeOf(g)).toBe(Object.prototype);
    expect(g?.creator).toEqual({ handle: "mira", name: "mira", url: "https://ohmagif.com/@mira" });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("fills what an answer may leave out", () => {
    const g = parseGif(apiGif("eTxuLnWv7C", { title: null, description: 7, tags: ["a", 1, null, "b"], reaction: null, duration: -1, embed_width: 0, created: undefined }));
    expect(g).toMatchObject({ title: "", description: "", tags: ["a", "b"], reaction: null, duration: 0, embed_width: 640, created: "" });
  });

  it("fills the embed height, the tags and a file's bytes when they are missing", () => {
    const raw = apiGif("eTxuLnWv7C", { tags: "oops", embed_height: undefined });
    delete (raw.files as Record<string, Record<string, unknown>>).full!.bytes;
    expect(parseGif(raw)).toMatchObject({ tags: [], embed_height: 424, files: { full: { bytes: 0 } } });
  });

  it.each([
    ["no object", null],
    ["an array", []],
    ["a bad id", apiGif("../../x")],
    ["a script link", apiGif("eTxuLnWv7C", { url: "javascript:alert(1)" })],
    ["a bad embed link", apiGif("eTxuLnWv7C", { embed_url: "data:text/html,x" })],
    ["a creator without a link", apiGif("eTxuLnWv7C", { creator: { handle: "mira" } })],
    ["a creator without a handle", apiGif("eTxuLnWv7C", { creator: { handle: "", url: "https://ohmagif.com/@x" } })],
    ["no files", apiGif("eTxuLnWv7C", { files: null })],
    ["a file on another scheme", apiGif("eTxuLnWv7C", { files: { ...(apiGif("eTxuLnWv7C").files as object), tiny: { url: "javascript:x", type: "image/avif", width: 1, height: 1 } } })],
    ["a file without a size", apiGif("eTxuLnWv7C", { files: { ...(apiGif("eTxuLnWv7C").files as object), full: { url: "https://i.ohmagif.com/x", type: "image/avif", width: 0, height: 1 } } })],
    ["a file without a type", apiGif("eTxuLnWv7C", { files: { ...(apiGif("eTxuLnWv7C").files as object), poster: { url: "https://i.ohmagif.com/x", width: 1, height: 1 } } })],
    ["a file that is not an object", apiGif("eTxuLnWv7C", { files: { ...(apiGif("eTxuLnWv7C").files as object), poster: "x" } })],
    ["a fractional size", apiGif("eTxuLnWv7C", { width: 1.5 })],
    ["no height", apiGif("eTxuLnWv7C", { height: undefined })],
    ["an unknown rating", apiGif("eTxuLnWv7C", { rating: "r" })],
  ])("drops a GIF with %s", (_, raw) => {
    expect(parseGif(raw)).toBeNull();
  });
});

describe("gifLabel", () => {
  it("prefers the description, then the title", () => {
    expect(gifLabel(gif(1))).toBe("Description g000000001");
    expect(gifLabel(gif(1, { description: "" }))).toBe("Title g000000001");
    expect(gifLabel(gif(1, { description: "", title: "" }))).toBe("GIF");
  });
});

describe("frameSize", () => {
  it("is the full file without its credit strip", () => {
    expect(frameSize(gif(1))).toEqual({ width: 640, height: 400 });
    expect(tinyFrameSize(gif(1))).toEqual({ width: 320, height: 200 });
  });

  it("takes the shorter frame when tiny and full round apart", () => {
    // The live GIF eTxuLnWv7C: full 346 x 230 (frame 206), tiny 320 x 214
    // (frame 190, which is 205.4 at 346 wide).
    const g = gif(1);
    const live = {
      ...g,
      files: { ...g.files, full: { ...g.files.full, width: 346, height: 230 }, tiny: { ...g.files.tiny, width: 320, height: 214 } },
    };
    expect(frameSize(live)).toEqual({ width: 346, height: 205 });
    const otherWay = { ...live, files: { ...live.files, tiny: { ...live.files.tiny, height: 216 } } };
    expect(frameSize(otherWay)).toEqual({ width: 346, height: 206 });
  });

  it("leaves a file too short for a strip as it is", () => {
    expect(frameHeight({ url: "https://i.ohmagif.com/x", type: "image/avif", width: 40, height: 20, bytes: 1 })).toBe(20);
  });
});
