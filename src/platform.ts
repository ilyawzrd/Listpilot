import { execFile, execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * What differs between macOS, Linux and Windows: where Chrome keeps its user data (and so
 * DevToolsActivePort), where Chrome itself is installed, how to spot the user's own Chrome among
 * running processes, and how to open a link. The pure helpers take the platform and environment as
 * arguments so the tests can cover every OS from one machine.
 */

type Env = Record<string, string | undefined>;
type Plat = NodeJS.Platform;

/** User-data folders where a Chromium browser writes DevToolsActivePort. */
export function chromeDataDirs(platform: Plat = process.platform, env: Env = process.env, home = os.homedir()): string[] {
  const p = platform === "win32" ? path.win32 : path.posix;
  const dirs = (base: string, names: string[]) => names.map((n) => p.join(base, n));
  let found: string[];
  if (platform === "darwin") {
    found = dirs(p.join(home, "Library", "Application Support"), [
      "Google/Chrome", "Google/Chrome Beta", "Google/Chrome Dev", "Google/Chrome Canary",
      "Chromium", "BraveSoftware/Brave-Browser", "Microsoft Edge", "Arc/User Data",
    ]);
  } else if (platform === "win32") {
    const local = env.LOCALAPPDATA ?? p.join(home, "AppData", "Local");
    found = dirs(local, [
      "Google\\Chrome\\User Data", "Google\\Chrome Beta\\User Data", "Google\\Chrome Dev\\User Data",
      "Google\\Chrome SxS\\User Data", "Chromium\\User Data", "BraveSoftware\\Brave-Browser\\User Data",
      "Microsoft\\Edge\\User Data",
    ]);
  } else {
    found = dirs(env.XDG_CONFIG_HOME || p.join(home, ".config"), [
      "google-chrome", "google-chrome-beta", "google-chrome-unstable", "chromium",
      "BraveSoftware/Brave-Browser", "microsoft-edge",
    ]);
    // Snap's Chromium keeps its profile inside the snap.
    found.push(p.join(home, "snap", "chromium", "common", "chromium"));
  }
  return [env.GMAPS_CHROME_DIR, ...found].filter((d): d is string => !!d);
}

/** A shell command that finds DevToolsActivePort when none of the folders above has it. */
export function findActivePortHint(platform: Plat = process.platform): string {
  if (platform === "darwin") return "find ~/Library/Application\\ Support -maxdepth 4 -name DevToolsActivePort 2>/dev/null";
  if (platform === "win32") return 'Get-ChildItem $env:LOCALAPPDATA -Depth 4 -Filter DevToolsActivePort  (in PowerShell)';
  return "find ~/.config ~/snap -maxdepth 5 -name DevToolsActivePort 2>/dev/null";
}

/** Google Chrome on this machine: its executable, and on macOS its .app. */
export type Chrome = { exe: string; app?: string };

const MAC_EXE = "Contents/MacOS/Google Chrome";
const LINUX_NAMES = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"];

/** Where Chrome usually is, in the order to try. Linux names are looked up on PATH by findChrome. */
export function chromeCandidates(platform: Plat = process.platform, env: Env = process.env, home = os.homedir()): string[] {
  if (platform === "darwin") {
    return ["/Applications/Google Chrome.app", path.posix.join(home, "Applications", "Google Chrome.app")];
  }
  if (platform === "win32") {
    const exe = "Google\\Chrome\\Application\\chrome.exe";
    return [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA]
      .filter((d): d is string => !!d)
      .map((d) => path.win32.join(d, exe));
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"];
}

/** Google Chrome's executable (and .app on macOS), wherever it's installed; undefined when it isn't. */
export function findChrome(platform: Plat = process.platform): Chrome | undefined {
  const fromApp = (app: string): Chrome => ({ exe: path.join(app, MAC_EXE), app });
  const fixed = chromeCandidates(platform).find((p) => existsSync(p));
  if (platform === "darwin") {
    if (fixed) return fromApp(fixed);
    try {
      const app = execFileSync("mdfind", ["kMDItemCFBundleIdentifier == 'com.google.Chrome'"], { encoding: "utf8" })
        .split("\n").find((p) => p.endsWith(".app"));
      return app ? fromApp(app) : undefined;
    } catch {
      return undefined;
    }
  }
  if (fixed) return { exe: fixed };
  if (platform === "win32") return undefined;
  const onPath = LINUX_NAMES.map((n) => which(n)).find(Boolean);
  return onPath ? { exe: onPath } : undefined;
}

/**
 * Is this process line (full command line) the user's own Chrome? Its main process, not a helper
 * (`--type=…`) and not the maps-lists profile (`--user-data-dir=`). Linux's google-chrome is a
 * wrapper script, so the running binary is matched by name there.
 */
export function isEverydayChrome(line: string, platform: Plat, chrome: Chrome): boolean {
  if (line.includes("--type=") || line.includes("--user-data-dir=")) return false;
  const l = line.trim();
  if (platform === "darwin") return l.startsWith(chrome.exe);
  if (platform === "win32") return /^"?[^"]*\\chrome\.exe"?(\s|$)/i.test(l);
  const bin = l.split(/\s/)[0] ?? "";
  return ["chrome", ...LINUX_NAMES].includes(path.posix.basename(bin));
}

/** Command lines of running processes: `ps` on macOS and Linux, CIM through PowerShell on Windows. */
export function processLines(platform: Plat = process.platform): string[] {
  try {
    if (platform === "win32") {
      return execFileSync("powershell.exe", ["-NoProfile", "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | ForEach-Object { $_.CommandLine }"],
      { encoding: "utf8", windowsHide: true }).split(/\r?\n/);
    }
    return execFileSync("ps", ["-axo", "args="], { encoding: "utf8" }).split("\n");
  } catch {
    return [];
  }
}

/** A program on PATH (`command -v`, or `where` on Windows); undefined when it isn't there. */
export function which(bin: string, platform: Plat = process.platform): string | undefined {
  const r = platform === "win32"
    ? spawnSync("where", [bin], { encoding: "utf8", windowsHide: true })
    : spawnSync("/bin/sh", ["-c", `command -v ${bin}`], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0]!.trim() || undefined : undefined;
}

/** The command that opens a link or folder with the system's default handler. */
export function openCommand(target: string, platform: Plat = process.platform): [string, string[]] {
  if (platform === "darwin") return ["open", [target]];
  // Not `cmd /c start`: cmd would treat the & in a link's query string as a command separator.
  if (platform === "win32") return ["rundll32.exe", ["url.dll,FileProtocolHandler", target]];
  return ["xdg-open", [target]];
}

/** Opens a link or folder in the default app, without waiting; quiet if there's no handler. */
export function openInDefault(target: string): void {
  const [cmd, args] = openCommand(target);
  execFile(cmd, args, () => {});
}
