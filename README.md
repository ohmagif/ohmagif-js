# ohmagif-js

A client for the [ohmagif](https://ohmagif.com) API and a React GIF grid, for
chats, editors and anything else that lets people pick a GIF. It replaces
`@giphy/js-fetch-api` and `@giphy/react-components` with the same shape of
API. [Try it in an example chat](https://ohmagif.github.io/ohmagif-js/).

- No dependencies. React 18 or 19 is a peer, and only `@ohmagif/js/react` needs it.
- 5.6 kB gzipped, client and components together. The Giphy packages are
  about 40 kB gzipped in the same app.
- No API key needed: the public API answers pages on any site.
- Requests carry no cookies and no referrer, and nothing reports what a person
  looked at or picked.
- Every API answer is checked before it reaches the page: GIF ids are checked
  before they go into a request, links and file addresses must be http or
  https, and a GIF that does not check out is dropped.
- No injected CSS, so a strict `Content-Security-Policy` needs no
  `'unsafe-inline'`.
- Each GIF is shown in the card ohmagif's embed draws: the frame, cut from
  the credit strip burned into the file, and a line under it, "GIF by
  @handle on ohmagif.com", that links to the GIF's page. A file that is
  saved or shared keeps its strip.
- Every GIF's size is known before a byte of it arrives (`gifSize`), so a
  chat can keep its room and nothing moves when it loads.
- Files are animated AVIF, with a JPEG first frame for browsers that cannot
  show AVIF.

## Install

```sh
npm install @ohmagif/js
```

## Client

```ts
import { OhmagifFetch } from "@ohmagif/js";

const gf = new OhmagifFetch();

const { data, pagination } = await gf.search("side eye", { limit: 12, rating: "pg" });
const trending = await gf.trending({ offset: 12, limit: 12 });
const tagged = await gf.tag("oops");
const { data: gif } = await gf.gif("eTxuLnWv7C");
const { data: reactions } = await gf.reactions();
```

| Method | Answers |
|---|---|
| `search(term, options?)` | GIFs matching the words, best match first |
| `trending(options?)` | The GIFs shared most over the last days |
| `tag(slug, options?)` | GIFs with a tag or reaction |
| `gif(id, { signal }?)` | One GIF |
| `reactions({ signal }?)` | The curated reactions, each with its top GIF |

List options: `offset` (0 to 1000), `limit` (1 to 50, default 25), `rating`
(`g`, `pg` or `pg13`, the highest to include) and `signal`. Lists answer
`{ data, pagination: { total_count, count, offset, next } }`; `next` is the
offset of the next page, `null` after the last.

Constructor options, all optional:

| Option | |
|---|---|
| `apiKey` | Raises the limit from 60 requests a minute per address to 600 for the key. Anyone using a page can read a key sent from it, and keyed answers are never cached, so a browser app is better off without one. A string alone is taken as the key. |
| `baseURL` | `https://ohmagif.com` by default |
| `timeout` | Milliseconds, 10000 by default; 0 waits forever |
| `fetch` | A `fetch` to use instead of the global one |

Failures reject with an `OhmagifError` carrying `status`, `code` and
`retryAfter` (seconds, after a 429). `code` is the API's own (`not_found`,
`removed`, `search_unavailable`, ...) or one of `invalid_id` (no request was
sent), `network`, `timeout` and `invalid_response`. A request aborted through
its `signal` rejects with the signal's reason. Arguments out of range reject
with a `RangeError` before anything is sent.

`gf.uploadURL` is the site's upload page.

Ask for a GIF again rather than keeping it for long: when a GIF is rendered
again its files get new addresses and the old ones go an hour later. Store the
id, not the file address, and `frameSize(gif)` to hold the GIF's room before
it loads.

Every file has a 24 px credit strip under its frame (`CREDIT_STRIP_HEIGHT`).
`width` and `height` include it; `frameSize(gif)` is the frame alone, in
whole pixels, as the components show it.

## React

```tsx
import { useCallback } from "react";
import { OhmagifFetch, type Gif as GifData } from "@ohmagif/js";
import { Gif, Grid } from "@ohmagif/js/react";

const gf = new OhmagifFetch();

function Picker({ term, onPick }: { term: string; onPick: (gif: GifData) => void }) {
  const fetchGifs = useCallback(
    (offset: number, signal: AbortSignal) => {
      const options = { offset, limit: 12, rating: "pg" as const, signal };
      return term ? gf.search(term, options) : gf.trending(options);
    },
    [term],
  );
  return (
    <Grid
      key={term}
      fetchGifs={fetchGifs}
      width={336}
      columns={2}
      noLink
      onGifClick={(gif) => onPick(gif)}
      uploadURL={gf.uploadURL}
    />
  );
}

function Message({ gif }: { gif: GifData }) {
  return <Gif gif={gif} width={322} />;
}
```

### `Grid`

GIFs in columns, each in its card, loading the next page as the end comes
near. It watches from the element it scrolls in, so it works inside a
popover. Only tiles within a screen of the visible area hold a picture, so a
long scroll costs no more to show than the first page. When nothing matched,
and after the last page, it offers "Upload to ohmagif". A new `key` starts it
again from the first page.

| Prop | |
|---|---|
| `fetchGifs(offset, signal)` | Required. Answers a page; the grid aborts `signal` when it unmounts |
| `width`, `columns` | Required. Width in CSS pixels |
| `gutter` | Space between GIFs, 6 by default |
| `noLink` | The frame is a button (to pick the GIF) rather than a link to the GIF's page; the credit line still links there |
| `hideAttribution` | The frame alone, without the card and its credit line |
| `onGifClick(gif, event)` | |
| `onGifsFetched(gifs)` | Every GIF the grid holds, after each page |
| `onGifsFetchError(error)` | |
| `noResultsMessage` | Shown when the first page is empty, "No GIFs found" by default |
| `uploadURL` | Where "Upload to ohmagif" leads, `https://ohmagif.com/upload` by default (`gf.uploadURL`); `null` offers nothing |
| `errorMessage` | Shown with a Retry button when a page did not load |
| `loader` | A component shown while a page loads |
| `className` | |

### `Gif`

One GIF in its card at a given width, never wider than its container. The
whole card links to the GIF's page. The browser picks `tiny.avif` or
`full.avif` by the screen's density.

| Prop | |
|---|---|
| `gif`, `width` | Required. Width of the card in CSS pixels |
| `noLink` | The frame does not link (a button when `onGifClick` is set); the credit line still does |
| `onGifClick(gif, event)` | |
| `hideAttribution` | The frame alone, without the card and its credit line |
| `lazyLoad` | Load the file only near the screen, on by default |
| `onLoad`, `onError` | `onError` usually means the address is out of date: ask for the GIF again |
| `className` | |

### Sizes

`gifSize(frame, width)` is the room a GIF takes at a width: the frame inside
the card's 1 px border, and the 28 px credit line. With the frame size kept in
a message, a chat reserves exactly that while it asks for the GIF:

```ts
const box = gifSize({ width: 346, height: 205 }, 348); // { width: 348, height: 235 }
```

Every `<img>` carries `width` and `height` attributes for the size it is shown
at, and every tile and card has its size before its file loads.

### Styling

Class names: `ohmagif-grid`, `ohmagif-tile`, `ohmagif-gif`, `ohmagif-card`,
`ohmagif-frame`, `ohmagif-credit`, `ohmagif-end`, `ohmagif-upload`,
`ohmagif-loading` and `ohmagif-error`.

Custom properties: `--ohmagif-card`, `--ohmagif-border`, `--ohmagif-muted`
(the credit line), `--ohmagif-link` (the handle and the buttons),
`--ohmagif-placeholder` (a GIF that has not loaded yet) and `--ohmagif-radius`.
By default the colours are the embed's, light or dark as the page's
`color-scheme` says. A page that switches to dark with a class says so:

```css
html.dark { color-scheme: dark; }
.ohmagif-frame:focus-visible, .ohmagif-credit:focus-visible { outline: 2px solid var(--accent); }
```

### Images, not iframes

Both components show the file itself in an `<img>`, so a GIF in a chat costs
one image request and nothing else runs in the page. An iframe embed is there
for pages that want one: `gif.embed_url` at `gif.embed_width` x
`gif.embed_height`, with `frame-src https://ohmagif.com` in the policy.

### Content-Security-Policy

```
img-src https://i.ohmagif.com;
connect-src https://ohmagif.com;
```

## Moving from Giphy

| Giphy | ohmagif |
|---|---|
| `import { GiphyFetch } from "@giphy/js-fetch-api"` | `import { OhmagifFetch } from "@ohmagif/js"` |
| `import { Grid, Gif } from "@giphy/react-components"` | `import { Grid, Gif } from "@ohmagif/js/react"` |
| `IGif` | `Gif` from `@ohmagif/js` |
| `new GiphyFetch(key)` | `new OhmagifFetch()` |
| `gif.images.original.width`, `.height` | `frameSize(gif).width`, `.height` |
| `gif.images.original_mp4.mp4` | `gif.files.full.url` (AVIF, shown by an `<img>`) |
| `rating: "pg-13"` | `rating: "pg13"` |
| `hideAttribution` | The frame alone, without the card and its credit line |
| "Powered by GIPHY" | Not needed: every GIF has its credit line, linked to its page |
| `fetchGifs(offset)` | `fetchGifs(offset, signal)`; pass `signal` on to cancel |

A grid in a picker, before and after:

```diff
-import { GiphyFetch } from "@giphy/js-fetch-api";
-import { Grid } from "@giphy/react-components";
-import type IGif from "@giphy/js-types/dist/gif";
+import { frameSize, OhmagifFetch, type Gif } from "@ohmagif/js";
+import { Grid } from "@ohmagif/js/react";

-const gf = new GiphyFetch(apiKey);
+const gf = new OhmagifFetch();

 const fetchGifs = useCallback(
-  (offset: number) => {
-    const options = { offset, limit: 12, rating: "pg" as const };
+  (offset: number, signal: AbortSignal) => {
+    const options = { offset, limit: 12, rating: "pg" as const, signal };
     return query ? gf.search(query, options) : gf.trending(options);
   },
   [query],
 );

-const onGifClick = (gif: IGif, e: React.SyntheticEvent) => {
-  e.preventDefault();
-  const { width, height } = gif.images.original;
-  onPick({ id: String(gif.id), title: gif.title, width, height });
-};
+const onGifClick = (gif: Gif) => {
+  onPick({ id: gif.id, title: gif.title, ...frameSize(gif) });
+};

-<Grid key={query} width={width} columns={2} gutter={6} fetchGifs={fetchGifs} onGifClick={onGifClick} noLink hideAttribution />
+<Grid key={query} width={width} columns={2} gutter={6} fetchGifs={fetchGifs} onGifClick={onGifClick} noLink uploadURL={gf.uploadURL} />
```

Keeping `hideAttribution` works too: the tiles then show the frame alone.

A GIF in a message, from its stored id:

```tsx
import { useEffect, useState } from "react";
import { OhmagifFetch, type Gif as GifData } from "@ohmagif/js";
import { Gif, gifSize } from "@ohmagif/js/react";

const gf = new OhmagifFetch();

/** `frame` is the frameSize(gif) kept with the message when it was picked. */
function GifMessage({ id, frame, width }: { id: string; frame: { width: number; height: number }; width: number }) {
  const [gif, setGif] = useState<GifData | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const ctrl = new AbortController();
    gf.gif(id, { signal: ctrl.signal }).then(
      ({ data }) => setGif(data),
      () => !ctrl.signal.aborted && setGone(true),
    );
    return () => ctrl.abort();
  }, [id]);
  // The same room before and after the GIF arrives.
  const box = gifSize(frame, width);
  if (gone) return <span style={box}>GIF unavailable</span>;
  return gif ? <Gif gif={gif} width={width} /> : <span style={{ display: "block", ...box }} />;
}
```

Also:

- Messages that hold a Giphy id cannot be shown from ohmagif. Store picks
  under a scheme of their own (`ohmagif:<id>`), and show the old ones as
  unavailable. `isGifId()` tells an ohmagif id apart.
- A key in workspace settings is no longer needed to turn GIFs on.
- Keep a fetched GIF for less than an hour, or ask again when its `<Gif>`
  reports `onError`.
- Keep `frameSize(gif)` with the message, not `gif.width` and `gif.height`,
  and size its placeholder with `gifSize()`.
- Drop `media.giphy.com`, `api.giphy.com` and their friends from the
  Content-Security-Policy and add the two lines above.

## Development

```sh
make install
make test
```

| Target | |
|---|---|
| `make install` | Install the dependencies |
| `make lint` | tsc |
| `make test` | vitest, gated at 100% coverage: every statement, branch, function and line |
| `make test-integration` | The client against the live API; `OHMAGIF_BASE_URL=http://localhost:8080` for a local ohmagif |
| `make build` | Build `dist/` |
| `make example` | A chat with a GIF picker against ohmagif.com on http://localhost:8082/; `?base=http://localhost:8080` for a local ohmagif |
| `make example-build` | Build the example into `examples/dist/` |
| `make e2e` | Playwright against the running example (`make example` first); `OHMAGIF_JS_E2E_URL` for another copy, a preview included |
| `make e2e-ci` | Build the example, serve it on :8083 and run Playwright against it |
| `make clean` | Remove build and test output |

`npx playwright install chromium` once before the first `make e2e`.

The pipeline runs every suite on each push and pull request, and weekly
against the live API. Each pull request from this repository gets its
example at `https://ohmagif.github.io/ohmagif-js/pr-preview/pr-<n>/`, linked
in a comment; main's is at https://ohmagif.github.io/ohmagif-js/. Pages
serves the `gh-pages` branch: Settings, Pages, Deploy from a branch,
`gh-pages`, `/ (root)`.

## Releasing

Set the version in `package.json`, merge, and tag the merge commit:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The pipeline runs every check, then publishes to npm with provenance. A
version with a hyphen (`0.2.0-rc.1`) goes out under the dist-tag `next`. A
tag that does not match `package.json` stops the release.

npm takes the package from this repository's `ci.yml` through trusted
publishing, without a token. `npm trust list @ohmagif/js` shows the
configuration.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
