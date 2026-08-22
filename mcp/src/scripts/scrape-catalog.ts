#!/usr/bin/env node
/**
 * One-shot scraper. Spawns the authoring runtime, calls list_controls,
 * then describe_control for each, and writes the aggregated schema to
 * src/data/catalog.json. Re-run whenever the runtime adds new controls.
 *
 * Required env: CANVAS_ENVIRONMENT_ID, CANVAS_APP_ID, CANVAS_CLUSTER_CATEGORY
 */
import { writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CanvasEngine } from "../engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

function extractText(result: unknown): string {
  const r = result as ToolResult | undefined;
  return r?.content?.[0]?.text ?? "";
}

function isFailureResult(result: unknown, text: string): boolean {
  if ((result as ToolResult | undefined)?.isError) return true;
  if (text.trim().length === 0) return true;
  if (text.includes("An error occurred invoking")) return true;
  if (text.includes("SessionId:")) return true;
  return false;
}

function parseControlNames(listText: string): string[] {
  return listText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).trim())
    .filter(Boolean);
}

async function main() {
  if (!process.env.CANVAS_ENVIRONMENT_ID || !process.env.CANVAS_APP_ID) {
    process.stderr.write(
      "Required env: CANVAS_ENVIRONMENT_ID, CANVAS_APP_ID, CANVAS_CLUSTER_CATEGORY\n",
    );
    process.exit(1);
  }

  const engine = new CanvasEngine();
  engine.start({
    CANVAS_ENVIRONMENT_ID: process.env.CANVAS_ENVIRONMENT_ID,
    CANVAS_APP_ID: process.env.CANVAS_APP_ID,
    CANVAS_CLUSTER_CATEGORY: process.env.CANVAS_CLUSTER_CATEGORY ?? "prod",
  });
  await engine.initialize();
  process.stderr.write("[scrape] engine initialized\n");

  const listResult = await engine.invoke("list_controls", {});
  const names = parseControlNames(extractText(listResult));
  process.stderr.write(`[scrape] ${names.length} controls discovered\n`);

  const catalog: { name: string; describe: string }[] = [];
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    try {
      const r = await engine.invoke("describe_control", { controlName: name });
      const text = extractText(r);
      if (isFailureResult(r, text)) {
        // The runtime answers a failed describe with an isError result rather
        // than an exception. Storing its text would put an error message, and
        // the session's SessionId and RequestId, into the published catalog.
        process.stderr.write(`[scrape] SKIP ${name}: runtime returned an error\n`);
        catalog.push({ name, describe: "" });
      } else {
        catalog.push({ name, describe: text });
        process.stderr.write(`[scrape] ${i + 1}/${names.length}  ${name}\n`);
      }
    } catch (err) {
      process.stderr.write(`[scrape] FAIL ${name}: ${(err as Error).message}\n`);
      catalog.push({ name, describe: "" });
    }
  }

  // __dirname at runtime is dist/scripts/. We write to src/data/ so the
  // checked-in source carries the catalog and `npm publish` ships it.
  const outPath = join(__dirname, "..", "..", "src", "data", "catalog.json");
  await writeFile(outPath, JSON.stringify(catalog, null, 2), "utf8");
  process.stderr.write(`[scrape] wrote ${outPath} (${catalog.length} entries)\n`);

  engine.stop();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`scrape fatal: ${err}\n`);
  process.exit(1);
});
