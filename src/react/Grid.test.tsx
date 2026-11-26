import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Activity, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Gif } from "../gif.js";
import { FakeIO, flush, gif, gifId } from "../test/fixtures.js";
import { Grid, type GridPage } from "./Grid.js";

/** The element the grid watches to know its end is near. */
const isEnd = (el: Element) => el.getAttribute("aria-hidden") === "true";

/** A fetchGifs over `total` GIFs, `size` a page, answering like OhmagifFetch. */
function server(total: number, size: number) {
  return vi.fn(async (offset: number, _signal: AbortSignal): Promise<GridPage> => {
    const data: Gif[] = [];
    for (let i = offset; i < Math.min(offset + size, total); i++) data.push(gif(i + 1));
    const next = offset + size < total ? offset + size : null;
    return { data, pagination: { total_count: total, count: data.length, offset, next } };
  });
}

function tiles(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".ohmagif-tile")];
}

beforeEach(() => FakeIO.install());
afterEach(cleanup);

describe("Grid paging", () => {
  it("loads pages while its end is near, and stops after the last", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = server(30, 12);
    const onGifsFetched = vi.fn();
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} onGifsFetched={onGifsFetched} />);
    await flush(10);
    expect(fetchGifs.mock.calls.map((c) => c[0])).toEqual([0, 12, 24]);
    expect(tiles(container)).toHaveLength(30);
    expect(onGifsFetched).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: gifId(30) })]));
    expect(onGifsFetched.mock.lastCall![0]).toHaveLength(30);
    expect(screen.queryByText("Loading")).toBeNull();
  });

  it("waits while its end is out of reach", async () => {
    let endNear = true;
    FakeIO.visible = (el) => isEnd(el) && endNear;
    const fetchGifs = server(100, 10);
    fetchGifs.mockImplementationOnce(async (offset) => {
      endNear = false;
      return server(100, 10)(offset, new AbortController().signal);
    });
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush();
    expect(fetchGifs).toHaveBeenCalledTimes(1);
    expect(tiles(container)).toHaveLength(10);
    endNear = true;
    await FakeIO.refresh();
    await flush();
    expect(fetchGifs.mock.calls[1]![0]).toBe(10);
  });

  it("pages by offset and count when a page has no next", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async (offset: number): Promise<GridPage> => {
      const data = offset < 6 ? [gif(offset + 1), gif(offset + 2), gif(offset + 3)] : [];
      return { data, pagination: { total_count: 50, count: data.length, offset } };
    });
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs.mock.calls.map((c) => c[0])).toEqual([0, 3, 6]);
    expect(tiles(container)).toHaveLength(6);
  });

  it("pages by the GIFs it got when the count says none", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async (offset: number): Promise<GridPage> => {
      const data = offset < 4 ? [gif(offset + 1), gif(offset + 2)] : [];
      return { data, pagination: { total_count: 50, count: 0, offset } };
    });
    render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("ends at an answer that is not a page", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async () => undefined as unknown as GridPage);
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs).toHaveBeenCalledTimes(1);
    expect(tiles(container)).toHaveLength(0);
    expect(screen.getByText("No GIFs found")).toBeTruthy();
  });

  it("stops at the total count", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async (offset: number): Promise<GridPage> => ({
      data: [gif(offset + 1), gif(offset + 2)],
      pagination: { total_count: 4, count: 2, offset },
    }));
    render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs.mock.calls.map((c) => c[0])).toEqual([0, 2]);
  });

  it("shows each GIF once when pages overlap", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async (offset: number): Promise<GridPage> =>
      offset === 0
        ? { data: [gif(1), gif(2)], pagination: { total_count: 9, count: 2, offset, next: 2 } }
        : { data: [gif(2), gif(3)], pagination: { total_count: 9, count: 2, offset, next: null } },
    );
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(tiles(container).map((t) => t.dataset.ohmagifId)).toEqual([gifId(1), gifId(2), gifId(3)]);
  });

  it("goes on past a page that brought nothing new", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = vi.fn(async (offset: number): Promise<GridPage> =>
      offset === 0
        ? { data: [], pagination: { total_count: 9, count: 0, offset, next: 3 } }
        : { data: [gif(4)], pagination: { total_count: 9, count: 1, offset, next: null } },
    );
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs.mock.calls.map((c) => c[0])).toEqual([0, 3]);
    expect(tiles(container)).toHaveLength(1);
  });

  it("loads once under StrictMode", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = server(5, 10);
    const { container } = render(
      <StrictMode>
        <Grid fetchGifs={fetchGifs} width={320} columns={2} />
      </StrictMode>,
    );
    await flush(10);
    expect(fetchGifs).toHaveBeenCalledTimes(1);
    expect(tiles(container)).toHaveLength(5);
  });

  it("aborts its request when it goes", async () => {
    FakeIO.visible = () => true;
    let signal: AbortSignal | undefined;
    let answer: (page: GridPage) => void = () => {};
    const fetchGifs = vi.fn((_: number, s: AbortSignal) => {
      signal = s;
      return new Promise<GridPage>((resolve) => (answer = resolve));
    });
    const onGifsFetched = vi.fn();
    const { unmount } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} onGifsFetched={onGifsFetched} />);
    await flush();
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => answer({ data: [gif(1)], pagination: { total_count: 1, count: 1, offset: 0, next: null } }));
    expect(onGifsFetched).not.toHaveBeenCalled();
  });

  it("says nothing of a page that failed after it went", async () => {
    FakeIO.visible = () => true;
    let fail: (err: unknown) => void = () => {};
    const fetchGifs = vi.fn(() => new Promise<GridPage>((_, reject) => (fail = reject)));
    const onGifsFetchError = vi.fn();
    const { unmount } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} onGifsFetchError={onGifsFetchError} />);
    await flush();
    unmount();
    await act(async () => fail(new DOMException("Aborted", "AbortError")));
    expect(onGifsFetchError).not.toHaveBeenCalled();
  });

  it("watches its tiles again when it shows again", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = server(3, 10);
    const grid = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <Grid fetchGifs={fetchGifs} width={320} columns={2} />
      </Activity>
    );
    const { container, rerender } = render(grid("visible"));
    await flush();
    expect(tiles(container)).toHaveLength(3);
    rerender(grid("hidden"));
    expect(FakeIO.all.at(-1)!.disconnected).toBe(true);
    rerender(grid("visible"));
    await flush();
    const io = FakeIO.all.at(-1)!;
    expect(io.disconnected).toBe(false);
    expect([...io.targets]).toEqual(expect.arrayContaining(tiles(container)));
    expect(container.querySelectorAll("img")).toHaveLength(3);
    expect(fetchGifs).toHaveBeenCalledTimes(1);
  });

  it("loads the first page only, with every picture, without IntersectionObserver", async () => {
    // @ts-expect-error an environment without it
    delete globalThis.IntersectionObserver;
    const fetchGifs = server(30, 12);
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush(10);
    expect(fetchGifs).toHaveBeenCalledTimes(1);
    expect(tiles(container)).toHaveLength(12);
    expect(container.querySelectorAll("img")).toHaveLength(12);
  });
});

