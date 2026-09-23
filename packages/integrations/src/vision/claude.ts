import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { CoverRecognizer, RecognitionHints, RecognitionImage } from '@kollektor/core';

const HintsSchema = z.object({
  artist: z.string().nullable(),
  title: z.string().nullable(),
  catalog_number: z.string().nullable(),
  label: z.string().nullable(),
  barcode: z.string().nullable(),
  country: z.string().nullable(),
  year: z.number().int().nullable(),
  confidence: z.number(),
});

const SYSTEM = `You identify vinyl records from photos of the front cover, back cover, spine or center label.
Read what is visibly printed; use your knowledge of well-known album art only to fill in artist and title
when the cover has no legible text. Report:
- artist and album title as they are commonly catalogued (e.g. "Pink Floyd", "The Dark Side Of The Moon");
- catalog number exactly as printed (spine, back cover or label), label name, barcode digits, country and
  year only if printed; never guess these edition-specific fields;
- confidence between 0 and 1 for the artist/title identification.
Use null for anything you cannot read or determine.`;

/**
 * Extracts artist/title/catalog hints from record photos with Claude vision + structured outputs.
 * It only returns hints: choosing the exact edition is always the user's decision.
 */
export class ClaudeCoverRecognizer implements CoverRecognizer {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(cfg: { apiKey?: string; model?: string; client?: Anthropic } = {}) {
    this.client = cfg.client ?? new Anthropic(cfg.apiKey ? { apiKey: cfg.apiKey } : {});
    this.model = cfg.model ?? 'claude-opus-5';
  }

  async extract(images: RecognitionImage[]): Promise<RecognitionHints> {
    const empty: RecognitionHints = {
      artist: null,
      title: null,
      catalogNumber: null,
      label: null,
      barcode: null,
      country: null,
      year: null,
      confidence: 0,
    };
    if (images.length === 0) return empty;
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(HintsSchema) },
      messages: [
        {
          role: 'user',
          content: [
            ...images.slice(0, 3).map((img) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
            })),
            { type: 'text' as const, text: 'Identify this record.' },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) return empty;
    const h = response.parsed_output;
    return {
      artist: h.artist?.trim() || null,
      title: h.title?.trim() || null,
      catalogNumber: h.catalog_number?.trim() || null,
      label: h.label?.trim() || null,
      barcode: h.barcode?.replace(/\D/g, '') || null,
      country: h.country?.trim() || null,
      year: h.year ?? null,
      confidence: Math.max(0, Math.min(1, h.confidence)),
    };
  }
}
