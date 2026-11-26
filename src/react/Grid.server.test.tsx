// @vitest-environment node
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { Grid } from "./Grid.js";

it("renders on a server, empty, without asking for anything", () => {
  const fetchGifs = vi.fn();
  const html = renderToString(<Grid fetchGifs={fetchGifs} width={320} columns={2} />);
  expect(html).toContain('class="ohmagif-grid"');
  expect(html).not.toContain("ohmagif-tile");
  expect(fetchGifs).not.toHaveBeenCalled();
});
