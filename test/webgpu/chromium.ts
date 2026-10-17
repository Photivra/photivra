// SPDX-License-Identifier: Apache-2.0
/**
 * Dependency-free headless Chromium driver for the WebGPU conformance suite (`npm run test:webgpu`).
 * Serves the repository over loopback (TypeScript transpiled per request, so the page runs the same
 * `src/` modules as Node) and talks to the browser over the Chrome DevTools Protocol.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize, resolve } from "node:path";
import ts from "typescript";

/**
 * Chromium flags that expose a WebGPU adapter in headless mode without a hardware GPU (SwiftShader's
 * Vulkan CPU implementation). With a real GPU, set PHOTIVRA_WEBGPU_FLAGS to override them.
 */
export const SWIFTSHADER_WEBGPU_FLAGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader",
  "--use-webgpu-adapter=swiftshader"];

/** PHOTIVRA_WEBGPU_BROWSER, then Playwright's pre-installed Chromium, then common system names. */
export function findChromium(): string | null {
  const explicit = process.env.PHOTIVRA_WEBGPU_BROWSER;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", join(process.env.HOME ?? "", ".cache/ms-playwright")].filter((v): v is string => !!v);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root).sort().reverse()) {
      for (const candidate of [join(root, entry, "chrome-linux", "chrome"), join(root, entry, "chrome-linux64", "chrome"),
        join(root, entry, "chrome-linux", "headless_shell")]) {
        if (entry.startsWith("chromium") && existsSync(candidate)) return candidate;
      }
    }
  }
  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function contentType(path: string): string {
  return path.endsWith(".js") ? "text/javascript" : path.endsWith(".html") ? "text/html" : "application/octet-stream";
}

/** Loopback server: `.js` requests for missing files are answered with the transpiled sibling `.ts`. */
function serve(root: string): Promise<{ server: Server; origin: string }> {
  const cache = new Map<string, string>();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>Photivra WebGPU conformance</title>");
      return;
    }
    const path = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!path.startsWith(root + "/") || !/^\/(src|test)\//u.test(url.pathname)) { response.writeHead(404).end(); return; }
    try {
      if (existsSync(path)) { response.writeHead(200, { "content-type": contentType(path) }).end(readFileSync(path)); return; }
      const source = path.replace(/\.js$/u, ".ts");
      if (!path.endsWith(".js") || !existsSync(source)) { response.writeHead(404).end(); return; }
      let code = cache.get(source);
      if (code === undefined) {
        code = ts.transpileModule(readFileSync(source, "utf8"), { fileName: source,
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText;
        cache.set(source, code);
      }
      response.writeHead(200, { "content-type": "text/javascript" }).end(code);
    } catch {
      response.writeHead(500).end();
    }
  });
  return new Promise((resolveServer) => server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    resolveServer({ server, origin: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` });
  }));
}

export interface BrowserPage {
  /** Evaluates an expression in the page, awaiting a returned promise; returns the JSON value. */
  evaluate<T>(expression: string): Promise<T>;
  close(): Promise<void>;
}

/** Launches headless Chromium on the loopback-served repository and opens its root page (a secure context). */
export async function openBrowserPage(binary: string, repositoryRoot: string): Promise<BrowserPage> {
  const root = resolve(repositoryRoot);
  const { server, origin } = await serve(root);
  const profile = mkdtempSync(join(tmpdir(), "photivra-webgpu-"));
  const flags = process.env.PHOTIVRA_WEBGPU_FLAGS ? process.env.PHOTIVRA_WEBGPU_FLAGS.split(/\s+/u).filter(Boolean) : SWIFTSHADER_WEBGPU_FLAGS;
  const child: ChildProcess = spawn(binary, ["--headless=new", "--no-sandbox", "--no-first-run", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, ...flags, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const cleanup = async (): Promise<void> => {
    child.kill("SIGKILL");
    await new Promise<void>((done) => server.close(() => done()));
    rmSync(profile, { recursive: true, force: true });
  };
  try {
    const endpoint = await new Promise<string>((resolveEndpoint, reject) => {
      let log = "";
      const timer = setTimeout(() => reject(new Error("Chromium did not expose a DevTools endpoint within 60 s.")), 60_000);
      child.stderr?.on("data", (chunk: Buffer) => {
        log += chunk.toString();
        const match = /DevTools listening on (ws:\/\/\S+)/u.exec(log);
        if (match) { clearTimeout(timer); resolveEndpoint(match[1]!); }
      });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Chromium exited before exposing DevTools.")); });
    });
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[];
    const target = targets.find((t) => t.type === "page");
    if (!target) throw new Error("Chromium exposed no page target.");
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((done, reject) => { socket.onopen = (): void => done(); socket.onerror = (): void => reject(new Error("DevTools socket failed.")); });
    let id = 0;
    const pending = new Map<number, (message: { result?: unknown; error?: { message: string } }) => void>();
    socket.onmessage = (event: MessageEvent): void => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } };
      if (message.id !== undefined) { pending.get(message.id)?.(message); pending.delete(message.id); }
    };
    const send = (method: string, params: object): Promise<{ result?: unknown; error?: { message: string } }> =>
      new Promise((done) => { const next = ++id; pending.set(next, done); socket.send(JSON.stringify({ id: next, method, params })); });
    await send("Page.enable", {});
    await send("Page.navigate", { url: origin + "/" });
    for (let attempt = 0; attempt < 100; attempt++) {
      const state = await send("Runtime.evaluate", { expression: "location.origin + ':' + document.readyState", returnByValue: true });
      if ((state.result as { result?: { value?: string } }).result?.value === `${origin}:complete`) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    return {
      async evaluate<T>(expression: string): Promise<T> {
        const reply = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        const result = reply.result as { result?: { value?: T }; exceptionDetails?: { exception?: { description?: string }; text?: string } } | undefined;
        if (reply.error) throw new Error(reply.error.message);
        if (result?.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Page evaluation failed.");
        return result?.result?.value as T;
      },
      async close(): Promise<void> { socket.close(); await cleanup(); }
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
