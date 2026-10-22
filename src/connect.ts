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
 * --cdp http://…:9333   → normal HTTP discovery (dedicated profile launched with --remote-debugging-port);
 *                         falls back to the file if discovery isn't served
 * --cdp ws://…          → connect directly
 *
 * In main-Chrome mode, Chrome asks you to Allow each connection: click Allow in the browser.
 */
export async function connect(cdp: string): Promise<Browser> {
  if (cdp === "auto") return chromium.connectOverCDP(await wsFromActivePortFile());
  if (cdp.startsWith("ws")) return chromium.connectOverCDP(cdp);
  try {
    return await chromium.connectOverCDP(cdp, { timeout: 10_000 });
  } catch (e) {
    const ws = await wsFromActivePortFile().catch(() => null);
    if (!ws) throw e;
    console.log("HTTP discovery unavailable; connecting via DevToolsActivePort instead.");
    return chromium.connectOverCDP(ws);
  }
}
