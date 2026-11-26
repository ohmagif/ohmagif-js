# @ohmagif/js

[![CI](https://github.com/ohmagif/ohmagif-js/actions/workflows/ci.yml/badge.svg)](https://github.com/ohmagif/ohmagif-js/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/ohmagif/ohmagif-js/badge.svg?branch=main)](https://coveralls.io/github/ohmagif/ohmagif-js?branch=main)
[![npm: @ohmagif/js](https://img.shields.io/npm/v/@ohmagif/js?label=%40ohmagif%2Fjs&logo=npm)](https://www.npmjs.com/package/@ohmagif/js)
[![License](https://img.shields.io/github/license/ohmagif/ohmagif-js.svg)](LICENSE)

A client for the [ohmagif](https://ohmagif.com) API and a React GIF picker.
No dependencies, 6.3 kB gzipped. [Example](https://ohmagif.github.io/ohmagif-js/)

```sh
npm install @ohmagif/js
```

## Client

Every request needs an API key. Make one at
[ohmagif.com/account/keys](https://ohmagif.com/account/keys) and list the
sites it is for: other web pages are refused, apps and servers are not.

```ts
import { OhmagifFetch } from "@ohmagif/js";

const gf = new OhmagifFetch("omg_...");

await gf.search("side eye", { limit: 12, rating: "pg" });
await gf.trending({ offset: 12 });
await gf.tag("oops");
await gf.gif("eTxuLnWv7C");
await gf.reactions();
```

A file's address never changes and needs no key:
`fileURL("eTxuLnWv7C", "full")` is
`https://i.ohmagif.com/g/eTxuLnWv7C/full.avif`.

## React

React 18 or 19.

```tsx
import { gifLabel } from "@ohmagif/js";
import { Gif, GifFromId, Grid } from "@ohmagif/js/react";

<Grid
  fetchGifs={(offset, signal) => gf.trending({ offset, limit: 12, signal })}
  width={336}
  columns={2}
  noLink
  onGifClick={(gif) => send({ id: gif.id, width: gif.width, height: gif.height, alt: gifLabel(gif) })}
/>

<GifFromId id={m.id} size={{ width: m.width, height: m.height }} alt={m.alt} width={320} />

<Gif gif={gif} width={322} />
```

`GifFromId` draws a GIF from what a message keeps, without a request: the
whole file, its credit strip included, links to the GIF's page. `Gif` shows
a GIF from the API in the embed's card, its credit line under the frame.
`gifSize` is the room either takes before it loads. Colours follow the
page's `color-scheme`.

## Content-Security-Policy

```
img-src https://i.ohmagif.com;
connect-src https://ohmagif.com;
```

## Development

```sh
make install
make test
make example # OHMAGIF_API_KEY in .env
```

## Licence

MIT. The GIFs are not part of it: show each one with its creator's
credit, as the [API terms](https://ohmagif.com/api) ask.
