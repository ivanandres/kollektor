import { and, desc, eq, lte } from 'drizzle-orm';
import { schema } from '@kollektor/db';
import type { CoreDeps } from '../../context';
import { nowOf } from '../../context';
import { toIsoDate } from '../../lib/dates';
import { round2 } from '../../lib/money';

const { fxRates } = schema;

/** Converts amounts between currencies using cached daily rates (fx_rates) + an FX provider. */
export function currencyService(deps: CoreDeps) {
  const { db } = deps;

  async function getRate(base: string, quote: string, date: string): Promise<number | null> {
    if (base === quote) return 1;
    const [cached] = await db
      .select({ rate: fxRates.rate })
      .from(fxRates)
      .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), eq(fxRates.date, date)));
    if (cached) return cached.rate;

    let rate: number | null;
    try {
      rate = await deps.fx.getRate(base, quote, date);
    } catch {
      rate = null;
    }
    if (rate != null && Number.isFinite(rate) && rate > 0) {
      await db
        .insert(fxRates)
        .values({ date, base, quote, rate, source: deps.fx.source })
        .onConflictDoNothing();
      return rate;
    }
    // Provider unavailable: fall back to the most recent cached rate before that date.
    const [previous] = await db
      .select({ rate: fxRates.rate })
      .from(fxRates)
      .where(and(eq(fxRates.base, base), eq(fxRates.quote, quote), lte(fxRates.date, date)))
      .orderBy(desc(fxRates.date))
      .limit(1);
    return previous?.rate ?? null;
  }

  /** Returns null when no rate is available (the caller decides how to degrade). */
  async function convert(
    amount: number,
    from: string,
    to: string,
    date?: string | null,
  ): Promise<number | null> {
    if (from === to) return round2(amount);
    const today = toIsoDate(nowOf(deps));
    const onDate = date && date <= today ? date : today;
    const rate = await getRate(from, to, onDate);
    return rate == null ? null : round2(amount * rate);
  }

  return { getRate, convert };
}

export type CurrencyService = ReturnType<typeof currencyService>;
