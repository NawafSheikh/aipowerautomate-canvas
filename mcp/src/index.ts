#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { CanvasEngine } from "./engine.js";
import { describeControl, listControls } from "./tools/list-controls.js";

const ENGINE_TOOLS = new Set([
  "compile_canvas",
  "sync_canvas",
  "list_apis",
  "describe_api",
  "list_data_sources",
  "get_data_source_schema",
  "get_accessibility_errors",
  "get_appchecker_errors",
]);

/**
 * Start the authoring runtime on first use, not at process start.
 *
 * The runtime is a .NET tool launched through `dnx`. Starting it eagerly meant
 * that a machine without the .NET 10 SDK never reached `server.connect()`, so
 * the whole MCP server looked dead to the client and even the two offline tools
 * (`list_controls`, `describe_control`) were unreachable. Deferring the start
 * keeps the server responsive and turns a missing runtime into an actionable
 * error on the one call that needs it.
 */
function createEngineStarter(engine: CanvasEngine): () => Promise<CanvasEngine> {
  let started: Promise<CanvasEngine> | null = null;
  return () => {
    if (started) return started;
    started = (async () => {
      engine.start({
        CANVAS_ENVIRONMENT_ID: process.env.CANVAS_ENVIRONMENT_ID ?? "",
        CANVAS_APP_ID: process.env.CANVAS_APP_ID ?? "",
        CANVAS_CLUSTER_CATEGORY: process.env.CANVAS_CLUSTER_CATEGORY ?? "prod",
      });
      await engine.initialize();
      return engine;
    })().catch((err) => {
      // Let the next call retry rather than caching a permanent failure.
      started = null;
      throw err;
    });
    return started;
  };
}

async function main() {
  const engine = new CanvasEngine();
  const ensureEngine = createEngineStarter(engine);

  const server = new Server(
    { name: "canvas-builder", version: "0.1.1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_controls",
        description: "List all canvas controls available in this catalog.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "describe_control",
        description: "Describe a specific canvas control's property schema.",
        inputSchema: {
          type: "object",
          properties: { controlName: { type: "string" } },
          required: ["controlName"],
        },
      },
      {
        name: "compile_canvas",
        description: "Validate canvas YAML files in a directory.",
        inputSchema: {
          type: "object",
          properties: { directoryPath: { type: "string" } },
          required: ["directoryPath"],
        },
      },
      {
        name: "sync_canvas",
        description: "Sync the current Studio state to a local directory.",
        inputSchema: {
          type: "object",
          properties: { directoryPath: { type: "string" } },
          required: ["directoryPath"],
        },
      },
      {
        name: "list_apis",
        description: "List all available APIs (connectors) in the current authoring session.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "describe_api",
        description: "Describe a specific API connector — operations, parameters, return types.",
        inputSchema: {
          type: "object",
          properties: { apiName: { type: "string" } },
          required: ["apiName"],
        },
      },
      {
        name: "list_data_sources",
        description: "List all data sources bound to the current canvas app.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_data_source_schema",
        description: "Get the schema (columns and Power Fx types) for a bound data source.",
        inputSchema: {
          type: "object",
          properties: { dataSourceName: { type: "string" } },
          required: ["dataSourceName"],
        },
      },
      {
        name: "get_accessibility_errors",
        description:
          "Check the current canvas app for accessibility issues — missing accessible text, screen names, etc.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_appchecker_errors",
        description:
          "Check the current canvas app for quality issues — performance, offline readiness, data source config errors.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "list_controls") return listControls();
    if (name === "describe_control") {
      return describeControl((args as { controlName: string }).controlName);
    }

    if (ENGINE_TOOLS.has(name)) {
      try {
        const live = await ensureEngine();
        const result = await live.invoke(name, (args ?? {}) as Record<string, unknown>);
        return result as { content: { type: "text"; text: string }[] };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{
            type: "text" as const,
            text:
              `'${name}' needs the Power Apps canvas authoring runtime, which could ` +
              `not be started: ${detail}

` +
              `It runs through 'dnx' from the .NET 10 SDK. Check 'dotnet --list-sdks' ` +
              `shows a 10.x entry, and that CANVAS_ENVIRONMENT_ID and CANVAS_APP_ID ` +
              `are set for a Studio session with coauthoring enabled and its tab open. ` +
              `The offline tools 'list_controls' and 'describe_control' work regardless.`,
          }],
        };
      }
    }

    return {
      isError: true,
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", () => {
    engine.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`canvas-builder fatal: ${err}\n`);
  process.exit(1);
});
