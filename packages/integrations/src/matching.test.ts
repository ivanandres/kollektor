import { describe, expect, it } from 'vitest';
import { coreTitle, scoreMatch } from './matching';
import { CurrencyApiFx, ChainFx, FrankfurterFx } from './fx/providers';

describe('track matching', () => {
  it('strips remaster/version suffixes', () => {
    expect(coreTitle('Money - 2011 Remastered Version')).toBe('money');
    expect(coreTitle('Time (2023 Remaster)')).toBe('time');
  });
  it('scores exact title + artist + duration high, live versions and wrong songs low', () => {
    const want = { title: 'Money', artist: 'Pink Floyd', durationSeconds: 382 };
    expect(
      scoreMatch(want, {
        title: 'Money - 2011 Remastered Version',
        artists: ['Pink Floyd'],
        durationSeconds: 383,
      }),
    ).toBe(1);
    expect(
      scoreMatch(want, { title: 'Money (Live)', artists: ['Pink Floyd'], durationSeconds: 500 }),
    ).toBeLessThan(0.6);
    expect(
      scoreMatch(want, { title: 'Money', artists: ['The Flying Lizards'], durationSeconds: 150 }),
    ).toBeLessThan(0.6);
    expect(scoreMatch(want, { title: 'Breathe', artists: ['Pink Floyd'] })).toBe(0);
  });
});

describe('fx providers', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
  it('falls back to currency-api (which covers ARS) when Frankfurter has no rate', async () => {
    const f = (async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('frankfurter')) return json({ message: 'not found' }, 404);
      if (u.includes('jsdelivr')) return json({ date: '2026-01-05', ars: { usd: 0.00071 } });
      return json({}, 404);
    }) as typeof fetch;
    const fx = new ChainFx([new FrankfurterFx({ fetch: f }), new CurrencyApiFx({ fetch: f })]);
    expect(await fx.getRate('ARS', 'USD', '2026-01-05')).toBe(0.00071);
    expect(await fx.getRate('ARS', 'XXX', '2026-01-05')).toBeNull();
  });
});
