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