describe("Grid states", () => {
  it("shows the loader while a page loads", async () => {
    FakeIO.visible = () => true;
    render(<Grid fetchGifs={() => new Promise(() => {})} width={320} columns={2} />);
    await flush();
    expect(screen.getByRole("status").textContent).toBe("Loading");
    cleanup();
    render(<Grid fetchGifs={() => new Promise(() => {})} width={320} columns={2} loader={() => <p>Wait</p>} />);
    await flush();
    expect(screen.getByText("Wait")).toBeTruthy();
  });

  it("says when there is nothing", async () => {
    FakeIO.visible = () => true;
    const empty = async (): Promise<GridPage> => ({ data: [], pagination: { total_count: 0, count: 0, offset: 0, next: null } });
    render(<Grid fetchGifs={empty} width={320} columns={2} />);
    await flush();
    expect(screen.getByText("No GIFs found")).toBeTruthy();
    cleanup();
    render(<Grid fetchGifs={empty} width={320} columns={2} noResultsMessage={<em>Nothing for that</em>} />);
    await flush();
    expect(screen.getByText("Nothing for that").tagName).toBe("EM");
  });

  it("offers the upload page when nothing matched", async () => {
    FakeIO.visible = () => true;
    const empty = async (): Promise<GridPage> => ({ data: [], pagination: { total_count: 0, count: 0, offset: 0, next: null } });
    render(<Grid fetchGifs={empty} width={320} columns={2} />);
    await flush();
    const upload = screen.getByRole("link", { name: "Upload to ohmagif" });
    expect(upload.getAttribute("href")).toBe("https://ohmagif.com/upload");
    expect(upload.getAttribute("target")).toBe("_blank");
    expect(upload.getAttribute("rel")).toBe("noopener noreferrer");
    expect(upload.style.cursor).toBe("pointer");
    expect(upload.closest(".ohmagif-end")!.textContent).toBe("No GIFs foundUpload to ohmagif");
  });

  it("offers the upload page after the last page, and not before", async () => {
    let endNear = true;
    FakeIO.visible = (el) => isEnd(el) && endNear;
    const fetchGifs = server(15, 10);
    fetchGifs.mockImplementationOnce(async (offset) => {
      endNear = false;
      return server(15, 10)(offset, new AbortController().signal);
    });
    render(<Grid fetchGifs={fetchGifs} width={320} columns={2} uploadURL="http://localhost:8080/upload" />);
    await flush();
    expect(screen.queryByRole("link", { name: "Upload to ohmagif" })).toBeNull();
    endNear = true;
    await FakeIO.refresh();
    await flush();
    expect(screen.getByRole("link", { name: "Upload to ohmagif" }).getAttribute("href")).toBe("http://localhost:8080/upload");
  });

  it.each([null, "javascript:alert(1)", "/upload"])("offers no upload page for %j", async (uploadURL) => {
    FakeIO.visible = () => true;
    const { container } = render(<Grid fetchGifs={server(2, 10)} width={320} columns={2} uploadURL={uploadURL} />);
    await flush();
    expect(screen.queryByText("Upload to ohmagif")).toBeNull();
    expect(container.querySelector(".ohmagif-end")).toBeNull();
  });

  it("offers Retry after a failed page", async () => {
    FakeIO.visible = () => true;
    const failure = new Error("down");
    const fetchGifs = server(3, 10);
    fetchGifs.mockRejectedValueOnce(failure);
    const onGifsFetchError = vi.fn();
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} onGifsFetchError={onGifsFetchError} />);
    await flush();
    expect(onGifsFetchError).toHaveBeenCalledWith(failure);
    expect(screen.getByRole("alert").textContent).toBe("GIFs did not loadRetry");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(fetchGifs).toHaveBeenCalledTimes(2);
    expect(tiles(container)).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a fetchGifs that throws like a failed page", async () => {
    FakeIO.visible = () => true;
    render(
      <Grid
        fetchGifs={() => {
          throw new Error("no");
        }}
        width={320}
        columns={2}
        errorMessage="Nope"
      />,
    );
    await flush();
    expect(screen.getByRole("alert").textContent).toBe("NopeRetry");
  });

  it("retries without IntersectionObserver", async () => {
    // @ts-expect-error an environment without it
    delete globalThis.IntersectionObserver;
    const fetchGifs = server(3, 10);
    fetchGifs.mockRejectedValueOnce(new Error("down"));
    const { container } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await flush();
    expect(tiles(container)).toHaveLength(3);
  });
});

