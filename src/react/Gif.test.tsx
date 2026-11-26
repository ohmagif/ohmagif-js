import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gif } from "../test/fixtures.js";
import { Gif } from "./Gif.js";

afterEach(cleanup);

const credit = (c: HTMLElement) => c.querySelector<HTMLElement>(".ohmagif-credit")!;
const frame = (c: HTMLElement) => c.querySelector<HTMLElement>(".ohmagif-frame")!;

describe("Gif", () => {
  it("is one link to the GIF's page, without giving away the page it is on", () => {
    const { container } = render(<Gif gif={gif(1)} width={322} />);
    const a = container.firstElementChild as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.className).toBe("ohmagif-gif ohmagif-card");
    expect(a.getAttribute("href")).toBe("https://ohmagif.com/g/title-g000000001");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(a.style.cursor).toBe("pointer");
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(screen.getByRole("link").textContent).toBe("GIF by @mira on ohmagif.com");
    expect(screen.getByRole("img", { name: "Description g000000001" })).toBe(frame(container));
  });

  it("is the frame in a card with the credit line under it, as the embed draws it", () => {
    const { container } = render(<Gif gif={gif(1)} width={322} className="mine" />);
    const card = container.firstElementChild as HTMLElement;
    expect(card.className).toBe("ohmagif-gif mine ohmagif-card");
    expect([card.style.width, card.style.maxWidth, card.style.borderWidth, card.style.borderStyle]).toEqual(["322px", "100%", "1px", "solid"]);
    // full.avif is 640 x 424, of which the bottom 24 px are the strip.
    expect(frame(container).style.aspectRatio).toBe("640 / 400");
    expect(frame(container).style.overflow).toBe("hidden");
    expect([credit(container).style.height, credit(container).style.padding, credit(container).style.fontSize]).toEqual(["28px", "6px 10px", "14px"]);
    expect(credit(container).style.whiteSpace).toBe("nowrap");
    expect(credit(container).style.textOverflow).toBe("ellipsis");
  });

  it("starts the credit line at the handle when narrow", () => {
    const { container } = render(<Gif gif={gif(1)} width={200} />);
    expect(credit(container).textContent).toBe("@mira on ohmagif.com");
    expect(credit(container).querySelector("span")!.textContent).toBe("@mira");
  });

  it("gives the picture the size it is shown at", () => {
    const { container } = render(<Gif gif={gif(1)} width={322} />);
    const img = container.querySelector("img")!;
    // 320 inside the card's border, the file 640 x 424 at that width.
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["320", "212"]);
    expect([img.style.width, img.style.height]).toEqual(["100%", "auto"]);
    expect(img.getAttribute("alt")).toBe("");
  });

  it("shows the AVIF, picked by density, over the poster", () => {
    const { container } = render(<Gif gif={gif(1)} width={202} />);
    const source = container.querySelector("source")!;
    expect(source.getAttribute("type")).toBe("image/avif");
    expect(source.getAttribute("srcset")).toBe(
      "https://i.ohmagif.com/g/g000000001/e130eaf5/tiny.avif 320w, https://i.ohmagif.com/g/g000000001/e130eaf5/full.avif 640w",
    );
    expect(source.getAttribute("sizes")).toBe("200px");
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://i.ohmagif.com/g/g000000001/e130eaf5/poster.jpg");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("offers only the full file when tiny is as wide", () => {
    const g = gif(1);
    const narrow = { ...g, files: { ...g.files, full: { ...g.files.full, width: 320 } } };
    const { container } = render(<Gif gif={narrow} width={322} lazyLoad={false} />);
    expect(container.querySelector("source")!.getAttribute("srcset")).toBe(g.files.full.url);
    expect(container.querySelector("source")!.hasAttribute("sizes")).toBe(false);
    expect(container.querySelector("img")!.hasAttribute("loading")).toBe(false);
  });

  it("makes the frame a button with noLink and a click handler, the credit line still a link", () => {
    const onGifClick = vi.fn();
    const { container } = render(<Gif gif={gif(1)} width={100} noLink onGifClick={onGifClick} />);
    expect(container.firstElementChild!.tagName).toBe("SPAN");
    const button = screen.getByRole("button", { name: "Description g000000001" });
    expect(button.getAttribute("type")).toBe("button");
    expect(button.style.cursor).toBe("pointer");
    fireEvent.click(button);
    expect(onGifClick).toHaveBeenCalledWith(expect.objectContaining({ id: "g000000001" }), expect.anything());
    expect(screen.getByRole("link").getAttribute("href")).toBe("https://ohmagif.com/g/title-g000000001");
  });

  it("is a frame and a credit line with noLink alone", () => {
    const { container } = render(<Gif gif={gif(1)} width={100} noLink />);
    expect(container.querySelector("button")).toBeNull();
    expect(frame(container).getAttribute("role")).toBe("img");
    expect(screen.getByRole("link").className).toBe("ohmagif-credit");
  });

  it("calls onGifClick on a link too", () => {
    const onGifClick = vi.fn((_, e: { preventDefault: () => void }) => e.preventDefault());
    render(<Gif gif={gif(1)} width={100} onGifClick={onGifClick} />);
    fireEvent.click(screen.getByRole("link"));
    expect(onGifClick).toHaveBeenCalledOnce();
  });

  it.each([
    ["a link", {}, "A"],
    ["a button", { noLink: true, onGifClick: () => {} }, "BUTTON"],
    ["a picture", { noLink: true }, "SPAN"],
  ])("is the frame alone with hideAttribution, as %s", (_, props, tag) => {
    const { container } = render(<Gif gif={gif(1)} width={320} hideAttribution {...props} />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe(tag);
    expect(el.className).toBe("ohmagif-gif ohmagif-frame");
    expect(el.getAttribute("aria-label")).toBe("Description g000000001");
    expect(el.style.aspectRatio).toBe("640 / 400");
    expect(el.style.width).toBe("320px");
    expect(container.querySelector(".ohmagif-credit")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("width")).toBe("320");
  });

  it("reports the file loading or failing", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    const { container } = render(<Gif gif={gif(1)} width={100} onLoad={onLoad} onError={onError} />);
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    fireEvent.error(img);
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});
