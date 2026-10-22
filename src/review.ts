import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ARTIFACTS } from "./maps.js";
import { MAX_LIST_NAME } from "./plan.js";

/**
 * Review page for a maps-lists:research result. Serves research/<slug>.json on 127.0.0.1 as a page
 * with a checkbox and an editable note per place; "Continue" posts the choices back, which become
 * research/<slug>.places.md (the input maps-lists:import already reads). No dependencies.
 *
 *   npm run review -- research/<slug>.json            # opens the browser, waits for Continue
 *   npm run review -- research/<slug>.json --resume   # after exit 3: same port + token, no new tab
 *   npm run review -- --check research/<slug>.json    # validate only
 *
 * Exit codes: 0 submitted · 1 bad input · 2 cancelled in the page · 3 still waiting (--wait hit;
 * the page keeps its state and reconnects) · 4 page gone (no heartbeat for --idle seconds).
 */

const HttpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), { message: "only http(s) links" });
const SourceSchema = z.object({ title: z.string().min(1), url: HttpUrl });
const ItemSchema = z.object({
  section: z.string().default(""),
  name: z.string().min(1),
  area: z.string().default(""),
  /** The note that goes to Maps (maps-lists:import's note style). */
  note: z.string().default(""),
  /** Why it's in, what to order, caveats. Plain text; [markdown](links) are rendered. */
  details: z.string().default(""),
  sources: z.array(SourceSchema).default([]),
  keep: z.boolean().optional(),
});
/** The page's labels for a language without a built-in table; missing ones fall back to English. */
const UiSchema = z
  .object({
    hint: z.string(), filtered: z.string(), details: z.string(), hide: z.string(), placeholder: z.string(),
    keep: z.string(), noteFor: z.string(), cancel: z.string(), allBranches: z.string(), nothing: z.string(),
    reconnecting: z.string(), sending: z.string(), sent: z.string(), cancelled: z.string(), close: z.string(),
    /** The Continue button per plural category of `lang` (Intl.PluralRules: one, few, many, other…), with {n}. */
    go: z.record(z.enum(["zero", "one", "two", "few", "many", "other"]), z.string().includes("{n}")),
  })
  .partial()
  .strict();

export const ResearchSchema = z.object({
  version: z.literal(1),
  /** Language of the review page and of the notes the research wrote: any BCP 47 tag (en, ru, es, ca, pt-BR). */
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "a language tag like en, es, ca or pt-BR").default("en"),
  /** Labels for a `lang` other than en/ru, translated by Claude. */
  ui: UiSchema.optional(),
  list: z.string().min(1).max(MAX_LIST_NAME, `Maps cuts list names at ${MAX_LIST_NAME} characters; shorten it`),
  places: z.array(ItemSchema).min(1),
  /** Filtered out by the research (trap, viral, closed, thin evidence); shown unticked. */
  excluded: z.array(ItemSchema.extend({ reason: z.string().min(1) })).default([]),
});
export type Research = z.infer<typeof ResearchSchema>;
type Item = Research["places"][number] & { reason?: string };

const ChoicesSchema = z.object({
  items: z.array(z.object({ id: z.string(), keep: z.boolean(), note: z.string().max(2000) })).max(1000),
});
export type Choice = z.infer<typeof ChoicesSchema>["items"][number];

/** Places are p0…, filtered-out ones x0…. Places start ticked, filtered-out ones unticked. */
const entries = (r: Research) => [
  ...r.places.map((it, i) => ({ id: `p${i}`, it: it as Item, keep: it.keep ?? true })),
  ...r.excluded.map((it, i) => ({ id: `x${i}`, it: it as Item, keep: it.keep ?? false })),
];

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The choices from the page merged into the research file (keep + note per item). */
export function applyChoices(r: Research, choices: Choice[]): Research {
  const byId = new Map(choices.map((c) => [c.id, c]));
  const merge = <T extends Item>(it: T, id: string): T => {
    const c = byId.get(id);
    return c ? { ...it, keep: c.keep, note: oneLine(c.note) } : it;
  };
  return {
    ...r,
    places: r.places.map((it, i) => merge(it, `p${i}`)),
    excluded: r.excluded.map((it, i) => merge(it, `x${i}`)),
  };
}

