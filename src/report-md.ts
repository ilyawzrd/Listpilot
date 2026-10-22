import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { ARTIFACTS } from "./maps.js";

/**
 * artifacts/report.json → the Markdown block maps-lists:run shows as is, so the layout doesn't
 * depend on the model. English and Russian labels are built in; for any other language the skill
 * translates the labels and leaves names and numbers alone.
 *
 *   maps-lists report [--lang ru]
 */

type Issue = { name: string; reason: string };
export type ReportEntry = {
  list: string;
  created: boolean;
  dryRun?: boolean;
  added: string[];
  alreadyPresent: string[];
  notesWritten: string[];
  notesSkipped?: string[];
  unresolved: Issue[];
  failed: Issue[];
  verify: { ok: boolean; missing: string[]; notesMissing: string[] } | null;
  warnings: string[];
};

const L = {
  en: {
    saved: "Saved", dry: "Dry run", newList: "new list", existing: "existing list",
    added: "Added", wouldAdd: "Would add", already: "Already in list", notes: "Notes written",
    notFound: "Not found", failed: "Failed", verify: "Verify",
    verifyOk: "✅ every place and note found after a hard reload",
    missing: "missing", notesMissing: "notes missing", skipped: "Note not added",
    skippedWhy: "the existing note already says it", warnings: "Warnings",
    open: (list: string) => `Open ${list} in Google Maps`,
  },
  ru: {
    saved: "Сохранено", dry: "Пробный прогон", newList: "новый список", existing: "существующий список",
    added: "Добавлено", wouldAdd: "Будет добавлено", already: "Уже в списке", notes: "Заметок",
    notFound: "Не найдено", failed: "Ошибки", verify: "Проверка",
    verifyOk: "✅ все места и заметки на месте после перезагрузки",
    missing: "нет мест", notesMissing: "нет заметок", skipped: "Заметка не добавлена",
    skippedWhy: "в существующей уже это сказано", warnings: "Предупреждения",
    open: (list: string) => `Открыть «${list}» в Google Картах`,
  },
};

const issues = (xs: Issue[]) => xs.map((x) => `${x.name} (${x.reason})`);
const line = (label: string, items: string[]) =>
  !items.length ? [] : items.length > 5 ? [`**${label}:**`, ...items.map((i) => `- ${i}`)] : [`**${label}:** ${items.join(", ")}`];

export function reportMarkdown(r: ReportEntry, url: string | undefined, lang: "en" | "ru" = "en"): string {
  const t = L[lang];
  const verifyBad = !!r.verify && !r.verify.ok;
  const icon = r.failed.length ? "❌" : verifyBad || r.unresolved.length ? "⚠️" : "✅";
  const out = [
    `## ${icon} ${r.dryRun ? t.dry : t.saved} — ${r.list} · ${r.created ? t.newList : t.existing}`,
    "",
    `| ${r.dryRun ? t.wouldAdd : t.added} | ${t.already} |${r.dryRun ? "" : ` ${t.notes} |`} ${t.notFound} | ${t.failed} |`,
    `|:-:|:-:|${r.dryRun ? "" : ":-:|"}:-:|:-:|`,
    `| ${r.added.length} | ${r.alreadyPresent.length} |${r.dryRun ? "" : ` ${r.notesWritten.length} |`} ${r.unresolved.length} | ${r.failed.length} |`,
    "",
  ];
  if (r.verify) {
    const parts = [
      ...(r.verify.missing.length ? [`${t.missing}: ${r.verify.missing.join(", ")}`] : []),
      ...(r.verify.notesMissing.length ? [`${t.notesMissing}: ${r.verify.notesMissing.join(", ")}`] : []),
    ];
    out.push(`**${t.verify}:** ${r.verify.ok ? t.verifyOk : `⚠️ ${parts.join("; ")}`}`);
  }
  out.push(...line(t.notFound, issues(r.unresolved)), ...line(t.failed, issues(r.failed)));
  if (r.notesSkipped?.length) out.push(`**${t.skipped}:** ${r.notesSkipped.join(", ")} (${t.skippedWhy})`);
  out.push(...line(t.warnings, r.warnings));
  if (url) out.push(`📍 [${t.open(r.list)}](${url})`);
  // Markdown needs two trailing spaces or a blank line to break lines; a blank line reads better.
  return out.join("\n").replace(/\n+(\*\*|📍)/g, "\n\n$1");
}

async function main() {
  const { values } = parseArgs({ options: { lang: { type: "string", default: "en" } } });
  const lang = values.lang === "ru" ? "ru" : "en";
  const reports = JSON.parse(await fs.readFile(`${ARTIFACTS}/report.json`, "utf8")) as ReportEntry[];
  const state = JSON.parse(await fs.readFile(".gmaps-state.json", "utf8").catch(() => "{}")) as {
    lists?: Record<string, { url?: string }>;
  };
  console.log(reports.map((r) => reportMarkdown(r, state.lists?.[r.list]?.url, lang)).join("\n\n---\n\n"));
}

if (import.meta.url === pathToFileURL(process.argv[1]!).href) await main();
