# @ohmagif/js

A client for the [ohmagif](https://ohmagif.com) API and a React GIF picker.
No dependencies, 5.7 kB gzipped. [Example](https://ohmagif.github.io/ohmagif-js/)

```sh
npm install @ohmagif/js
```

## Client

```ts
import { OhmagifFetch } from "@ohmagif/js";

const gf = new OhmagifFetch();

await gf.search("side eye", { limit: 12, rating: "pg" });
await gf.trending({ offset: 12 });
await gf.tag("oops");
await gf.gif("eTxuLnWv7C");
await gf.reactions();
```

## React

React 18 or 19.

```tsx
import { frameSize } from "@ohmagif/js";
import { Gif, gifSize, Grid } from "@ohmagif/js/react";

<Grid
  fetchGifs={(offset, signal) => gf.trending({ offset, limit: 12, signal })}
  width={336}
  columns={2}
  noLink
  onGifClick={(gif) => send({ id: gif.id, ...frameSize(gif) })}
/>

<Gif gif={gif} width={322} />
```

Keep a GIF's id and `frameSize(gif)`, not its file address.
`gifSize(frame, width)` is the room it takes before it loads. Colours follow
the page's `color-scheme`.

## Content-Security-Policy

```
img-src https://i.ohmagif.com;
connect-src https://ohmagif.com;
```

## Development

```sh
make install
make test
make example
```

## Licence

GPL-3.0
