import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { compactSearch, compactThread, findUv, parseStatus, postId, splitArgs } from "./reddit.js";

test("postId takes bare ids and every Reddit link form", () => {
  assert.equal(postId("1g3v2yq"), "1g3v2yq");
  assert.equal(postId("t3_1g3v2yq"), "1g3v2yq");
  assert.equal(postId("https://www.reddit.com/r/lisbon/comments/1g3v2yq/best_pastel_de_nata/"), "1g3v2yq");
  assert.equal(postId("https://old.reddit.com/r/lisbon/comments/1G3V2YQ/x/abc123/"), "1g3v2yq");
  assert.equal(postId("https://redd.it/1g3v2yq"), "1g3v2yq");
  assert.equal(postId("https://www.reddit.com/r/lisbon/"), undefined);
  assert.equal(postId("best bakery"), undefined);
});

test("splitArgs passes read-only flags and refuses everything else", () => {
  const search = new Set(["-r", "-t", "-n"]);
  assert.deepEqual(splitArgs(["bakery", "-r", "lisbon", "-t", "year"], search), { flags: ["-r", "lisbon", "-t", "year"], rest: ["bakery"] });
  assert.throws(() => splitArgs(["bakery", "--upvote", "1"], search), /unsupported option --upvote/);
  assert.throws(() => splitArgs(["bakery", "-r"], search), /unsupported option -r/);
});

test("parseStatus reads rdt's envelope", () => {
  assert.equal(parseStatus(JSON.stringify({ ok: true, data: { authenticated: true } })), true);
  assert.equal(parseStatus(JSON.stringify({ ok: true, data: { authenticated: false, error: "No credential loaded" } })), false);
  assert.equal(parseStatus(""), false);
});

test("findUv falls back to the installers' folders when uv isn't on PATH", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "uv-"));
  assert.equal(findUv([dir], () => undefined), undefined);
  const uv = process.platform === "win32" ? "uv.exe" : "uv";
  await fs.writeFile(path.join(dir, uv), "");
  assert.equal(findUv([dir], () => undefined), path.join(dir, uv));
  assert.equal(findUv([dir], () => "/somewhere/uv"), "/somewhere/uv");
});

test("compactSearch keeps what research weighs, with a short preview", () => {
  const raw = { ok: true, data: [{ id: "1r2t97n", name: "t3_1r2t97n", subreddit: "Lisbon", author: "someone", title: "Favourite nata?",
    score: 84, num_comments: 70, created_utc: 1770854400, selftext: "x".repeat(400), permalink: "/r/Lisbon/comments/1r2t97n/favourite/", over_18: false }] };
  const out = JSON.parse(compactSearch(JSON.stringify(raw)));
  assert.deepEqual(Object.keys(out.posts[0]), ["id", "subreddit", "title", "score", "comments", "date", "text", "url"]);
  assert.equal(out.posts[0].date, "2026-02-12");
  assert.equal(out.posts[0].text.length, 301);
  assert.equal(out.posts[0].url, "https://www.reddit.com/r/Lisbon/comments/1r2t97n/favourite/");
  assert.equal(JSON.stringify(out).includes("someone"), false);
});

test("compactSearch reads Reddit's raw Listing too, and drops its modhash", () => {
  const raw = { ok: true, data: { kind: "Listing", data: { modhash: "secret-modhash", after: "t3_x", children: [
    { kind: "t3", data: { id: "1w4bluo", subreddit: "Lisbon", title: "Manteigaria vs Pastéis de Belém", score: 3, num_comments: 28, selftext: "" } },
  ] } } };
  const text = compactSearch(JSON.stringify(raw));
  assert.equal(JSON.parse(text).posts[0].id, "1w4bluo");
  assert.equal(text.includes("secret-modhash"), false);
});

test("compactThread flattens the comment tree with depth and counts unloaded replies", () => {
  const c = (body: string, score: number, replies: unknown = "") => ({ kind: "t1", data: { body, score, author: "u", created_utc: 1770854400, replies } });
  const raw = { ok: true, data: [
    { data: { children: [{ kind: "t3", data: { id: "1r2t97n", title: "Favourite nata?", score: 84, num_comments: 70, selftext: "" } }] } },
    { data: { children: [
      c("Manteigaria", 25, { data: { children: [c("Castro next door", 3), { kind: "more", data: { count: 3 } }] } }),
      c("Pasteis de Belem are overrated", 4),
      { kind: "more", data: { count: 39 } },
    ] } },
  ] };
  const out = JSON.parse(compactThread(JSON.stringify(raw)));
  assert.equal(out.post.title, "Favourite nata?");
  assert.deepEqual(out.comments.map((x: { score: number; depth: number }) => [x.score, x.depth]), [[25, 0], [3, 1], [4, 0]]);
  assert.equal(out.more, 42);
});

test("errors keep rdt's envelope", () => {
  const err = { ok: false, error: { code: "forbidden", message: "Access forbidden" } };
  assert.deepEqual(JSON.parse(compactSearch(JSON.stringify(err))), err);
  assert.deepEqual(JSON.parse(compactThread(JSON.stringify(err))), err);
});
