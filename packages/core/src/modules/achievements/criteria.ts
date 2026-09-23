import { z } from 'zod';

/** Declarative, data-driven achievement rules (stored as JSON in achievements.criteria). */
export const criteriaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('count'), min: z.number().int().positive() }),
  z.object({
    type: z.literal('distinct'),
    field: z.enum(['artist', 'genre', 'style', 'decade', 'country', 'label']),
    min: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('has_release'),
    where: z
      .object({
        country: z.array(z.string()).optional(),
        formatDescription: z.array(z.string()).optional(),
        editionType: z.array(z.string()).optional(),
        firstPressing: z.literal(true).optional(),
        coloredVinyl: z.literal(true).optional(),
      })
      .refine((w) => Object.keys(w).length > 0),
    min: z.number().int().positive().default(1),
  }),
  z.object({ type: z.literal('essential_list'), listCode: z.string() }),
  z.object({ type: z.literal('essential_lists_completed'), min: z.number().int().positive() }),
]);

export type Criteria = z.infer<typeof criteriaSchema>;
