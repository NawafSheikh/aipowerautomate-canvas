import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";

// Authoring runtime package identifier.
const AUTHORING_RUNTIME_PACKAGE = "Microsoft.PowerApps.CanvasAuthoring.McpServer";

/**
 * The canvas authoring engine. Manages the JSON-RPC channel that powers
 * live compile and Studio sync. Each request gets a unique id; we track
 * id -> resolve so concurrent requests don't collide.
 */
export class CanvasEngine {
  private runtime: ChildProcessWithoutNullStreams | null = null;
  private buffer = "";
  private pending = new Map<number | string, (value: unknown) => void>();
  private idCounter = 1_000_000;

  start(env: NodeJS.ProcessEnv): void {
    if (this.runtime) return;

    const isWindows = process.platform === "win32";
    const command = isWindows ? "dnx.cmd" : "dnx";
    const args = [
      AUTHORING_RUNTIME_PACKAGE,
      "--yes",
      "--prerelease",
      "--source",
      "https://api.nuget.org/v3/index.json",
    ];

    // shell:true is required on Windows so the .cmd shim resolves on PATH.
    this.runtime = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
    });

    this.runtime.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    this.runtime.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[canvas-engine] ${chunk.toString()}`);
    });
    this.runtime.on("exit", (code) => {
      process.stderr.write(`[canvas-engine] runtime exited code=${code}\n`);
      this.runtime = null;
    });
  }

  private onStdout(chunk: Buffer): void {
    this.buffer += chunk.toString("utf8");
    let newlineIdx = this.buffer.indexOf("\n");
    while (newlineIdx !== -1) {
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line) this.dispatch(line);
      newlineIdx = this.buffer.indexOf("\n");
    }
  }

  private dispatch(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const resolve = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      resolve(msg);
    }
  }

  /**
   * Invoke an authoring engine tool by name. Caller passes the tool name
   * (e.g. "compile_canvas") and the arguments object.
   */
  async invoke(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.runtime) throw new Error("canvas engine runtime not started");

    const id = this.idCounter++;
    const request = {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`canvas engine timeout for tool '${toolName}'`));
      }, 60_000);

      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        const m = msg as any;
        if (m.error) reject(new Error(m.error.message ?? "engine error"));
        else resolve(m.result);
      });

      this.runtime!.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  async initialize(): Promise<void> {
    if (!this.runtime) throw new Error("runtime not started");
    const id = this.idCounter++;
    const request = {
      jsonrpc: "2.0",
      id,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "canvas-builder", version: "0.1.1" },
      },
    };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("canvas engine initialize timeout"));
      }, 30_000);
      this.pending.set(id, () => {
        clearTimeout(timer);
        resolve();
      });
      this.runtime!.stdin.write(JSON.stringify(request) + "\n");
    });

    this.runtime!.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
    );
  }

  stop(): void {
    if (this.runtime) {
      this.runtime.kill();
      this.runtime = null;
    }
  }
}
