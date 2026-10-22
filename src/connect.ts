import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";

const SUPPORT = path.join(os.homedir(), "Library", "Application Support");

/** User-data folders where a Chromium browser writes DevToolsActivePort (macOS). */
export const CANDIDATE_DIRS = [
  process.env.GMAPS_CHROME_DIR, // override: export GMAPS_CHROME_DIR="/path/to/user data dir"
  path.join(SUPPORT, "Google", "Chrome"),
  path.join(SUPPORT, "Google", "Chrome Beta"),
  path.join(SUPPORT, "Google", "Chrome Dev"),
  path.join(SUPPORT, "Google", "Chrome Canary"),
  path.join(SUPPORT, "Chromium"),
  path.join(SUPPORT, "BraveSoftware", "Brave-Browser"),
  path.join(SUPPORT, "Microsoft Edge"),
  path.join(SUPPORT, "Arc", "User Data"),
].filter((d): d is string => !!d);

async function wsFromActivePortFile(): Promise<string> {
  const errors: string[] = [];
  for (const dir of CANDIDATE_DIRS) {
    const file = path.join(dir, "DevToolsActivePort");
    const raw = await fs.readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") errors.push(`  ${file}: ${e.code ?? e.message}`);
      return null;
    });
    if (!raw) continue;
    const [port, wsPath] = raw.trim().split(/\r?\n/);
    if (!port || !wsPath) continue;
    console.log(`Using ${file}`);
    return `ws://127.0.0.1:${port}${wsPath}`;
  }
  throw new Error(
    [
      "No readable DevToolsActivePort file found. Looked in:",
      ...CANDIDATE_DIRS.map((d) => `  ${d}`),
      ...(errors.length ? ["Read errors (not just 'missing'):", ...errors] : []),
      "Find yours with:",
      `  find ~/Library/Application\\ Support -maxdepth 4 -name DevToolsActivePort 2>/dev/null`,
      'then: export GMAPS_CHROME_DIR="<the folder containing it>"',
    ].join("\n"),
  );
}

/**
 * --cdp auto            → read the WebSocket endpoint from DevToolsActivePort (chrome://inspect toggle).
 *                         Doesn't touch the HTTP endpoints, which only 404 and can add extra Allow prompts.
 * --cdp http://…:9333   → normal HTTP discovery (dedicated profile launched with --remote-debugging-port).
 *                         Never falls back to the main Chrome: that's a different browser and account.
 * --cdp ws://…          → connect directly
 *
 * In main-Chrome mode, Chrome asks you to Allow each connection: click Allow in the browser.
 */
export async function connect(cdp: string): Promise<Browser> {
  connectedToOwnWindow = false;
  if (cdp === "auto") return chromium.connectOverCDP(await wsFromActivePortFile());
  if (cdp.startsWith("ws")) return chromium.connectOverCDP(cdp);
  await ensureWindow(cdp);
  const browser = await chromium.connectOverCDP(cdp, { timeout: 10_000 });
  connectedToOwnWindow = true;
  return browser;
}

/**
 * Closing the dedicated profile's last window doesn't quit Chrome on macOS, and a Chrome with no
 * page at all fails connectOverCDP ("Browser.setDownloadBehavior: Browser context management is
 * not supported"). Open a tab first when there's none.
 */
async function ensureWindow(cdp: string): Promise<void> {
  const base = cdp.replace(/\/+$/, "");
  const list = await fetch(`${base}/json/list`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!list?.ok) {
    throw new Error(`The maps-lists Chrome window isn't running at ${base}. Start it with \`maps-lists chrome\`.`);
  }
  const targets = (await list.json()) as { type: string }[];
  if (targets.some((t) => t.type === "page")) return;
  await fetch(`${base}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(5000) });
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * True after connect() reached the dedicated profile over HTTP discovery (`maps-lists chrome`):
 * a window that exists only for maps-lists, so its tabs are ours to use. False for the main Chrome
 * (the toggle's DevToolsActivePort), where the user's own tabs must never be touched.
 */
export let connectedToOwnWindow = false;
