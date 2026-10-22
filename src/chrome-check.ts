import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { CANDIDATE_DIRS } from "./connect.js";

/**
 * Can the executor reach Chrome, and if not, why? Prints one JSON line for maps-lists:run. Reads
 * DevToolsActivePort only to see whether it can, and never prints it (it grants control of Chrome).
 *
 *   maps-lists check-chrome                   # status for the remembered mode (default: main)
 *   maps-lists check-chrome --set separate    # remember the mode in config.json, then check
 *
 * Modes: "main" = the user's own Chrome via the chrome://inspect toggle (--cdp auto, needs Full Disk
 * Access for whatever macOS holds responsible); "separate" = the dedicated profile from
 * `maps-lists chrome` on 127.0.0.1:9222 (HTTP discovery, no Full Disk Access).
 */

export type Mode = "main" | "separate";
export type Status = "ready" | "debugging-off" | "no-access" | "not-running";
/** Who macOS checks Full Disk Access against when Claude's commands read files. */
export type Host = {
  kind: "terminal" | "desktop" | "editor" | "unknown";
  /** Display name to look for in System Settings → Full Disk Access. */
  app?: string;
  /** The .app bundle to add with + when it isn't listed. */
  appPath?: string;
};

const DESKTOP_CLAUDE_CODE = "/Application Support/Claude/claude-code/";
const appOf = (p: string) => p.match(/^(.*?\.app)(\/|$)/)?.[1];

/**
 * The Claude desktop app runs its own Claude Code copy (…/Application Support/Claude/claude-code/
 * <version>/…/claude.app), and macOS checks Full Disk Access against that copy, not Claude.app.
 * Otherwise it's the outermost app among the ancestors: the terminal (Ghostty, iTerm, Terminal).
 */
export function hostFrom(execPath: string | undefined, ancestors: string[], termProgram: string | undefined): Host {
  const desktop = [execPath ?? "", ...ancestors].find((p) => p.includes(DESKTOP_CLAUDE_CODE));
  if (desktop) return { kind: "desktop", app: "claude (Claude Code inside the Claude app)", appPath: appOf(desktop) };
  if (termProgram === "vscode" || ancestors.some((p) => /Visual Studio Code|Cursor|Windsurf/.test(p))) {
    return { kind: "editor", app: "your editor" };
  }
  const outer = [...ancestors].reverse().map(appOf).find(Boolean);
  if (outer) return { kind: "terminal", app: path.basename(outer, ".app"), appPath: outer };
  return { kind: "unknown" };
}

/** Executable paths from this process up to launchd. */
function ancestry(): string[] {
  const out: string[] = [];
  let pid = process.ppid;
  for (let i = 0; i < 20 && pid > 1; i++) {
    const line = execFileSync("ps", ["-o", "ppid=,comm=", "-p", String(pid)], { encoding: "utf8" }).trim();
    const m = line.match(/^(\d+)\s+(.*)$/);
    if (!m) break;
    out.push(m[2]!);
    pid = Number(m[1]);
  }
  return out;
}

/** main mode: readable file → ready; EPERM/EACCES anywhere → no-access; no file → debugging-off. */
export async function checkMain(dirs: string[]): Promise<Status> {
  let denied = false;
  for (const dir of dirs) {
    const ok = await fs.readFile(path.join(dir, "DevToolsActivePort"), "utf8").then(
      (raw) => raw.trim().split(/\r?\n/).length >= 2,
      (e: NodeJS.ErrnoException) => {
        if (e.code === "EPERM" || e.code === "EACCES") denied = true;
        return false;
      },
    );
    if (ok) return "ready";
  }
  return denied ? "no-access" : "debugging-off";
}

export async function checkSeparate(port = process.env.CDP_PORT ?? "9222"): Promise<Status> {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  return res?.ok ? "ready" : "not-running";
}

/** config.json in the data folder: `chrome` (the mode) and `readyApp` (the desktop app's Claude Code copy that last had access). */
type Config = { chrome?: string; readyApp?: string; [k: string]: unknown };
const CONFIG = "config.json";

const readConfig = async (root: string): Promise<Config> =>
  JSON.parse(await fs.readFile(path.join(root, CONFIG), "utf8").catch(() => "{}"));

async function updateConfig(root: string, patch: Config): Promise<void> {
  const cfg = await readConfig(root);
  await fs.writeFile(path.join(root, CONFIG), JSON.stringify({ ...cfg, ...patch }, null, 2) + "\n");
}

export const readMode = async (root: string): Promise<Mode> => ((await readConfig(root)).chrome === "separate" ? "separate" : "main");
export const writeMode = (root: string, mode: Mode) => updateConfig(root, { chrome: mode });

async function main() {
  const { values } = parseArgs({ options: { set: { type: "string" } } });
  if (values.set !== undefined) {
    if (values.set !== "main" && values.set !== "separate") {
      console.error(`--set takes main or separate, got "${values.set}"`);
      process.exit(1);
    }
    await writeMode(process.cwd(), values.set);
  }
  const root = process.cwd();
  const mode = await readMode(root);
  const status = mode === "separate" ? await checkSeparate() : await checkMain(CANDIDATE_DIRS);
  const host = hostFrom(process.env.CLAUDE_CODE_EXECPATH, ancestry(), process.env.TERM_PROGRAM);
  // A Claude Code update moves the desktop app's copy, and macOS's grant stays with the old path.
  const { readyApp } = await readConfig(root);
  if (mode === "main" && status === "ready" && host.kind === "desktop" && host.appPath && host.appPath !== readyApp) {
    await updateConfig(root, { readyApp: host.appPath });
  }
  const readyBefore = status === "no-access" && !!readyApp && readyApp !== host.appPath && host.kind === "desktop";
  console.log(JSON.stringify({ mode, status, host, ...(readyBefore ? { readyBefore } : {}) }));
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) await main();
