import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { findChrome } from "./platform.js";

/**
 * Opens Chrome, on macOS, Linux and Windows alike.
 *
 *   maps-lists chrome                    # the SEPARATE maps-lists profile, CDP on 127.0.0.1:9333
 *   maps-lists chrome --main [url]       # the user's own Chrome, e.g. at chrome://inspect/#remote-debugging
 *
 * The separate profile is on 9333, not 9222: the chrome://inspect toggle in the main Chrome takes
 * 127.0.0.1:9222, and a second Chrome on that port only gets [::1] and is unreachable at 127.0.0.1.
 * Why a separate profile: since Chrome 136, --remote-debugging-port is ignored for the default
 * profile (a security change), and keeping the everyday Chrome off an open debug port is safer
 * anyway. Sign into Google once in the window this opens; the profile remembers it.
 */

const NOT_INSTALLED =
  "Google Chrome isn't installed. Get it from https://www.google.com/chrome/ (it doesn't need to be your default browser).";

/** Starts Chrome detached, so this command returns while Chrome keeps running. */
function start(exe: string, args: string[]): void {
  spawn(exe, args, { detached: true, stdio: "ignore" }).unref();
}

async function openMain(url: string | undefined): Promise<number> {
  const chrome = findChrome();
  if (!chrome) {
    console.error(NOT_INSTALLED);
    return 1;
  }
  // macOS: `open -a` hands the link to a running Chrome instead of starting a second one. Elsewhere
  // Chrome does that itself when started again with a link.
  if (chrome.app) start("open", ["-a", chrome.app, ...(url ? [url] : [])]);
  else start(chrome.exe, url ? [url] : []);
  return 0;
}

async function openSeparate(): Promise<number> {
  const port = process.env.CDP_PORT ?? "9333";
  const base = `http://127.0.0.1:${port}`;
  const get = (p: string, init?: RequestInit) => fetch(base + p, { signal: AbortSignal.timeout(5000), ...init }).catch(() => null);

  if ((await get("/json/version"))?.ok) {
    // Closing its last window doesn't quit Chrome on macOS: open a window again if none is left.
    const targets = ((await (await get("/json/list"))?.json().catch(() => [])) ?? []) as { type: string }[];
    if (!targets.some((t) => t.type === "page")) {
      await get("/json/new?https://www.google.com/maps", { method: "PUT" });
      console.log("The maps-lists Chrome window was running with no window open; opened one.");
    } else {
      console.log(`The maps-lists Chrome window is already running on port ${port}.`);
    }
    return 0;
  }

  const chrome = findChrome();
  if (!chrome) {
    console.error(NOT_INSTALLED);
    return 1;
  }
  const profile = process.env.GMAPS_PROFILE ?? path.join(os.homedir(), ".gmaps-automation-profile");
  // A new profile is signed out, and Maps only shows a small "Sign in" button: open Google's
  // sign-in page first, which lands on Maps afterwards.
  let url = "https://www.google.com/maps?hl=en";
  if (!existsSync(profile)) url = `https://accounts.google.com/ServiceLogin?continue=${url}`;
  mkdirSync(profile, { recursive: true });
  start(chrome.exe, [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    url,
  ]);
  console.log(`Opened the maps-lists Chrome window (port ${port}).`);
  return 0;
}

const { values, positionals } = parseArgs({ options: { main: { type: "boolean" } }, allowPositionals: true });
process.exitCode = values.main ? await openMain(positionals[0]) : await openSeparate();
