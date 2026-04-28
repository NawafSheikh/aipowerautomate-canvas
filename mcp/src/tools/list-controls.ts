import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CatalogEntry {
  name: string;
  describe: string;
}

let cache: CatalogEntry[] | null = null;

async function loadCatalog(): Promise<CatalogEntry[]> {
  if (cache) return cache;
  // dist/tools/ → ../../src/data/ at runtime; src/tools/ → ../data/ in dev.
  // Try both locations so the same code path works in both layouts.
  const candidates = [
    join(__dirname, "..", "..", "src", "data", "catalog.json"),
    join(__dirname, "..", "data", "catalog.json"),
  ];
  for (const path of candidates) {
    try {
      const text = await readFile(path, "utf8");
      cache = JSON.parse(text) as CatalogEntry[];
      return cache;
    } catch {
      continue;
    }
  }
  throw new Error(
    `catalog.json not found in any of: ${candidates.join(", ")}`,
  );
}

export async function listControls(): Promise<{
  content: { type: "text"; text: string }[];
}> {
  const catalog = await loadCatalog();
  const lines = [
    `Available Controls: ${catalog.length}`,
    "",
    ...catalog.map((c) => `  - ${c.name}`),
  ];
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

export async function describeControl(controlName: string): Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
}> {
  const catalog = await loadCatalog();
  const entry = catalog.find(
    (c) => c.name.toLowerCase() === controlName.toLowerCase(),
  );
  if (!entry) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Control '${controlName}' not found.`,
        },
      ],
    };
  }
  return {
    content: [{ type: "text", text: entry.describe }],
  };
}
