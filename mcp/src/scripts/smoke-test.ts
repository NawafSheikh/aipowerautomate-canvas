#!/usr/bin/env node
/**
 * End-to-end smoke test. Spawns the canvas-builder MCP server (which itself
 * spawns the authoring runtime), then exercises:
 *   - tools/list             → should return our 5 declared tools
 *   - list_controls          → local catalog
 *   - describe_control       → local catalog (GroupContainer)
 *   - compile_canvas         → engine call against the live runtime
 *   - sync_canvas (skipped — would overwrite working files)
 *
 * Required env: CANVAS_ENVIRONMENT_ID, CANVAS_APP_ID, CANVAS_CLUSTER_CATEGORY
 */
import { spawn, ChildProcess } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

class McpClient {
  private buffer = "";
  private pending = new Map<number, (msg: JsonRpcResponse) => void>();
  private idCounter = 1;
  constructor(private child: ChildProcess) {
    child.stdout!.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      let nl = this.buffer.indexOf("\n");
      while (nl !== -1) {
        const line = this.buffer.slice(0, nl).trim();
        this.buffer = this.buffer.slice(nl + 1);
        if (line) {
          try {
            const msg = JSON.parse(line) as JsonRpcResponse;
            if (msg.id !== undefined && this.pending.has(msg.id as number)) {
              const cb = this.pending.get(msg.id as number)!;
              this.pending.delete(msg.id as number);
              cb(msg);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
        nl = this.buffer.indexOf("\n");
      }
    });
  }
  request(method: string, params: unknown): Promise<JsonRpcResponse> {
    const id = this.idCounter++;
    const req = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout ${method}`));
      }, 60_000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.child.stdin!.write(JSON.stringify(req) + "\n");
    });
  }
  notify(method: string, params?: unknown): void {
    this.child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
}

function pass(label: string): void {
  process.stdout.write(`  ✓ ${label}\n`);
}
function fail(label: string, detail: string): never {
  process.stdout.write(`  ✗ ${label}\n    ${detail}\n`);
  process.exit(1);
}

async function main() {
  if (!process.env.CANVAS_ENVIRONMENT_ID || !process.env.CANVAS_APP_ID) {
    process.stderr.write("Required env: CANVAS_ENVIRONMENT_ID, CANVAS_APP_ID\n");
    process.exit(1);
  }

  const serverPath = join(__dirname, "..", "index.js");
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const client = new McpClient(child);

  process.stdout.write("\nSmoke test — canvas-builder MCP\n");

  // 1. initialize
  const initResp = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.1.0" },
  });
  if (initResp.error) fail("initialize", JSON.stringify(initResp.error));
  pass("initialize");
  client.notify("notifications/initialized");

  // 2. tools/list
  const toolsResp = await client.request("tools/list", {});
  const tools = (toolsResp.result as { tools: { name: string }[] })?.tools ?? [];
  const toolNames = tools.map((t) => t.name).sort();
  const expected = [
    "compile_canvas",
    "describe_control",
    "list_controls",
    "sync_canvas",
  ];
  const missing = expected.filter((n) => !toolNames.includes(n));
  if (missing.length) fail("tools/list", `missing: ${missing.join(",")}`);
  pass(`tools/list (${toolNames.length} tools: ${toolNames.join(", ")})`);

  // 3. list_controls (local)
  const listResp = await client.request("tools/call", {
    name: "list_controls",
    arguments: {},
  });
  const listText =
    ((listResp.result as { content: { text: string }[] })?.content?.[0]?.text) ?? "";
  if (!listText.includes("Available Controls: 121")) {
    fail("list_controls", `expected 121 controls, got: ${listText.slice(0, 100)}`);
  }
  pass("list_controls (121 entries from local catalog)");

  // 4. describe_control (local)
  const descResp = await client.request("tools/call", {
    name: "describe_control",
    arguments: { controlName: "GroupContainer" },
  });
  const descText =
    ((descResp.result as { content: { text: string }[] })?.content?.[0]?.text) ?? "";
  if (!descText.includes("Variants") || !descText.includes("AutoLayout")) {
    fail("describe_control", `unexpected: ${descText.slice(0, 200)}`);
  }
  pass("describe_control GroupContainer (full schema, includes variants)");

  // 5. compile_canvas (engine call against live runtime)
  // dist/scripts → dist → canvas-builder-mcp → aipowerautomate → todo-list-app
  const compileDir = join(__dirname, "..", "..", "..", "todo-list-app");
  const compResp = await client.request("tools/call", {
    name: "compile_canvas",
    arguments: { directoryPath: compileDir },
  });
  const compText =
    ((compResp.result as { content: { text: string }[] })?.content?.[0]?.text) ?? "";
  if (!compText.includes("Validation")) {
    fail("compile_canvas", `unexpected: ${compText.slice(0, 200)}`);
  }
  pass(`compile_canvas (engine reachable — "${compText.split("\n")[0]}")`);

  process.stdout.write("\n  ALL PASS\n\n");
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`smoke fatal: ${err}\n`);
  process.exit(1);
});
