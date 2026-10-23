import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { checkMain, everydayChromeRunning, hostFrom, readMode, writeMode } from "./chrome-check.js";

const INNER =
  "/Users/u/Library/Application Support/Claude/claude-code/2.1.299/4fa9694b7975/claude.app/Contents/MacOS/claude";

test("hostFrom: desktop app → the inner Claude Code copy, wherever it shows up", () => {
  const viaExec = hostFrom(INNER, ["/bin/zsh"], undefined);
  assert.equal(viaExec.kind, "desktop");
  assert.equal(viaExec.appPath, "/Users/u/Library/Application Support/Claude/claude-code/2.1.299/4fa9694b7975/claude.app");
  assert.equal(hostFrom(undefined, ["/bin/zsh", INNER, "/Applications/Claude.app/Contents/MacOS/Claude"], undefined).kind, "desktop");
});

test("hostFrom: terminal → the outermost app; editors and unknowns", () => {
  const ghostty = hostFrom("/Users/u/.local/share/claude/versions/2.1.308",
    ["/bin/zsh", "claude", "-/bin/zsh", "/usr/bin/login", "/Applications/Ghostty.app/Contents/MacOS/ghostty"], "ghostty");
  assert.deepEqual(ghostty, { kind: "terminal", app: "Ghostty", appPath: "/Applications/Ghostty.app" });
  const terminal = hostFrom(undefined, ["/bin/zsh", "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal"], "Apple_Terminal");
  assert.equal(terminal.app, "Terminal");
  assert.equal(hostFrom(undefined, ["/bin/zsh"], "vscode").kind, "editor");
  assert.equal(hostFrom(undefined, ["/bin/zsh", "sshd"], undefined).kind, "unknown");
});

test("checkMain: ready, no access, debugging off", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-"));
  const [ok, locked, empty] = ["ok", "locked", "empty"].map((d) => path.join(root, d));
  for (const d of [ok!, locked!, empty!]) await fs.mkdir(d);
  await fs.writeFile(path.join(ok!, "DevToolsActivePort"), "9222\n/devtools/browser/abc\n");
  await fs.writeFile(path.join(locked!, "DevToolsActivePort"), "9222\n/devtools/browser/abc\n");
  await fs.chmod(path.join(locked!, "DevToolsActivePort"), 0o000); // EACCES stands in for macOS's EPERM

  assert.equal(await checkMain([empty!, ok!]), "ready");
  assert.equal(await checkMain([empty!]), "debugging-off");
  // Root reads anything, and Windows ignores chmod's read bits.
  if (process.getuid?.() !== 0 && process.platform !== "win32") assert.equal(await checkMain([empty!, locked!]), "no-access");
  await fs.chmod(path.join(locked!, "DevToolsActivePort"), 0o600);
});

test("everydayChromeRunning: the user's Chrome, not the maps-lists profile or helpers", () => {
  const app = "/Applications/Google Chrome.app";
  const bin = `${app}/Contents/MacOS/Google Chrome`;
  const helper = `${app}/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper.app/x --type=renderer`;
  const mapsLists = `${bin} --remote-debugging-port=9333 --user-data-dir=/Users/u/.gmaps-automation-profile`;
  const chrome = { exe: bin, app };
  assert.equal(everydayChromeRunning([helper, mapsLists, "/bin/zsh"], chrome, "darwin"), false);
  assert.equal(everydayChromeRunning([`${bin} --no-startup-window`, mapsLists], chrome, "darwin"), true);
  assert.equal(everydayChromeRunning([bin], chrome, "darwin"), true);
});

test("readMode/writeMode: main by default, remembered, other keys kept", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cc-"));
  assert.equal(await readMode(root), "main");
  await fs.writeFile(path.join(root, "config.json"), JSON.stringify({ other: 1 }));
  await writeMode(root, "separate");
  assert.equal(await readMode(root), "separate");
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "config.json"), "utf8")).other, 1);
});
