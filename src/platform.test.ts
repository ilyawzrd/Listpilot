import assert from "node:assert/strict";
import { test } from "node:test";
import { chromeCandidates, chromeDataDirs, isEverydayChrome, openCommand } from "./platform.js";

test("chromeDataDirs: each OS's Chrome user-data folder, override first", () => {
  const mac = chromeDataDirs("darwin", {}, "/Users/u");
  assert.equal(mac[0], "/Users/u/Library/Application Support/Google/Chrome");
  const linux = chromeDataDirs("linux", {}, "/home/u");
  assert.equal(linux[0], "/home/u/.config/google-chrome");
  assert.ok(linux.includes("/home/u/.config/chromium"));
  assert.equal(chromeDataDirs("linux", { XDG_CONFIG_HOME: "/x" }, "/home/u")[0], "/x/google-chrome");
  const win = chromeDataDirs("win32", { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u");
  assert.equal(win[0], "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\User Data");
  assert.equal(chromeDataDirs("win32", {}, "C:\\Users\\u")[0], "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\User Data");
  assert.equal(chromeDataDirs("linux", { GMAPS_CHROME_DIR: "/mine" }, "/home/u")[0], "/mine");
});

test("chromeCandidates: Windows looks in Program Files and the per-user install", () => {
  const win = chromeCandidates("win32", { PROGRAMFILES: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" }, "C:\\Users\\u");
  assert.deepEqual(win, [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
  ]);
});

test("isEverydayChrome: the main process only, on Linux and Windows", () => {
  const linux = { exe: "/usr/bin/google-chrome" };
  // google-chrome is a wrapper script: the running binary is /opt/google/chrome/chrome.
  assert.equal(isEverydayChrome("/opt/google/chrome/chrome", "linux", linux), true);
  assert.equal(isEverydayChrome("/usr/lib/chromium/chromium --enable-features=x", "linux", linux), true);
  assert.equal(isEverydayChrome("/opt/google/chrome/chrome --type=renderer --lang=en", "linux", linux), false);
  assert.equal(isEverydayChrome("/opt/google/chrome/chrome --remote-debugging-port=9333 --user-data-dir=/home/u/.gmaps-automation-profile", "linux", linux), false);
  assert.equal(isEverydayChrome("/usr/bin/bash /home/u/chrome-notes.sh", "linux", linux), false);

  const win = { exe: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" };
  assert.equal(isEverydayChrome('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" ', "win32", win), true);
  assert.equal(isEverydayChrome('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --type=gpu-process', "win32", win), false);
  assert.equal(isEverydayChrome('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --user-data-dir=C:\\Users\\u\\.gmaps-automation-profile', "win32", win), false);
});

test("openCommand: open, xdg-open, and rundll32 (no cmd, so & in a link is safe)", () => {
  const url = "http://127.0.0.1:5000/?t=abc&x=1";
  assert.deepEqual(openCommand(url, "darwin"), ["open", [url]]);
  assert.deepEqual(openCommand(url, "linux"), ["xdg-open", [url]]);
  assert.deepEqual(openCommand(url, "win32"), ["rundll32.exe", ["url.dll,FileProtocolHandler", url]]);
});
