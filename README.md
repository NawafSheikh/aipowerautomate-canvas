# aipowerautomate-canvas

A Claude Code plugin marketplace hosting **canvas-builder**: skills, agents, and an
MCP server that generate, edit, and live-sync Power Apps canvas apps from
natural-language prompts.

This repository holds two things:

| Path | What it is |
|------|------------|
| `plugins/canvas-builder/` | The Claude Code plugin: skills, agents, reference guides |
| `mcp/` | [`@nawafsheikh/canvas-builder-mcp`](https://www.npmjs.com/package/@nawafsheikh/canvas-builder-mcp), the MCP server the plugin talks to |

## Attribution

The plugin content in `plugins/canvas-builder/` is derived from the MIT-licensed
[microsoft/power-platform-skills](https://github.com/microsoft/power-platform-skills)
project, specifically its `plugins/canvas-apps` plugin. The Microsoft copyright
notice is retained in [LICENSE](LICENSE) as MIT requires.

The MCP server in `mcp/` is a thin stdio proxy. Two tools (`list_controls`,
`describe_control`) are answered locally from a bundled control catalog; the other
eight are forwarded to Microsoft's
[`Microsoft.PowerApps.CanvasAuthoring.McpServer`](https://www.nuget.org/packages/Microsoft.PowerApps.CanvasAuthoring.McpServer),
which it launches through `dnx` and does not redistribute.

If you want the first-party experience, use Microsoft's plugin directly:

```bash
/plugin marketplace add microsoft/power-platform-skills
/plugin install canvas-apps@power-platform-skills
```

## Install

```bash
# 1. Add this marketplace
/plugin marketplace add NawafSheikh/aipowerautomate-canvas

# 2. Install the plugin
/plugin install canvas-builder@aipowerautomate-canvas
/reload-plugins

# 3. Open a Power Apps Studio session, enable coauthoring, copy the URL.

# 4. Run the configure skill (paste the URL when asked)
/configure-canvas-builder

# 5. Restart Claude Code, resume with `claude --continue`.
```

Or register the MCP server on its own:

```bash
claude mcp add --scope user canvas-builder \
  -e CANVAS_ENVIRONMENT_ID=<your-env-id> \
  -e CANVAS_APP_ID=<your-app-id> \
  -e CANVAS_CLUSTER_CATEGORY=prod \
  -- npx -y @nawafsheikh/canvas-builder-mcp@latest
```

## Prerequisites

- **Node.js 18+** — runs the canvas-builder MCP server
- **.NET 10 SDK** — provides `dnx`, which launches the authoring runtime
  ```bash
  winget install Microsoft.DotNet.SDK.10
  ```
- **Power Apps Studio with coauthoring** — open the app, enable
  Settings > Updates > Coauthoring, and keep the browser tab open for the whole
  session. Closing the tab ends the coauthoring session, and `compile_canvas` and
  `sync_canvas` stop working.

Only the eight live tools need .NET and a Studio session. The server starts, and
`list_controls` and `describe_control` answer, with neither present.

## Skills

- `/configure-canvas-builder` — registers the MCP server with your environment
- `/generate-canvas-app` — natural language to a full canvas app YAML
- `/edit-canvas-app` — targeted edits to an existing app
- `/add-data-source` — bind a connector or data source to the app
- `/report-issue` — file a structured issue

## MCP tools

| Tool | Purpose | Needs runtime |
|------|---------|---------------|
| `list_controls` | Lists every available canvas control (121 entries) | no |
| `describe_control` | Full property schema for a specific control | no |
| `compile_canvas` | Validates `.pa.yaml` against the live authoring service | yes |
| `sync_canvas` | Pulls current Studio state into a directory | yes |
| `list_apis` / `describe_api` | Connectors | yes |
| `list_data_sources` / `get_data_source_schema` | Bound data sources | yes |
| `get_accessibility_errors` | Accessibility audit | yes |
| `get_appchecker_errors` | App quality checks | yes |

## Privacy

Your environment id, app id, and tenant identifiers never belong in this
repository. `/configure-canvas-builder` reads them from your Studio URL at run time
and writes them only into your local MCP config. Every example id in the
documentation is an all-zero or all-one placeholder.

## Development

```bash
cd mcp
npm ci
npm run build
npm pack --dry-run
```

## License

MIT. See [LICENSE](LICENSE), which carries both Microsoft's copyright for the
derived plugin content and the modification copyright.
