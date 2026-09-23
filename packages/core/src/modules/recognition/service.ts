import { sql } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { toIsoDate } from '../../lib/dates';
import { DomainError } from '../../lib/errors';
import type { CatalogSearchResult, RecognitionHints, RecognitionImage } from '../../ports';

export type Strategy = 'barcode' | 'catalog_number' | 'artist_title';

export interface IdentifyResult {
  hints: RecognitionHints | null;
  /** Strategies tried, strongest first. */
  strategies: Strategy[];
  /** Always a list to confirm: we never auto-select the first match. */
  candidates: (CatalogSearchResult & { matchedBy: Strategy })[];
  remainingToday: number | null;
}

/**
 * Photo/barcode → candidate editions. Cascade: barcode (exact) → catalog number → artist+title.
 * The user must always pick the right edition from the candidates.
 */
export function recognitionService(deps: CoreDeps) {
  const { db } = deps;
  const dailyLimit = deps.config?.visionDailyLimit ?? 30;

  function provider() {
    if (!deps.catalogProvider) throw new DomainError('NOT_CONFIGURED', 'El catálogo externo no está configurado');
    return deps.catalogProvider;
  }

  /** Atomically consumes one unit of today's quota; throws when exhausted. */
  async function consumeQuota(userId: string): Promise<number> {
    const day = toIsoDate(nowOf(deps));
    const [row] = await db.execute<{ count: number }>(sql`
      INSERT INTO ${schema.usageCounters} (user_id, kind, day, count) VALUES (${userId}, 'vision', ${day}, 1)
      ON CONFLICT (user_id, kind, day) DO UPDATE SET count = ${schema.usageCounters}.count + 1
      RETURNING count`);
    const used = row?.count ?? 1;
    if (used > dailyLimit) {
      throw new DomainError('RATE_LIMITED', `Llegaste al límite de ${dailyLimit} identificaciones por foto de hoy.`);
    }
    return dailyLimit - used;
  }

  async function candidatesFrom(hints: Partial<RecognitionHints>) {
    const p = provider();
    const seen = new Set<string>();
    const out: IdentifyResult['candidates'] = [];
    const strategies: Strategy[] = [];
    const push = (items: CatalogSearchResult[], matchedBy: Strategy) => {
      for (const c of items) {
        if (seen.has(c.externalId)) continue;
        seen.add(c.externalId);
        out.push({ ...c, matchedBy });
      }
    };
    const base = { type: 'release' as const, page: 1, perPage: 20 };
    if (hints.barcode) {
      strategies.push('barcode');
      push((await p.search({ ...base, barcode: hints.barcode.replace(/\D/g, '') })).items, 'barcode');
    }
    if (hints.catalogNumber) {
      strategies.push('catalog_number');
      push((await p.search({ ...base, catalogNumber: hints.catalogNumber, artist: hints.artist ?? undefined })).items, 'catalog_number');
    }
    if (hints.artist || hints.title) {
      strategies.push('artist_title');
      push(
        (await p.search({ ...base, artist: hints.artist ?? undefined, title: hints.title ?? undefined, format: 'Vinyl' })).items,
        'artist_title',
      );
    }
    return { candidates: out.slice(0, 30), strategies };
  }

  /** Barcode read on the device (no vision call, no quota). */
  async function identifyByBarcode(barcode: string): Promise<IdentifyResult> {
    const { candidates, strategies } = await candidatesFrom({ barcode });
    return { hints: null, strategies, candidates, remainingToday: null };
  }

  async function identifyByPhoto(userId: string, images: RecognitionImage[]): Promise<IdentifyResult> {
    if (!deps.recognizer) throw new DomainError('NOT_CONFIGURED', 'El reconocimiento de imágenes no está configurado');
    provider();
    const remainingToday = await consumeQuota(userId);
    const hints = await deps.recognizer.extract(images);
    const { candidates, strategies } = await candidatesFrom(hints);
    return { hints, strategies, candidates, remainingToday };
  }

  return { identifyByBarcode, identifyByPhoto };
}

export type RecognitionService = ReturnType<typeof recognitionService>;