describe("Grid tiles", () => {
  it("lays tiles out in columns, each a card sized before it loads", async () => {
    FakeIO.visible = () => true;
    const { container } = render(<Grid fetchGifs={server(3, 10)} width={320} columns={2} gutter={6} className="mine" />);
    await flush();
    const [a, b, c] = tiles(container);
    // Columns of 157 px. tiny.avif is 320 x 224, a frame of 320 x 200 over
    // the 24 px strip: 155 px inside the border, 96.875 high, then the
    // 18 px credit line and the border.
    expect([a!.style.left, a!.style.top, a!.style.width, a!.style.height]).toEqual(["0px", "0px", "157px", "116.875px"]);
    expect([b!.style.left, b!.style.top]).toEqual(["163px", "0px"]);
    expect([c!.style.left, c!.style.top]).toEqual(["0px", "122.875px"]);
    expect(a!.querySelector<HTMLElement>(".ohmagif-frame")!.style.aspectRatio).toBe("320 / 200");
    const img = a!.querySelector("img")!;
    expect([img.getAttribute("width"), img.getAttribute("height")]).toEqual(["155", "109"]);
    expect((container.firstElementChild as HTMLElement).className).toBe("ohmagif-grid mine");
  });

  it("lays out again for a new width without asking again", async () => {
    FakeIO.visible = () => true;
    const fetchGifs = server(3, 10);
    const { container, rerender } = render(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
    await flush();
    rerender(<Grid fetchGifs={fetchGifs} width={200} columns={1} />);
    await flush();
    expect(tiles(container)[1]!.style.top).not.toBe("0px");
    expect(tiles(container)[0]!.style.width).toBe("200px");
    expect(fetchGifs).toHaveBeenCalledTimes(1);
  });

  it("links tiles to their pages, named for those who cannot see them", async () => {
    FakeIO.visible = () => true;
    const { container } = render(<Grid fetchGifs={server(1, 10)} width={320} columns={2} />);
    await flush();
    const a = tiles(container)[0]!;
    expect(a.tagName).toBe("A");
    expect(a.getAttribute("href")).toBe("https://ohmagif.com/g/title-g000000001");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(a.querySelector("[role=img]")!.getAttribute("aria-label")).toBe("Description g000000001");
    expect(a.querySelector("img")!.getAttribute("alt")).toBe("");
    // One link per tile: the credit line inside it is text.
    expect(a.querySelectorAll("a")).toHaveLength(0);
    expect(a.querySelector(".ohmagif-credit")!.tagName).toBe("SPAN");
  });

  it("puts a short credit line under each tile, at any width", async () => {
    FakeIO.visible = () => true;
    for (const width of [320, 600]) {
      const { container } = render(<Grid fetchGifs={server(1, 10)} width={width} columns={2} />);
      await flush();
      const credit = container.querySelector<HTMLElement>(".ohmagif-credit")!;
      expect(credit.textContent).toBe("by @mira");
      expect(credit.querySelector("span")!.textContent).toBe("@mira");
      expect([credit.style.height, credit.style.padding, credit.style.fontSize, credit.style.lineHeight]).toEqual([
        "18px",
        "3px 6px",
        "10px",
        "12px",
      ]);
      cleanup();
    }
  });

  it("shows the whole file with hideAttribution, its credit strip showing", async () => {
    FakeIO.visible = () => true;
    const { container } = render(<Grid fetchGifs={server(1, 10)} width={320} columns={2} hideAttribution noLink />);
    await flush();
    const tile = tiles(container)[0]!;
    expect(tile.tagName).toBe("BUTTON");
    expect(tile.className).toBe("ohmagif-tile ohmagif-frame");
    // No card: the whole column is tiny.avif, strip included, 157 * 224 / 320 high.
    expect([tile.style.width, tile.style.height]).toEqual(["157px", "109.9px"]);
    expect(tile.querySelector("img")).not.toBeNull();
    expect(container.querySelector(".ohmagif-credit")).toBeNull();
  });

  it("makes the frame a button with noLink and hands the GIF to onGifClick", async () => {
    FakeIO.visible = () => true;
    const onGifClick = vi.fn();
    const { container } = render(<Grid fetchGifs={server(2, 10)} width={320} columns={2} noLink onGifClick={onGifClick} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Description g000000002" }));
    expect(onGifClick).toHaveBeenCalledWith(expect.objectContaining({ id: gifId(2) }), expect.anything());
    // The credit line still leads to the GIF's page.
    const credit = tiles(container)[1]!.querySelector("a")!;
    expect(credit.className).toBe("ohmagif-credit");
    expect(credit.getAttribute("href")).toBe("https://ohmagif.com/g/title-g000000002");
    expect(credit.getAttribute("target")).toBe("_blank");
  });

  it("holds pictures only for tiles near the screen", async () => {
    let shown = new Set([gifId(1)]);
    FakeIO.visible = (el) => isEnd(el) || shown.has((el as HTMLElement).dataset.ohmagifId ?? "");
    const { container } = render(<Grid fetchGifs={server(3, 10)} width={320} columns={2} />);
    await flush();
    const pictured = () => tiles(container).filter((t) => t.querySelector("img")).map((t) => t.dataset.ohmagifId);
    expect(pictured()).toEqual([gifId(1)]);
    const tile = tiles(container)[0]!;
    expect(tile.querySelector("source")!.getAttribute("srcset")).toBe("https://i.ohmagif.com/g/g000000001/tiny.avif");
    expect(tile.querySelector("img")!.getAttribute("src")).toBe("https://i.ohmagif.com/g/g000000001/poster.jpg");
    shown = new Set([gifId(2), gifId(3)]);
    await FakeIO.refresh();
    expect(pictured()).toEqual([gifId(2), gifId(3)]);
  });

  it("watches from the element it scrolls in, a screen ahead", async () => {
    render(
      <div style={{ overflowY: "auto", height: 300 }} data-testid="scroller">
        <div>
          <Grid fetchGifs={server(1, 10)} width={320} columns={2} />
        </div>
      </div>,
    );
    await flush();
    expect(FakeIO.all[0]!.options.root).toBe(screen.getByTestId("scroller"));
    expect(FakeIO.all[0]!.options.rootMargin).toBe("100% 0px");
  });

  it("watches from the page when nothing around it scrolls", async () => {
    render(<Grid fetchGifs={server(1, 10)} width={320} columns={2} />);
    await flush();
    expect(FakeIO.all[0]!.options.root).toBeNull();
  });
});
