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
import { join, normalize, resolve, sep } from "node:path";
import ts from "typescript";

/**
 * Chromium flags that expose a WebGPU adapter in headless mode without a hardware GPU (SwiftShader's
 * Vulkan CPU implementation). With a real GPU, set PHOTIVRA_WEBGPU_ADAPTER=hardware or PHOTIVRA_WEBGPU_FLAGS.
 */
export const SWIFTSHADER_WEBGPU_FLAGS = ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader",
  "--use-webgpu-adapter=swiftshader"];
/**
 * Starting flags for a hardware adapter (PHOTIVRA_WEBGPU_ADAPTER=hardware). WebGPU ships enabled in
 * Chrome on macOS and Windows; Linux needs Vulkan. Not verified in the development container, which has
 * no GPU: check the reported adapter, and override with PHOTIVRA_WEBGPU_FLAGS if needed.
 */
export function hardwareWebGpuFlags(platform: NodeJS.Platform = process.platform): string[] {
  return platform === "linux" ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist"]
    : ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];
}
/** PHOTIVRA_WEBGPU_FLAGS, else the hardware or SwiftShader defaults chosen by PHOTIVRA_WEBGPU_ADAPTER. */
export function webGpuFlags(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.PHOTIVRA_WEBGPU_FLAGS) return env.PHOTIVRA_WEBGPU_FLAGS.split(/\s+/u).filter(Boolean);
  return env.PHOTIVRA_WEBGPU_ADAPTER === "hardware" ? hardwareWebGpuFlags() : SWIFTSHADER_WEBGPU_FLAGS;
}

export interface WebGpuAdapterProbe { available: boolean; adapter?: { vendor: string; architecture: string; isFallbackAdapter: boolean } }
/** True for a fallback (software) adapter such as SwiftShader, whose numbers are not GPU results. */
export function isSoftwareAdapter(probe: WebGpuAdapterProbe): boolean {
  return probe.adapter?.isFallbackAdapter === true || /swiftshader/iu.test(probe.adapter?.architecture ?? "") || /swiftshader/iu.test(probe.adapter?.vendor ?? "");
}
/**
 * The suites' skip reason for an adapter probe, or null to run. With PHOTIVRA_WEBGPU_REQUIRE_HARDWARE=1 a
 * software adapter is a failure reason too, so a hardware conformance run never passes on SwiftShader.
 */
export function adapterSkipReason(probe: WebGpuAdapterProbe, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!probe.available) return "the browser exposes no WebGPU adapter (see docs/WEBGPU.md for flags)";
  if (env.PHOTIVRA_WEBGPU_REQUIRE_HARDWARE === "1" && isSoftwareAdapter(probe)) {
    return `a hardware adapter was required but the browser reported a software adapter (${JSON.stringify(probe.adapter)})`;
  }
  return null;
}

/** PHOTIVRA_WEBGPU_BROWSER, then Playwright's pre-installed Chromium, then common system locations (Linux, macOS, Windows). */
export function findChromium(): string | null {
  const explicit = process.env.PHOTIVRA_WEBGPU_BROWSER;
  if (explicit) return existsSync(explicit) ? explicit : null;
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  const roots = [process.env.PLAYWRIGHT_BROWSERS_PATH, "/opt/pw-browsers", join(home, ".cache/ms-playwright"), join(home, "Library/Caches/ms-playwright"),
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ms-playwright") : undefined].filter((v): v is string => !!v);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root).sort().reverse()) {
      for (const candidate of [join(root, entry, "chrome-linux", "chrome"), join(root, entry, "chrome-linux64", "chrome"),
        join(root, entry, "chrome-linux", "headless_shell"), join(root, entry, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        join(root, entry, "chrome-win", "chrome.exe")]) {
        if (entry.startsWith("chromium") && existsSync(candidate)) return candidate;
      }
    }
  }
  for (const candidate of ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"]) {
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
    if (!path.startsWith(root + sep) || !/^\/(src|test)\//u.test(url.pathname)) { response.writeHead(404).end(); return; }
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

export interface DevToolsTarget { type: string; webSocketDebuggerUrl: string }

/**
 * Polls the DevTools target list until it holds a page. Chromium prints "DevTools listening on" before its
 * first page (`about:blank`) is registered, so one query right after that line can see an empty list or
 * a refused connection; the first CI run of the suite hit this (#488).
 */
export async function awaitPageTarget(listTargets: () => Promise<DevToolsTarget[]>, attempts = 100,
  delayMilliseconds = 100, wait: (ms: number) => Promise<void> = (ms) => new Promise((done) => setTimeout(done, ms))):
  Promise<DevToolsTarget> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const target = (await listTargets()).find((t) => t.type === "page");
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await wait(delayMilliseconds);
  }
  throw new Error(`Chromium exposed no page target within ${attempts * delayMilliseconds} ms.`
    + (lastError instanceof Error ? ` Last error: ${lastError.message}` : ""));
}

/** Launches headless Chromium on the loopback-served repository and opens its root page (a secure context). */
export async function openBrowserPage(binary: string, repositoryRoot: string): Promise<BrowserPage> {
  const root = resolve(repositoryRoot);
  const { server, origin } = await serve(root);
  const profile = mkdtempSync(join(tmpdir(), "photivra-webgpu-"));
  const flags = webGpuFlags();
  // PHOTIVRA_WEBGPU_HEADLESS=0 opens a visible window, which exposes the hardware GPU on more platforms than headless mode.
  const headless = process.env.PHOTIVRA_WEBGPU_HEADLESS === "0" ? [] : ["--headless=new"];
  const child: ChildProcess = spawn(binary, [...headless, "--no-sandbox", "--no-first-run", "--remote-debugging-port=0",
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
    const target = await awaitPageTarget(async () =>
      (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Promise<DevToolsTarget[]>);
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
