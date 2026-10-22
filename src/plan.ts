import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";

/**
 * plan.json — the contract between Claude (parses, resolves, asks you) and the executor (clicks).
 * Claude should prefer `url` (a resolved /maps/place/ link). `query` is a fallback: the executor
 * only accepts it when the search lands on a single place page, otherwise the place is "unresolved".
 */
export const PlaceSchema = z
  .object({
    name: z.string().min(1),
    url: z
      .string()
      .url()
      .refine((u) => /^https:\/\/(www\.)?google\.[a-z.]+\/maps\/(place|search)\//.test(u), {
        message: "`url` must be a Google Maps /maps/place/ (or /maps/search/) link",
      })
      .optional(),
    query: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .refine((p) => p.url || p.query, { message: "each place needs `url` or `query`" });

/** Maps cuts list names at 40 characters, and the executor then can't find the list it created. */
export const MAX_LIST_NAME = 40;

export const ListSchema = z.object({
  name: z.string().min(1).max(MAX_LIST_NAME, `Maps cuts list names at ${MAX_LIST_NAME} characters; shorten it`),
  emoji: z.string().optional(),
  /** Opt-in: save strictly in array order (index 0 = rank 1) and verify the display order. */
  ordered: z.boolean().default(false),
  places: z.array(PlaceSchema).min(1),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  lists: z
    .array(ListSchema)
    .min(1)
    .refine((ls) => new Set(ls.map((l) => l.name)).size === ls.length, { message: "list names must be unique" }),
});

export type Place = z.infer<typeof PlaceSchema>;
export type ListPlan = z.infer<typeof ListSchema>;
export type Plan = z.infer<typeof PlanSchema>;

/** `maps-lists check-plan plan.json`: validates a plan file, prints every problem, exit 1 if invalid. */
async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "plan.json";
  const text = await fs.readFile(file, "utf8").catch(() => {
    console.error(`No plan at ${file} (relative to ${process.cwd()})`);
    process.exit(1);
  });
  const parsed = PlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    for (const i of parsed.error.issues) console.error(`${i.path.join(".") || "(root)"}: ${i.message}`);
    process.exit(1);
  }
  console.log(`ok: ${parsed.data.lists.map((l) => `${l.name} (${l.places.length})`).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
