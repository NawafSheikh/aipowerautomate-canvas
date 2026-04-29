# @nawafsheikh/canvas-builder-mcp

MCP server that powers the **canvas-builder** Claude Code plugin. Generates, edits, and live-syncs Power Apps canvas apps through Power Apps Studio's coauthoring session.

## Install

```bash
# Via the canvas-builder plugin (recommended)
/plugin marketplace add NawafSheikh/aipowerautomate-canvas
/plugin install canvas-builder@aipowerautomate-canvas
/configure-canvas-builder

# Or register the MCP directly
claude mcp add --scope user canvas-builder \
  -e CANVAS_ENVIRONMENT_ID=<your-env-id> \
  -e CANVAS_APP_ID=<your-app-id> \
  -e CANVAS_CLUSTER_CATEGORY=prod \
  -- npx -y @nawafsheikh/canvas-builder-mcp@latest
```

## Prerequisites

- **Node.js 18+**
- **.NET 10 SDK** — `winget install Microsoft.DotNet.SDK.10`
- **Power Apps Studio** with coauthoring enabled (Settings → Updates → Coauthoring) and the browser tab kept open

## Tools

| Tool | Description |
|------|-------------|
| `list_controls` | Lists all 121 available canvas controls (offline, from local catalog) |
| `describe_control` | Full property/enum schema for a control (offline) |
| `compile_canvas` | Validates `.pa.yaml` files against the live authoring service |
| `sync_canvas` | Pulls current Studio state into a directory |

## Environment

| Var | Purpose |
|-----|---------|
| `CANVAS_ENVIRONMENT_ID` | Power Platform environment GUID |
| `CANVAS_APP_ID` | Canvas app GUID |
| `CANVAS_CLUSTER_CATEGORY` | `prod` / `gov` / `high` / `dod` / `china` / `test` |

## License

MIT
