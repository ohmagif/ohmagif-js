// Renders the coverage table for the CI step summary, for the frontend
// (vitest json-summary), the backend (Go coverage profile or cargo-llvm-cov's
// JSON export) and PHP (PHPUnit Clover).
//
// Both toolchains already print a table to the build log, which is the right
// shape for a log and the wrong one for a step summary: that file is rendered
// as Markdown, so aligned columns arrive as a single run-on paragraph and four
// leading spaces become a code block. One producer, two formatters - the test
// runner writes the log, this writes the summary.
//
// One script for every language so the tables cannot drift apart: the grouping,
// the weighting and the sort live in one place and each producer only has to
// hand over covered/total counts.
//
// Grouped by directory (frontend), package (Go) or crate and module (Rust)
// rather than by file:
// forty file rows is a wall, and "which area is thinnest" is the question a
// coverage table is read to answer. PHP follows the same rule, except when all
// the sources share one directory - see fromClover.
//
// Usage: node scripts/coverage-summary.mjs [report] >> "$GITHUB_STEP_SUMMARY"
//   coverage/coverage-summary.json  vitest, needs the json-summary reporter
//   coverage.out                    go test -coverprofile
//   coverage.json                   cargo llvm-cov --json
//   coverage.xml                    phpunit --coverage-clover

import { readFileSync } from "node:fs";

const report = process.argv[2] ?? "coverage/coverage-summary.json";

function read(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    process.stderr.write(
      `no coverage report at ${path} - run the tests with coverage first (${err.message})\n`,
    );
    process.exit(1);
  }
}

const KINDS = ["statements", "branches", "functions"];

/** The area a frontend file belongs to: its directory, relative to src. */
function areaOf(file) {
  const rel = file.replace(/^.*?\/src\//, "").replace(/^src\//, "");
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".";
  return dir === "." ? "src" : dir;
}

/** vitest's json-summary: per-file covered/total for each kind. */
function fromVitest(json) {
  const files = [];
  for (const [file, data] of Object.entries(json)) {
    if (file === "total") continue;
    const counts = {};
    for (const kind of KINDS) {
      if (data[kind]) counts[kind] = { ...data[kind] };
    }
    files.push({ area: areaOf(file), counts });
  }
  return { title: "Frontend coverage", files };
}

// A Go profile has no branch or function data, so those columns are left out
// rather than invented.
function fromGoProfile(text) {
  // Lines are "file:start,end numStatements hitCount"; the first is the mode.
  // A block appears once per package whose tests exercised it (-coverpkg), so
  // the highest hit count wins rather than the last one.
  const blocks = new Map();
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("mode:")) continue;
    const [block, statements, hits] = line.trim().split(/\s+/);
    if (hits === undefined || !block.includes(":")) continue;
    const seen = blocks.get(block);
    if (!seen || Number(hits) > seen.hits) {
      blocks.set(block, { statements: Number(statements), hits: Number(hits) });
    }
  }

  const mod = modulePath();
  const files = [];
  for (const [block, { statements, hits }] of blocks) {
    const pkg = block.slice(0, block.indexOf(":")).replace(/\/[^/]*$/, "");
    files.push({
      area: relativePkg(pkg, mod),
      counts: { statements: { covered: hits > 0 ? statements : 0, total: statements } },
    });
  }
  return { title: "Backend coverage", files };
}

/** The longest directory every path shares, so the absolute paths a CI
 *  checkout produces become readable labels. */
function commonDir(paths) {
  const dirs = paths.map((path) => path.split("/").slice(0, -1));
  let depth = 0;
  while (
    depth < dirs[0].length &&
    dirs.every((dir) => dir[depth] === dirs[0][depth])
  ) {
    depth++;
  }
  return dirs[0].slice(0, depth).join("/");
}

/** cargo-llvm-cov's JSON export (the `llvm-cov export` format). Lines stand in
 *  for statements, the column the other tables lead with. Branch counts are
 *  zero unless the toolchain records them, and then the column drops out.
 *
 *  The area is the crate and the module directory inside its `src`, so
 *  `crates/app-core/src/pipeline/phase.rs` counts towards `app-core/pipeline`. */
function fromLlvmCov(json) {
  const entries = json.data.flatMap((export_) => export_.files);
  const root = commonDir(entries.map((file) => file.filename));
  const fallback = root.split("/").filter((part) => part !== "src").pop();
  const files = entries.map((file) => {
    const dirs = file.filename
      .slice(root.length + 1)
      .split("/")
      .slice(0, -1)
      .filter((part) => part !== "src");
    const { lines, functions, branches } = file.summary;
    const counts = {
      statements: { covered: lines.covered, total: lines.count },
      functions: { covered: functions.covered, total: functions.count },
    };
    if (branches) counts.branches = { covered: branches.covered, total: branches.count };
    return { area: dirs.join("/") || fallback, counts };
  });
  return { title: "Backend coverage", files };
}

