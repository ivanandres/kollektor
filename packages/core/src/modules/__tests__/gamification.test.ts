import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addToCollectionInput } from '@kollektor/schemas';
import { seedAll } from '../../seed/seed';
import { seedLibrary } from '../../testing/library';
import { useCore } from '../../testing/setup';

const h = useCore();
const { ctx } = h;
beforeEach(async () => {
  await h.setup();
  await seedAll(h.db);
});
afterAll(() => h.close());

const add = (input: Record<string, unknown>) =>
  ctx.core.collection.add(ctx.userId, addToCollectionInput.parse(input));

describe('achievements', () => {
  it('unlocks "Primer vinilo" on the first add, once', async () => {
    seedLibrary(ctx.catalog);
    const first = await add({ discogsReleaseId: 1873013 });
    expect(first.unlockedAchievements).toContain('count-1');
    expect(first.unlockedAchievements).toContain('first-pressing'); // original UK 1973 pressing
    const second = await add({ discogsReleaseId: 2000006 });
    expect(second.unlockedAchievements).not.toContain('count-1');
    expect(second.unlockedAchievements).toEqual(
      expect.arrayContaining(['japanese-edition', 'limited-edition', 'colored-vinyl']),
    );
  });

  it('builds a readable activity timeline', async () => {
    seedLibrary(ctx.catalog);
    await add({ discogsReleaseId: 2000002 });
    const feed = await ctx.core.activity.list(ctx.userId);
    expect(feed.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'Agregaste Animals — Pink Floyd a tu colección.',
        'Desbloqueaste «Primer vinilo».',
      ]),
    );
    const page2 = await ctx.core.activity.list(ctx.userId, {
      limit: 1,
      before: feed[0]!.createdAt,
    });
    expect(page2.length).toBeLessThanOrEqual(1);
  });

  it('never revokes unlocked achievements', async () => {
    seedLibrary(ctx.catalog);
    const { item } = await add({ discogsReleaseId: 1873013 });
    await ctx.core.collection.remove(ctx.userId, item.id);
    const list = await ctx.core.achievements.listWithProgress(ctx.userId);
    expect(list.find((a) => a.code === 'count-1')).toMatchObject({
      unlocked: true,
      progress: { current: 0, target: 1 },
    });
  });

  it('reports progress', async () => {
    seedLibrary(ctx.catalog);
    await add({ discogsReleaseId: 1873013 });
    await add({ discogsReleaseId: 2000003 });
    const list = await ctx.core.achievements.listWithProgress(ctx.userId);
    expect(list.find((a) => a.code === 'count-10')?.progress).toEqual({ current: 2, target: 10 });
    expect(list.find((a) => a.code === 'decades-5')?.progress).toEqual({ current: 2, target: 5 });
  });

  it('completes an essential discography matching by title/alias across catalog sources', async () => {
    const lz = [
      ['Led Zeppelin', 1969],
      ['Led Zeppelin II', 1969],
      ['Led Zeppelin III', 1970],
      ['Untitled', 1971],
      ['Houses Of The Holy', 1973],
      ['Physical Graffiti', 1975],
      ['Presence', 1976],
    ] as const;
    lz.forEach(([title, year], i) =>
      ctx.catalog.addRelease({
        id: `lz${i}`,
        artist: 'Led Zeppelin',
        artistId: 'a-lz',
        title,
        year,
        masterId: `m-lz${i}`,
      }),
    );
    for (let i = 0; i < lz.length; i++) {
      const releaseId = await ctx.core.catalog.importFromProvider(`lz${i}`);
      await add({ releaseId });
    }
    let insights = await ctx.core.discovery.insights(ctx.userId);
    expect(insights.find((x) => x.type === 'essential_almost_complete')?.message).toBe(
      'Te falta 1 disco para completar Led Zeppelin.',
    );

    // The last one is entered manually (private catalog row) and still counts.
    const res = await add({
      manual: {
        album: {
          artists: ['Led Zeppelin'],
          title: 'In Through The Out Door',
          originalReleaseYear: 1979,
        },
      },
    });
    expect(res.unlockedAchievements).toEqual(
      expect.arrayContaining(['complete-led-zeppelin', 'completist-1']),
    );
    insights = await ctx.core.discovery.insights(ctx.userId);
    expect(insights.find((x) => x.type === 'essential_complete')?.message).toBe(
      'Completaste los 8 esenciales de Led Zeppelin.',
    );
  });

  it('suggests artists sharing styles with your top artists', async () => {
    seedLibrary(ctx.catalog);
    await add({ discogsReleaseId: 2000003 }); // Love — Psychedelic Rock
    await ctx.core.catalog.importFromProvider('2000005'); // Beatles in shared catalog, not owned
    const insights = await ctx.core.discovery.insights(ctx.userId);
    expect(insights.find((i) => i.type === 'explore_artist')?.message).toBe(
      'Si te gusta Love, quizás quieras explorar The Beatles.',
    );
  });
});
