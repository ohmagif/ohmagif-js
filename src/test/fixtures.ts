import { act } from "@testing-library/react";
import { parseGif, type Gif } from "../gif.js";

/** A GIF id from a number: "g000000001". */
export function gifId(n: number): string {
  return `g${String(n).padStart(9, "0")}`;
}

/** A GIF as the API answers it, shaped like a real answer. */
export function apiGif(id: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  const media = `https://i.ohmagif.com/g/${id}`;
  return {
    id,
    title: `Title ${id}`,
    description: `Description ${id}`,
    url: `https://ohmagif.com/g/title-${id}`,
    embed_url: `https://ohmagif.com/embed/${id}`,
    embed_width: 348,
    embed_height: 236,
    created: "2013-01-30T08:10:21Z",
    width: 640,
    height: 424,
    duration: 2.089,
    rating: "g",
    tags: ["oops", "fail"],
    reaction: "oops",
    creator: { handle: "mira", name: "Mira Rautio", url: "https://ohmagif.com/@mira" },
    files: {
      full: { url: `${media}/full.avif`, type: "image/avif", width: 640, height: 424, bytes: 25503 },
      poster: { url: `${media}/poster.jpg`, type: "image/jpeg", width: 640, height: 424, bytes: 16468 },
      // tiny is full scaled to 320 wide, the 24 px strip kept: 320 x (200 + 24).
      tiny: { url: `${media}/tiny.avif`, type: "image/avif", width: 320, height: 224, bytes: 22771 },
    },
    ...over,
  };
}

/** A checked GIF, as the client hands them out. */
export function gif(n: number, over: Record<string, unknown> = {}): Gif {
  const g = parseGif(apiGif(gifId(n), over));
  if (!g) throw new Error("fixture does not parse");
  return g;
}

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

type Entry = { target: Element; isIntersecting: boolean };

/**
 * An IntersectionObserver whose answers the test decides: `visible` says
 * whether an element is in view. Like the real one, it reports each target
 * once soon after it is observed, and then only when told.
 */
export class FakeIO {
  static all: FakeIO[] = [];
  static visible: (el: Element) => boolean = () => false;
  readonly targets = new Set<Element>();
  disconnected = false;

  constructor(
    readonly callback: (entries: Entry[], io: FakeIO) => void,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIO.all.push(this);
  }

  observe(el: Element) {
    if (this.targets.has(el)) return;
    this.targets.add(el);
    queueMicrotask(() => {
      if (!this.disconnected && this.targets.has(el)) this.callback([{ target: el, isIntersecting: FakeIO.visible(el) }], this);
    });
  }

  unobserve(el: Element) {
    this.targets.delete(el);
  }

  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }

  takeRecords() {
    return [];
  }

  /** Reports every target as `visible` now has it. */
  static async refresh() {
    await act(async () => {
      for (const io of FakeIO.all) {
        if (io.disconnected) continue;
        io.callback([...io.targets].map((target) => ({ target, isIntersecting: FakeIO.visible(target) })), io);
      }
    });
  }

  static install() {
    FakeIO.all = [];
    FakeIO.visible = () => false;
    globalThis.IntersectionObserver = FakeIO as unknown as typeof IntersectionObserver;
  }
}

/** Lets pending promises and observer reports run. */
export async function flush(times = 5) {
  for (let i = 0; i < times; i++) await act(async () => {});
}