/** PHPUnit's Clover XML: one <file> per source file, each ending in the
 *  file-level <metrics> element (the ones before it belong to the classes).
 *  `conditionals` is only populated when the driver records branch coverage,
 *  so on xdebug that column drops out on its own.
 *
 *  A PHP file is one class, which is the module unit, so the area is the file -
 *  but only when the sources sit in a single directory. With several
 *  directories the frontend/Go rule wins and the directory is the area, which
 *  is what keeps a large report from turning into forty rows. */
function fromClover(text) {
  const parsed = [];
  for (const [, name, body] of text.matchAll(
    /<file name="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g,
  )) {
    const metrics = [...body.matchAll(/<metrics\b([^>]*)\/>/g)].pop();
    if (!metrics) continue;
    const attr = (key) => {
      const found = metrics[1].match(new RegExp(`\\b${key}="(\\d+)"`));
      return found ? Number(found[1]) : 0;
    };
    parsed.push({
      name,
      counts: {
        statements: {
          covered: attr("coveredstatements"),
          total: attr("statements"),
        },
        branches: {
          covered: attr("coveredconditionals"),
          total: attr("conditionals"),
        },
        functions: { covered: attr("coveredmethods"), total: attr("methods") },
      },
    });
  }

  const root = commonDir(parsed.map((file) => file.name));
  const relative = parsed.map((file) => file.name.slice(root.length + 1));
  const nested =
    new Set(relative.map((path) => path.split("/").slice(0, -1).join("/")))
      .size > 1;

  const files = parsed.map((file, index) => {
    const path = relative[index].replace(/\.php$/, "");
    if (!nested) return { area: path, counts: file.counts };
    const cut = path.lastIndexOf("/");
    return {
      area: cut === -1 ? root.split("/").pop() : path.slice(0, cut),
      counts: file.counts,
    };
  });
  return { title: "PHP coverage", files };
}

/** The module path, so packages read as `internal/web` and the root as `.`. */
function modulePath() {
  try {
    const line = readFileSync("go.mod", "utf8")
      .split("\n")
      .find((l) => l.startsWith("module "));
    return line ? line.slice("module ".length).trim() : "";
  } catch {
    return "";
  }
}

function relativePkg(pkg, mod) {
  if (!mod) return pkg;
  if (pkg === mod) return ".";
  return pkg.startsWith(`${mod}/`) ? pkg.slice(mod.length + 1) : pkg;
}

const pct = (covered, total) => (total === 0 ? 100 : (100 * covered) / total);
const show = (n) => `${n.toFixed(1)}%`;

function main() {
  const text = read(report);
  let result;
  if (report.endsWith(".json")) {
    const json = JSON.parse(text);
    result =
      json.type === "llvm.coverage.json.export" ? fromLlvmCov(json) : fromVitest(json);
  } else if (report.endsWith(".xml")) result = fromClover(text);
  else result = fromGoProfile(text);
  const { title, files } = result;

  // Totals per area, summed from the raw counts rather than by averaging the
  // per-file percentages - a one-line module would otherwise weigh as much as a
  // four-hundred-line page.
  const areas = new Map();
  const overall = {};
  for (const { area, counts } of files) {
    const acc = areas.get(area) ?? {};
    for (const [kind, { covered, total }] of Object.entries(counts)) {
      acc[kind] ??= { covered: 0, total: 0 };
      overall[kind] ??= { covered: 0, total: 0 };
      acc[kind].covered += covered;
      acc[kind].total += total;
      overall[kind].covered += covered;
      overall[kind].total += total;
    }
    areas.set(area, acc);
  }

  // Only the columns this producer actually measures: a kind no file reports
  // (Clover's conditionals without a branch-coverage driver) or that only some
  // files report would render as a column of 100% or crash the row below.
  const kinds = KINDS.filter(
    (kind) => overall[kind]?.total > 0 && files.every((file) => file.counts[kind]),
  );
  if (kinds.length === 0) {
    process.stdout.write(`### ${title}\n\nNo coverage data in ${report}.\n`);
    return;
  }

  const rows = [...areas.entries()]
    .map(([area, acc]) => ({
      area,
      pcts: kinds.map((kind) => pct(acc[kind].covered, acc[kind].total)),
      counted: `${acc.statements.covered}/${acc.statements.total}`,
    }))
    // Thinnest first, so the next place to write a test is the top row.
    .sort((a, b) => a.pcts[0] - b.pcts[0]);

  const out = [
    `### ${title} - ${show(pct(overall.statements.covered, overall.statements.total))}`,
    "",
    `| ${kinds.join(" | ")} | counted | area |`,
    `| ${kinds.map(() => "---:").join(" | ")} | ---: | :--- |`,
    ...rows.map(
      (r) => `| ${r.pcts.map(show).join(" | ")} | ${r.counted} | \`${r.area}\` |`,
    ),
    "",
  ];
  process.stdout.write(out.join("\n"));
}

main();
