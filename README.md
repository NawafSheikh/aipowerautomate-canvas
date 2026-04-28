# aipowerautomate-canvas

Claude Code marketplace for the **canvas-builder** plugin — generate, edit, and live-sync Power Apps canvas apps from natural-language prompts.

## Install

```bash
# 1. Add this marketplace
/plugin marketplace add NawafSheikh/aipowerautomate-canvas

# 2. Install the plugin
/plugin install canvas-builder@aipowerautomate-canvas
/reload-plugins

# 3. Open a Power Apps Studio session, enable coauthoring, copy the URL.

# 4. Run the configure skill (paste URL when asked)
/configure-canvas-builder

# 5. Restart Claude Code, resume with `claude --continue`.
```

## Prerequisites

- **Node.js 18+** — runs the canvas-builder MCP server
- **.NET 10 SDK** — required by the canvas authoring runtime
  ```bash
  winget install Microsoft.DotNet.SDK.10
  ```
- **Power Apps Studio with coauthoring** — open the app, enable Settings → Updates → Coauthoring, and keep the browser tab open during your Claude session

## Skills

- `/configure-canvas-builder` — registers the MCP server with your environment
- `/generate-canvas-app` — natural-language → full canvas app YAML
- `/edit-canvas-app` — targeted edits to an existing app

## MCP tools

| Tool | Purpose |
|------|---------|
| `list_controls` | Lists every available canvas control (offline, 121 entries) |
| `describe_control` | Full property schema for a specific control (offline) |
| `compile_canvas` | Validates `.pa.yaml` against the live authoring service |
| `sync_canvas` | Pulls current Studio state into a directory |
| `list_apis` / `describe_api` | Connectors |
| `list_data_sources` / `get_data_source_schema` | Bound data sources |
| `get_accessibility_errors` | Accessibility audit |
| `get_appchecker_errors` | App quality checks |