/** The ticked items as a places file: `# List`, `## Section`, `- **Name** (area): note`. */
export function buildPlacesMd(r: Research): string {
  const kept = entries(r).filter((e) => e.keep).map((e) => e.it);
  const sections = [...new Set(kept.map((it) => it.section))];
  const out = [`# ${r.list}`, ""];
  for (const s of sections) {
    if (s) out.push(`## ${s}`, "");
    for (const it of kept.filter((k) => k.section === s)) {
      const area = it.area ? ` (${oneLine(it.area)})` : "";
      const note = oneLine(it.note) ? `: ${oneLine(it.note)}` : "";
      out.push(`- **${oneLine(it.name)}**${area}${note}`);
    }
    out.push("");
  }
  return out.join("\n");
}

export function summarize(before: Research, after: Research): string {
  const kept = after.places.filter((p) => p.keep ?? true).length;
  const added = after.excluded.filter((p) => p.keep).length;
  const edited = entries(after).filter((e, i) => e.keep && oneLine(e.it.note) !== oneLine(entries(before)[i]!.it.note)).length;
  return `Kept ${kept} of ${after.places.length}` +
    (added ? ` (+${added} from filtered out)` : "") +
    (edited ? `, ${edited} note${edited === 1 ? "" : "s"} edited` : "");
}

// ── page ─────────────────────────────────────────────────────────────────────

/** "1 place" / "3 места" / "5 мест": English has two forms, Russian three. */
export function plural(lang: "en" | "ru", n: number): string {
  if (lang === "en") return `${n} ${n === 1 ? "place" : "places"}`;
  const a = n % 10, b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? "место" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "места" : "мест"}`;
}

const UI = {
  en: {
    hint: "Untick what you don't want, edit notes, click a place for details, then Continue.",
    filtered: "Filtered out",
    details: "Details ▾",
    hide: "Hide ▴",
    placeholder: "Note for Google Maps (optional)",
    keep: "Keep",
    noteFor: "Note for",
    cancel: "Cancel",
    allBranches: "all branches",
    go: (n: number) => (n ? `Continue with ${plural("en", n)} →` : "Nothing selected"),
    nothing: "Nothing selected",
    reconnecting: "Reconnecting to Claude… your changes are kept.",
    sending: "Sending…",
    sent: "Sent to Claude",
    cancelled: "Cancelled",
    close: "You can close this tab.",
  },
  ru: {
    hint: "Снимите галочки с лишнего, поправьте заметки, нажмите на место, чтобы узнать подробности, затем «Продолжить».",
    filtered: "Отсеяно",
    details: "Подробнее ▾",
    hide: "Свернуть ▴",
    placeholder: "Заметка для Google Карт (необязательно)",
    keep: "Оставить",
    noteFor: "Заметка для",
    cancel: "Отмена",
    allBranches: "все филиалы",
    go: (n: number) => (n ? `Продолжить: ${plural("ru", n)} →` : "Ничего не выбрано"),
    nothing: "Ничего не выбрано",
    reconnecting: "Переподключаюсь к Claude… изменения сохранены.",
    sending: "Отправляю…",
    sent: "Отправлено в Claude",
    cancelled: "Отменено",
    close: "Эту вкладку можно закрыть.",
  },
};
type Strings = (typeof UI)["en"];

/** Built-in table for en/ru; for any other lang, Claude's `ui` over English (go per plural category). */
export function strings(r: Pick<Research, "lang" | "ui">): Strings {
  const base = r.lang.split("-")[0];
  if (base === "en" || base === "ru") return UI[base];
  const { go, ...labels } = r.ui ?? {};
  const t: Strings = { ...UI.en, ...labels };
  if (!go) return t;
  const rules = new Intl.PluralRules(r.lang);
  const nothing = t.nothing;
  t.go = (n) => {
    if (!n) return nothing;
    const form = go[rules.select(n)] ?? go.other;
    return form ? form.replace("{n}", String(n)) : UI.en.go(n);
  };
  return t;
}

/** The page's lang attribute: English when a language without a built-in table brought no labels. */
const pageLang = (r: Research) => (["en", "ru"].includes(r.lang.split("-")[0]!) || r.ui ? r.lang : "en");

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Escape, then bold / italic / code. Markdown backslash escapes (`\[1\]`) are dropped first. */
function fmt(s: string): string {
  return esc(s.replace(/\\([\[\]*_`()#.\-!$])/g, "$1"))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

