import { defineConfig, type Plugin } from "vite";

// Comments go until none is left, so no "<!--" pieced together from the
// remains of two others survives.
function withoutComments(html: string): string {
  let previous: string;
  do {
    previous = html;
    html = html.replace(/<!--[\s\S]*?-->/g, "");
  } while (html !== previous);
  return html;
}

// The served HTML is minified like the bundle: comments and the whitespace
// between tags go and the indented prose folds to single spaces, the sources
// stay readable. The page has no <pre> and no inline script, whose
// whitespace would matter.
function minifyHtml(): Plugin {
  return {
    name: "ohmagif-minify-html",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) =>
        withoutComments(html)
          .replace(/\s+/g, " ")
          .replace(/> </g, "><")
          .trim(),
    },
  };
}

export default defineConfig({
  // OHMAGIF_API_KEY from the environment, or from the repository's .env.
  envDir: "..",
  envPrefix: "OHMAGIF_",
  // Addresses relative to the page: the build is served from any path, a
  // pull request's preview under pr-preview/pr-<n>/ included.
  base: "./",
  // No React plugin: its refresh preamble is an inline script, which the
  // example's Content-Security-Policy refuses, as a strict site would.
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [minifyHtml()],
  build: {
    rolldownOptions: {
      // "use client" marks the components for frameworks that split server
      // and client code; a bundle of one page has no use for it.
      onLog(level, log, handler) {
        if (log.code !== "MODULE_LEVEL_DIRECTIVE") handler(level, log);
      },
    },
  },
});
