import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { CREDIT_STRIP_HEIGHT } from "../src/index.js";

const api = process.env.OHMAGIF_BASE_URL;
// The key the example was started or built with.
const key = process.env.OHMAGIF_API_KEY ?? "";
if (!key) throw new Error("OHMAGIF_API_KEY is not set: the example's ohmagif API key");
const site = api ?? "https://ohmagif.com";
const start = api ? `./?base=${encodeURIComponent(api)}` : "./";

// Every test fails on an error in the console, a refused Content-Security-
// Policy included, or an exception on the page.
const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("pageerror", (e) => errors.push(e.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

async function openPicker(page: Page): Promise<Locator> {
  await page.goto(start);
  await page.getByRole("button", { name: "GIF", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "GIFs" });
  await expect(picker.locator(".ohmagif-tile").first()).toBeVisible();
  return picker;
}

/**
 * For each loaded picture under `scope`: how much of it its frame cuts off,
 * and how tall the credit strip at its bottom is, both as shown.
 */
async function cuts(scope: Locator) {
  return scope.locator("img").evaluateAll(
    (imgs, height) =>
      (imgs as HTMLImageElement[])
        .filter((img) => img.complete && img.naturalWidth > 0)
        .map((img) => {
          const shown = img.getBoundingClientRect();
          const frame = img.closest(".ohmagif-frame")!;
          return {
            clipped: getComputedStyle(frame).overflowY === "hidden",
            cut: shown.height - frame.getBoundingClientRect().height,
            strip: (height * shown.width) / img.naturalWidth,
          };
        }),
    CREDIT_STRIP_HEIGHT,
  );
}

function expectStripHidden(found: { clipped: boolean; cut: number; strip: number }[]) {
  for (const { clipped, cut, strip } of found) {
    expect(clipped).toBe(true);
    expect(cut).toBeGreaterThanOrEqual(strip - 0.01);
    // At most a pixel of the picture goes with it.
    expect(cut).toBeLessThanOrEqual(strip + 1.5);
  }
}

test("the picker shows trending GIFs, the credit strip cut off", async ({ page }) => {
  const asked = page.waitForRequest((r) => r.method() === "GET" && new URL(r.url()).pathname.endsWith("/api/v1/trending"));
  const picker = await openPicker(page);
  // The key goes with the request, nothing of the page: no cookie, no address.
  const headers = await (await asked).allHeaders();
  expect(headers.authorization).toBe(`Bearer ${key}`);
  expect(headers.cookie).toBeUndefined();
  expect(headers.referer).toBeUndefined();

  const tiles = picker.locator(".ohmagif-tile");
  const credit = tiles.first().locator(".ohmagif-credit");
  await expect(credit).toHaveText(/^by @\S+$/);
  await expect(credit).toHaveCSS("font-size", "10px");
  await expect.poll(async () => (await cuts(tiles)).length).toBeGreaterThanOrEqual(4);
  expectStripHidden(await cuts(tiles));
  for (const img of await tiles.locator("img").all()) {
    await expect(img).toHaveAttribute("width", /^\d+$/);
    await expect(img).toHaveAttribute("height", /^\d+$/);
  }
});

test("scrolling the picker loads page after page, pictures only near the screen", async ({ page }) => {
  const offsets: number[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname.endsWith("/api/v1/trending")) offsets.push(Number(url.searchParams.get("offset")));
  });
  const picker = await openPicker(page);
  const scroller = picker.locator(".picker-scroll");
  await expect
    .poll(
      async () => {
        await scroller.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        return offsets.length;
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(4);
  expect(offsets.slice(0, 4)).toEqual([0, 12, 24, 36]);
  const tiles = await picker.locator(".ohmagif-tile").count();
  expect(tiles).toBeGreaterThanOrEqual(36);
  expect(await picker.locator(".ohmagif-tile img").count()).toBeLessThan(tiles);
});

test("a search without matches offers the upload page", async ({ page }) => {
  const picker = await openPicker(page);
  await picker.getByRole("textbox", { name: "Search GIFs" }).fill("zqxjvkwpfh");
  await expect(picker.getByText("No GIFs found")).toBeVisible();
  await expect(picker.locator(".ohmagif-tile")).toHaveCount(0);
  const upload = picker.getByRole("link", { name: "Upload to ohmagif" });
  await expect(upload).toHaveAttribute("href", `${site}/upload`);
  await expect(upload).toHaveAttribute("target", "_blank");
  await expect(upload).toHaveAttribute("rel", "noopener noreferrer");
});

test("a picked GIF is sent, and keeps the room it was given while it loads", async ({ page }) => {
  // The message asks for its GIF a second late, so its placeholder shows.
  await page.route(/\/api\/v1\/gifs\//, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.continue();
  });
  const picker = await openPicker(page);
  const tile = picker.locator(".ohmagif-tile").first();
  const id = await tile.getAttribute("data-ohmagif-id");
  await tile.locator(".ohmagif-frame").click();
  await expect(picker).toBeHidden();

  const message = page.getByRole("list", { name: "Messages" }).locator("li").last();
  await expect(message.locator("code")).toHaveText(`ohmagif:${id}`);
  const before = (await message.locator(".placeholder").boundingBox())!;
  const card = message.locator(".ohmagif-gif");
  await expect.poll(async () => (await cuts(card)).length).toBe(1);
  const after = (await card.boundingBox())!;
  expect(Math.abs(after.height - before.height)).toBeLessThan(0.5);
  expect(Math.abs(after.width - before.width)).toBeLessThan(0.5);
  expectStripHidden(await cuts(card));

  await expect(card).toHaveAttribute("href", new RegExp(`^${site}/g/[^/]*${id}$`));
  await expect(card).toHaveAttribute("target", "_blank");
  await expect(card.locator(".ohmagif-credit")).toHaveText(/^(GIF by )?@\S+ on ohmagif\.com$/);
  await expect(card.locator(".ohmagif-credit")).toHaveCSS("font-size", "12px");
});

test("draws the card in the embed's colours, light or dark", async ({ page }) => {
  const picker = await openPicker(page);
  const credit = picker.locator(".ohmagif-credit").first();
  const colours = () =>
    credit.evaluate((el) => [getComputedStyle(el).color, getComputedStyle(el.querySelector("span")!).color]);
  await page.emulateMedia({ colorScheme: "light" });
  expect(await colours()).toEqual(["rgb(111, 106, 98)", "rgb(47, 107, 18)"]);
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await colours()).toEqual(["rgb(167, 161, 150)", "rgb(184, 224, 122)"]);
});