/** Inline markdown: `[text](url)` and bare http(s) URLs become links; only http(s) is ever linked. */
export function inline(s: string): string {
  const out: string[] = [];
  let last = 0;
  for (const m of s.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>)\]]+)/g)) {
    let url = m[2] ?? m[3]!;
    let tail = "";
    if (m[3]) {
      // A bare URL at the end of a sentence keeps its full stop outside the link.
      const p = url.match(/[.,;:]+$/)?.[0] ?? "";
      url = url.slice(0, url.length - p.length);
      tail = p;
    }
    out.push(fmt(s.slice(last, m.index)));
    out.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${m[1] ? fmt(m[1]) : esc(url)}</a>${esc(tail)}`);
    last = m.index! + m[0].length;
  }
  out.push(fmt(s.slice(last)));
  return out.join("");
}

function card(id: string, it: Item, keep: boolean, t: Strings): string {
  const details = it.details.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${inline(p.trim())}</p>`).join("");
  const sources = it.sources.length
    ? `<ul class="sources">${it.sources.map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`).join("")}</ul>`
    : "";
  const more = details || sources;
  return `<li class="card${keep ? "" : " off"}" data-id="${id}">
<input type="checkbox" class="tick"${keep ? " checked" : ""} aria-label="${t.keep} ${esc(it.name)}">
<div class="body">
<button type="button" class="name"${more ? ' aria-expanded="false"' : " disabled"}>${esc(it.name)}${it.area ? `<span class="area">${esc(it.area === "all branches" ? t.allBranches : it.area)}</span>` : ""}${more ? '<span class="chev" aria-hidden="true"></span>' : ""}</button>
${it.reason ? `<p class="reason">${inline(it.reason)}</p>` : ""}
${more ? `<div class="details" hidden>${details}${sources}</div>` : ""}
<textarea class="note" rows="1" placeholder="${t.placeholder}" aria-label="${t.noteFor} ${esc(it.name)}">${esc(it.note)}</textarea>
</div>
</li>`;
}

function sectioned(items: { id: string; it: Item; keep: boolean }[], level: "h2" | "h3", t: Strings): string {
  const sections = [...new Set(items.map((e) => e.it.section))];
  return sections.map((s) =>
    (s ? `<${level}>${esc(s)}</${level}>` : "") +
    `<ul class="cards">${items.filter((e) => e.it.section === s).map((e) => card(e.id, e.it, e.keep, t)).join("")}</ul>`,
  ).join("\n");
}

const CSS = `
:root { --bg:#f7f6f3; --fg:#1d1c1a; --muted:#6b6862; --line:#e2dfd8; --card:#fff; --accent:#1a73e8; --accent-fg:#fff; --field:#faf9f7; }
@media (prefers-color-scheme: dark) { :root { --bg:#141414; --fg:#ece9e4; --muted:#a19d96; --line:#2f2e2c; --card:#1e1e1d; --accent:#8ab4f8; --accent-fg:#0b1d3a; --field:#181817; } }
html { scrollbar-gutter:stable; }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width:720px; margin:0 auto; padding:28px 16px 120px; }
h1 { font-size:1.6rem; line-height:1.2; margin:0 0 4px; }
.hint { color:var(--muted); margin:0 0 8px; }
h2 { font-size:1.1rem; margin:32px 0 10px; }
h3 { font-size:1rem; margin:20px 0 8px; }
.cards { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.card { display:grid; grid-template-columns:28px 1fr; gap:8px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:12px; transition:opacity .15s; }
.card.off { opacity:.55; }
.tick { width:20px; height:20px; margin:3px 0 0; accent-color:var(--accent); cursor:pointer; }
.body { min-width:0; }
.name { all:unset; cursor:pointer; font-weight:600; display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 8px; width:100%; }
.name:disabled { cursor:default; }
.name:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:4px; }
.area { color:var(--muted); font-weight:400; font-size:.9rem; }
.chev::before { color:var(--accent); font-weight:400; font-size:.85rem; }
.reason { margin:2px 0 0; color:var(--muted); font-size:.9rem; }
.details { margin:6px 0 2px; font-size:.95rem; }
.details p { margin:0 0 6px; }
.sources { margin:0; padding-left:18px; font-size:.88rem; }
a { color:var(--accent); overflow-wrap:anywhere; }
.note { display:block; width:100%; margin-top:8px; resize:none; overflow:hidden; font:inherit; font-size:.95rem; color:var(--fg); background:var(--field); border:1px solid var(--line); border-radius:8px; padding:6px 8px; }
.note:focus { outline:2px solid var(--accent); outline-offset:-1px; }
details.filtered { margin-top:36px; }
details.filtered > summary { cursor:pointer; font-weight:600; color:var(--muted); }
footer { position:fixed; left:0; right:0; bottom:0; background:var(--card); border-top:1px solid var(--line); }
footer .bar { max-width:720px; margin:0 auto; padding:12px 16px; display:flex; gap:10px; align-items:center; }
#status { flex:1; color:var(--muted); font-size:.9rem; }
button.btn { font:inherit; border-radius:10px; padding:9px 16px; cursor:pointer; border:1px solid var(--line); background:transparent; color:var(--fg); }
button.primary { background:var(--accent); border-color:var(--accent); color:var(--accent-fg); font-weight:600; }
button.btn:disabled { opacity:.5; cursor:default; }
.done { text-align:center; padding:80px 16px; }
`;

// Runs in the browser, after renderPage's `var L = {...}` (the page strings). No \${} in here (this
// is a TS template literal), and no global named `status`: that's window.status, which only holds strings.
const SCRIPT = `
var T = new URLSearchParams(location.search).get("t");
var done = false;
var go = document.getElementById("go"), statusEl = document.getElementById("status");
function post(path, body) {
  return fetch(path + "?t=" + encodeURIComponent(T), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
}
function grow(el) { el.style.height = "auto"; el.style.height = el.scrollHeight + 2 + "px"; }
function count() {
  var n = document.querySelectorAll(".tick:checked").length;
  go.textContent = L.go[n];
  go.disabled = n === 0 || done;
}
document.querySelectorAll(".note").forEach(function (el) { grow(el); el.addEventListener("input", function () { grow(el); }); });
window.addEventListener("resize", function () { document.querySelectorAll(".note").forEach(grow); });
document.querySelectorAll(".tick").forEach(function (el) {
  el.addEventListener("change", function () { el.closest(".card").classList.toggle("off", !el.checked); count(); });
});
document.querySelectorAll(".name[aria-expanded]").forEach(function (b) {
  b.addEventListener("click", function () {
    var open = b.getAttribute("aria-expanded") === "true";
    b.setAttribute("aria-expanded", String(!open));
    b.closest(".body").querySelector(".details").hidden = open;
  });
});
function online(ok) { if (!done) statusEl.textContent = ok ? "" : L.reconnecting; }
function ping() { if (done) return; post("/ping").then(function (r) { online(r.ok); }, function () { online(false); }); }
setInterval(ping, 10000); ping();
function send(path, body, message) {
  done = true; go.disabled = true; document.getElementById("cancel").disabled = true;
  statusEl.textContent = L.sending;
  post(path, body).then(function (r) {
    if (!r.ok) throw new Error(String(r.status));
    var box = document.createElement("div"), h = document.createElement("h1"), p = document.createElement("p");
    box.className = "done"; h.textContent = message; p.className = "hint"; p.textContent = L.close;
    box.append(h, p);
    document.querySelector("main").replaceChildren(box);
    document.querySelector("footer").remove();
  }).catch(function () {
    statusEl.textContent = L.reconnecting;
    setTimeout(function () { send(path, body, message); }, 2000);
  });
}
go.addEventListener("click", function () {
  var items = [];
  document.querySelectorAll(".card").forEach(function (c) {
    items.push({ id: c.dataset.id, keep: c.querySelector(".tick").checked, note: c.querySelector(".note").value });
  });
  send("/submit", { items: items }, L.sent);
});
document.getElementById("cancel").addEventListener("click", function () { send("/cancel", {}, L.cancelled); });
count();
`;

export function renderPage(r: Research): string {
  const all = entries(r);
  const places = all.filter((e) => e.id.startsWith("p"));
  const filtered = all.filter((e) => e.id.startsWith("x"));
  const t = strings(r);
  // Client-side strings; "go" is precomputed for every count, so the page needs no plural rules.
  const L = {
    go: Array.from({ length: all.length + 1 }, (_, n) => t.go(n)),
    reconnecting: t.reconnecting, sending: t.sending, sent: t.sent, cancelled: t.cancelled, close: t.close,
  };
  return `<!doctype html>
<html lang="${pageLang(r)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(r.list)}</title><style>${CSS}
.chev::before { content:${JSON.stringify(t.details)}; }
.name[aria-expanded="true"] .chev::before { content:${JSON.stringify(t.hide)}; }
</style></head>
<body><main>
<h1>${esc(r.list)}</h1>
<p class="hint">${t.hint}</p>
${sectioned(places, "h2", t)}
${filtered.length ? `<details class="filtered"><summary>${t.filtered} (${filtered.length})</summary>\n${sectioned(filtered, "h3", t)}</details>` : ""}
</main>
<footer><div class="bar"><span id="status" role="status"></span><button type="button" class="btn" id="cancel">${t.cancel}</button><button type="button" class="btn primary" id="go">${t.go(places.length)}</button></div></footer>
<script>var L = ${JSON.stringify(L).replace(/</g, "\\u003c")};
${SCRIPT}</script>
</body></html>
`;
}

// ── server ───────────────────────────────────────────────────────────────────

export type Outcome = { outcome: "submitted"; summary: string } | { outcome: "cancelled" | "timeout" | "closed" };

export async function loadResearch(file: string): Promise<Research> {
  return ResearchSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

export const placesPath = (file: string) => file.replace(/\.json$/, "") + ".places.md";

/**
 * Serves the review page until it submits or cancels, or `waitMs` / `idleMs` (no heartbeat) runs
 * out. On submit, writes `<file>.places.md` and the choices back into `<file>`.
 */
export async function serve(opts: {
  file: string; port?: number; token: string; waitMs: number; idleMs: number;
  onListen?: (port: number) => void | Promise<void>;
}): Promise<Outcome> {
  const research = await loadResearch(opts.file);
  const page = renderPage(research);
  let lastSeen = Date.now();
  let finish!: (o: Outcome) => void;
  const result = new Promise<Outcome>((r) => (finish = r));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const host = req.headers.host ?? "";
    // Token on every route; the Host check stops DNS-rebinding pages from reaching it by name.
    if (url.searchParams.get("t") !== opts.token || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
      res.writeHead(403).end();
      return;
    }
    lastSeen = Date.now();
    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(page);
      return;
    }
    if (req.method !== "POST") { res.writeHead(404).end(); return; }
    if (url.pathname === "/ping") { res.writeHead(204).end(); return; }
    if (url.pathname === "/cancel") { res.writeHead(204).end(); finish({ outcome: "cancelled" }); return; }
    if (url.pathname !== "/submit") { res.writeHead(404).end(); return; }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (c: string) => {
      body += c;
      if (body.length > 1_000_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const { items } = ChoicesSchema.parse(JSON.parse(body));
        const after = applyChoices(research, items);
        await fs.writeFile(placesPath(opts.file), buildPlacesMd(after));
        await fs.writeFile(opts.file, JSON.stringify(after, null, 2) + "\n");
        res.writeHead(204).end();
        finish({ outcome: "submitted", summary: summarize(research, after) });
      } catch (e) {
        res.writeHead(400, { "content-type": "text/plain" }).end((e as Error).message);
      }
    });
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(opts.port ?? 0, "127.0.0.1", () => ok());
  });
  await opts.onListen?.((server.address() as { port: number }).port);

  const deadline = setTimeout(() => finish({ outcome: "timeout" }), opts.waitMs);
  const idle = setInterval(() => { if (Date.now() - lastSeen > opts.idleMs) finish({ outcome: "closed" }); }, 1000);
  const outcome = await result;
  clearTimeout(deadline);
  clearInterval(idle);
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  return outcome;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      check: { type: "boolean" },
      resume: { type: "boolean" },
      "no-open": { type: "boolean" },
      wait: { type: "string", default: "540" },
      idle: { type: "string", default: "120" },
    },
  });
  const file = positionals[0];
  if (positionals.length !== 1 || !file!.endsWith(".json")) {
    console.error("usage: npm run review -- research/<slug>.json [--resume] [--no-open] | --check research/<slug>.json");
    process.exit(1);
  }
  let research: Research;
  try {
    research = await loadResearch(file!);
  } catch (e) {
    console.error(`${file} is not a valid research file:\n${e instanceof z.ZodError ? e.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n") : (e as Error).message}`);
    process.exit(1);
  }
  if (values.check) {
    console.log(`OK: "${research.list}", ${research.places.length} places, ${research.excluded.length} filtered out`);
    return;
  }

  const sessionFile = `${ARTIFACTS}/review-session.json`;
  let session = { file: file!, port: 0, token: randomBytes(16).toString("hex") };
  if (values.resume) {
    const saved = JSON.parse(await fs.readFile(sessionFile, "utf8").catch(() => "{}"));
    if (saved.file !== file) {
      console.error(`No review session to resume for ${file}. Run it without --resume.`);
      process.exit(1);
    }
    session = saved;
  }
  const outcome = await serve({
    file: file!,
    port: session.port || undefined,
    token: session.token,
    waitMs: Number(values.wait) * 1000,
    idleMs: Number(values.idle) * 1000,
    onListen: async (port) => {
      session.port = port;
      await fs.mkdir(ARTIFACTS, { recursive: true });
      await fs.writeFile(sessionFile, JSON.stringify(session));
      const url = `http://127.0.0.1:${port}/?t=${session.token}`;
      console.log(`Review page: ${url}`);
      if (!values.resume && !values["no-open"] && process.platform === "darwin") execFile("open", [url]);
    },
  });

  if (outcome.outcome === "timeout") {
    console.log("Still waiting for the review page. Run again with --resume (the page keeps its changes).");
    process.exit(3);
  }
  await fs.rm(sessionFile, { force: true });
  if (outcome.outcome === "submitted") {
    console.log(`${outcome.summary} → ${placesPath(file!)}`);
  } else if (outcome.outcome === "cancelled") {
    console.log("Review cancelled in the page.");
    process.exit(2);
  } else {
    console.log("The review page stopped responding (tab closed?).");
    process.exit(4);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) await main();
