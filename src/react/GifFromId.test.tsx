import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GifFromId } from "./GifFromId.js";
import { gifSize } from "./layout.js";

const id = "eTxuLnWv7C";
const size = { width: 640, height: 424 };

describe("GifFromId", () => {
  it("is the whole file from the id and size alone, linking to the GIF's page", () => {
    const { container } = render(<GifFromId id={id} size={size} width={320} alt="A cat falls off a table" />);
    const a = container.firstElementChild as HTMLAnchorElement;
    expect(a.tagName).toBe("A");
    expect(a.href).toBe(`https://ohmagif.com/g/${id}`);
    expect([a.target, a.rel]).toEqual(["_blank", "noopener noreferrer"]);
    expect(a.className).toBe("ohmagif-gif ohmagif-frame");
    expect(a.getAttribute("aria-label")).toBe("A cat falls off a table");
    // full.avif's own shape: the credit strip along its bottom shows.
    expect(a.style.aspectRatio).toBe("640 / 424");
    expect(a.style.width).toBe("320px");
    expect(container.querySelector(".ohmagif-credit")).toBeNull();
    const source = container.querySelector("source")!;
    expect(source.getAttribute("srcset")).toBe(`https://i.ohmagif.com/g/${id}/tiny.avif 320w, https://i.ohmagif.com/g/${id}/full.avif 640w`);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(`https://i.ohmagif.com/g/${id}/poster.jpg`);
    expect([img.getAttribute("width"), img.getAttribute("height"), img.getAttribute("loading")]).toEqual(["320", "212", "lazy"]);
    // The room it takes is known before it loads.
    expect(gifSize(size, 320, { hideAttribution: true })).toEqual({ width: 320, height: 212 });
  });

  it("takes other sites, a class, and no link", () => {
    const { container } = render(
      <GifFromId id={id} size={{ width: 320, height: 240 }} width={200} noLink lazyLoad={false} className="msg" baseURL="http://localhost:8080" mediaURL="http://localhost:8080/media" />,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el.getAttribute("role")).toBe("img");
    expect(el.getAttribute("aria-label")).toBe("GIF");
    expect(el.className).toBe("ohmagif-gif msg ohmagif-frame");
    // full.avif is no wider than tiny.avif: one file.
    expect(container.querySelector("source")!.getAttribute("srcset")).toBe(`http://localhost:8080/media/g/${id}/full.avif`);
    expect(container.querySelector("img")!.hasAttribute("loading")).toBe(false);
  });

  it("reports the file loading or failing", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    const { container } = render(<GifFromId id={id} size={size} width={100} onLoad={onLoad} onError={onError} />);
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    fireEvent.error(img);
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  it.each([
    ["an id that is not one", "../x", size],
    ["no width", id, { width: 0, height: 424 }],
    ["no height", id, { width: 640, height: -1 }],
    ["a fractional size", id, { width: 640.5, height: 424 }],
  ])("is nothing for %s", (_, badId, badSize) => {
    const { container } = render(<GifFromId id={badId} size={badSize} width={100} />);
    expect(container.innerHTML).toBe("");
  });
});
