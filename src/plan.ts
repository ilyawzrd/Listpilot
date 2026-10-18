import { z } from "zod";

/**
 * plan.json — the contract between Claude (parses, resolves, asks you) and the executor (clicks).
 * Claude should prefer `url` (a resolved /maps/place/ link). `query` is a fallback: the executor
 * only accepts it when the search lands on a single place page, otherwise the place is "unresolved".
 */
export const PlaceSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().url().optional(),
    query: z.string().min(1).optional(),
    note: z.string().optional(),
  })
  .refine((p) => p.url || p.query, { message: "each place needs `url` or `query`" });

export const ListSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  /** Opt-in: save strictly in array order (index 0 = rank 1) and verify the display order. */
  ordered: z.boolean().default(false),
  places: z.array(PlaceSchema).min(1),
});

export const PlanSchema = z.object({
  version: z.literal(1),
  lists: z.array(ListSchema).min(1),
});

export type Place = z.infer<typeof PlaceSchema>;
export type ListPlan = z.infer<typeof ListSchema>;
export type Plan = z.infer<typeof PlanSchema>;
