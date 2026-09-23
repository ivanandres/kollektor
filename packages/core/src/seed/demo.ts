/**
 * Demo data for UI/design work: a demo user with a realistic collection, wishlist, prices and
 * history. Catalog rows use source "demo" (not Discogs ids) and are clearly fictional where
 * edition details are concerned.
 */
import { sql } from 'drizzle-orm';
import { schema, type Database } from '@kollektor/db';
import type { ExternalRelease, FxRateProvider } from '../ports';
import { createCore } from '../index';
import { seedAll } from './seed';

type Row = [
  artist: string,
  title: string,
  year: number,
  country: string,
  label: string,
  genres: string[],
  styles: string[],
  tracks: string[],
  opts?: {
    editionYear?: number;
    descriptions?: string[];
    color?: string;
    paid?: [number, string];
    value?: number;
    condition?: string;
    bought?: string;
  },
];

const LIBRARY: Row[] = [
  [
    'Pink Floyd',
    'The Dark Side of the Moon',
    1973,
    'UK',
    'Harvest',
    ['Rock'],
    ['Prog Rock', 'Psychedelic Rock'],
    [
      'Speak to Me',
      'Breathe',
      'On the Run',
      'Time',
      'The Great Gig in the Sky',
      'Money',
      'Us and Them',
      'Any Colour You Like',
      'Brain Damage',
      'Eclipse',
    ],
    { paid: [120, 'USD'], value: 310, condition: 'VG+', bought: '2024-03-12' },
  ],
  [
    'Pink Floyd',
    'Wish You Were Here',
    1975,
    'UK',
    'Harvest',
    ['Rock'],
    ['Prog Rock'],
    [
      'Shine On You Crazy Diamond (Parts I–V)',
      'Welcome to the Machine',
      'Have a Cigar',
      'Wish You Were Here',
      'Shine On You Crazy Diamond (Parts VI–IX)',
    ],
    { paid: [95000, 'ARS'], value: 140, condition: 'VG+', bought: '2025-06-02' },
  ],
  [
    'Pink Floyd',
    'Animals',
    1977,
    'Argentina',
    'EMI',
    ['Rock'],
    ['Prog Rock'],
    [
      'Pigs on the Wing (Part One)',
      'Dogs',
      'Pigs (Three Different Ones)',
      'Sheep',
      'Pigs on the Wing (Part Two)',
    ],
    { paid: [60000, 'ARS'], value: 85, condition: 'VG', bought: '2025-09-20' },
  ],
  [
    'Pink Floyd',
    'The Wall',
    1979,
    'UK',
    'Harvest',
    ['Rock'],
    ['Prog Rock', 'Art Rock'],
    ['In the Flesh?', 'Another Brick in the Wall, Part 2', 'Mother', 'Hey You', 'Comfortably Numb'],
    {
      descriptions: ['2×LP', 'Album', 'Gatefold'],
      paid: [70, 'USD'],
      value: 95,
      condition: 'NM',
      bought: '2024-11-30',
    },
  ],
  [
    'The Beatles',
    'Revolver',
    1966,
    'UK',
    'Parlophone',
    ['Rock', 'Pop'],
    ['Psychedelic Rock', 'Pop Rock'],
    [
      'Taxman',
      'Eleanor Rigby',
      "I'm Only Sleeping",
      'Here, There and Everywhere',
      'Yellow Submarine',
      'Tomorrow Never Knows',
    ],
    { paid: [150, 'USD'], value: 260, condition: 'VG', bought: '2024-05-18' },
  ],
  [
    'The Beatles',
    'Abbey Road',
    1969,
    'UK',
    'Apple Records',
    ['Rock', 'Pop'],
    ['Pop Rock'],
    [
      'Come Together',
      'Something',
      "Maxwell's Silver Hammer",
      'Oh! Darling',
      'Here Comes the Sun',
      'Because',
      'The End',
    ],
    { paid: [110, 'EUR'], value: 180, condition: 'VG+', bought: '2025-02-14' },
  ],
  [
    'The Beatles',
    'Rubber Soul',
    1965,
    'Japan',
    'Odeon',
    ['Rock', 'Pop'],
    ['Pop Rock', 'Folk Rock'],
    ['Drive My Car', 'Norwegian Wood (This Bird Has Flown)', 'Michelle', 'In My Life'],
    {
      editionYear: 1976,
      descriptions: ['LP', 'Album', 'Reissue'],
      color: 'Red',
      paid: [85, 'USD'],
      value: 120,
      condition: 'NM',
      bought: '2025-10-05',
    },
  ],
  [
    'Led Zeppelin',
    'Led Zeppelin II',
    1969,
    'UK',
    'Atlantic',
    ['Rock'],
    ['Hard Rock', 'Blues Rock'],
    [
      'Whole Lotta Love',
      'What Is and What Should Never Be',
      'The Lemon Song',
      'Heartbreaker',
      'Ramble On',
      'Moby Dick',
    ],
    { paid: [90, 'USD'], value: 140, condition: 'VG+', bought: '2024-07-07' },
  ],
  [
    'Led Zeppelin',
    'Led Zeppelin IV',
    1971,
    'UK',
    'Atlantic',
    ['Rock'],
    ['Hard Rock'],
    [
      'Black Dog',
      'Rock and Roll',
      'The Battle of Evermore',
      'Stairway to Heaven',
      'Misty Mountain Hop',
      'When the Levee Breaks',
    ],
    { paid: [100, 'USD'], value: 150, condition: 'VG', bought: '2025-01-22' },
  ],
  [
    'Led Zeppelin',
    'Houses of the Holy',
    1973,
    'US',
    'Atlantic',
    ['Rock'],
    ['Hard Rock'],
    ['The Song Remains the Same', 'The Rain Song', 'Over the Hills and Far Away', 'D’yer Mak’er'],
    { paid: [45, 'USD'], value: 60, condition: 'VG+', bought: '2026-02-11' },
  ],
  [
    'David Bowie',
    'Hunky Dory',
    1971,
    'UK',
    'RCA Victor',
    ['Rock'],
    ['Glam', 'Art Rock'],
    ['Changes', 'Oh! You Pretty Things', 'Life on Mars?', 'Quicksand', 'Queen Bitch'],
    { paid: [80, 'USD'], value: 115, condition: 'VG+', bought: '2024-09-01' },
  ],
  [
    'David Bowie',
    'The Rise and Fall of Ziggy Stardust and the Spiders from Mars',
    1972,
    'UK',
    'RCA Victor',
    ['Rock'],
    ['Glam'],
    ['Five Years', 'Starman', 'Ziggy Stardust', 'Suffragette City', 'Rock ’n’ Roll Suicide'],
    { paid: [130, 'USD'], value: 175, condition: 'NM', bought: '2025-04-19' },
  ],
  [
    'David Bowie',
    'Blackstar',
    2016,
    'Europe',
    'ISO Records',
    ['Jazz', 'Rock'],
    ['Art Rock', 'Experimental'],
    ['★', "'Tis a Pity She Was a Whore", 'Lazarus', 'Dollar Days', "I Can't Give Everything Away"],
    { paid: [35, 'USD'], value: 40, condition: 'M', bought: '2026-01-10' },
  ],
  [
    'Miles Davis',
    'Kind of Blue',
    1959,
    'US',
    'Columbia',
    ['Jazz'],
    ['Modal', 'Cool Jazz'],
    ['So What', 'Freddie Freeloader', 'Blue in Green', 'All Blues', 'Flamenco Sketches'],
    { paid: [200, 'USD'], value: 420, condition: 'VG', bought: '2024-12-24' },
  ],
  [
    'Miles Davis',
    'Bitches Brew',
    1970,
    'US',
    'Columbia',
    ['Jazz'],
    ['Fusion'],
    ['Pharaoh’s Dance', 'Bitches Brew', 'Spanish Key', 'Miles Runs the Voodoo Down'],
    {
      descriptions: ['2×LP', 'Album'],
      paid: [60, 'USD'],
      value: 90,
      condition: 'VG+',
      bought: '2025-08-08',
    },
  ],
  [
    'John Coltrane',
    'A Love Supreme',
    1965,
    'US',
    'Impulse!',
    ['Jazz'],
    ['Free Jazz', 'Modal'],
    ['Acknowledgement', 'Resolution', 'Pursuance', 'Psalm'],
    { paid: [55, 'USD'], value: 70, condition: 'NM', bought: '2025-05-30' },
  ],
  [
    'John Coltrane',
    'Blue Train',
    1957,
    'Japan',
    'Blue Note',
    ['Jazz'],
    ['Hard Bop'],
    ['Blue Train', 'Moment’s Notice', 'Locomotion', 'I’m Old Fashioned', 'Lazy Bird'],
    {
      editionYear: 1983,
      descriptions: ['LP', 'Album', 'Reissue', 'Limited Edition'],
      paid: [65, 'USD'],
      value: 95,
      condition: 'NM',
      bought: '2026-03-03',
    },
  ],
  [
    'Radiohead',
    'OK Computer',
    1997,
    'UK',
    'Parlophone',
    ['Electronic', 'Rock'],
    ['Alternative Rock', 'Art Rock'],
    ['Airbag', 'Paranoid Android', 'Karma Police', 'No Surprises', 'Lucky'],
    {
      descriptions: ['2×LP', 'Album'],
      paid: [40, 'USD'],
      value: 55,
      condition: 'NM',
      bought: '2024-02-02',
    },
  ],
  [
    'Radiohead',
    'In Rainbows',
    2007,
    'UK',
    'XL Recordings',
    ['Electronic', 'Rock'],
    ['Alternative Rock'],
    ['15 Step', 'Nude', 'Weird Fishes/Arpeggi', 'Reckoner', 'Videotape'],
    { paid: [30, 'USD'], value: 35, condition: 'M', bought: '2025-11-11' },
  ],
  [
    'Fleetwood Mac',
    'Rumours',
    1977,
    'US',
    'Warner Bros. Records',
    ['Rock'],
    ['Pop Rock', 'Soft Rock'],
    ['Second Hand News', 'Dreams', 'Go Your Own Way', 'The Chain', 'Songbird'],
    { paid: [25, 'USD'], value: 30, condition: 'VG', bought: '2024-04-04' },
  ],
  [
    'Love',
    'Forever Changes',
    1967,
    'US',
    'Elektra',
    ['Rock'],
    ['Psychedelic Rock', 'Folk Rock'],
    [
      'Alone Again Or',
      'A House Is Not a Motel',
      'Andmoreagain',
      'The Red Telephone',
      'You Set the Scene',
    ],
    { paid: [70, 'USD'], value: 110, condition: 'VG+', bought: '2025-07-15' },
  ],
  [
    'Charly García',
    'Clics Modernos',
    1983,
    'Argentina',
    'Interdisc',
    ['Rock', 'Pop'],
    ['New Wave', 'Pop Rock'],
    ['Nos siguen pegando abajo', 'No me dejan salir', 'Los dinosaurios', 'Plateado sobre plateado'],
    { paid: [80000, 'ARS'], value: 90, condition: 'VG+', bought: '2025-03-08' },
  ],
  [
    'Charly García',
    'Yendo de la Cama al Living',
    1982,
    'Argentina',
    'SG Discos',
    ['Rock'],
    ['Pop Rock'],
    ['Yendo de la cama al living', 'No bombardeen Buenos Aires', 'Peluca telefónica'],
    { paid: [65000, 'ARS'], value: 75, condition: 'VG', bought: '2025-12-20' },
  ],
  [
    'Sui Generis',
    'Confesiones de Invierno',
    1973,
    'Argentina',
    'Talent',
    ['Rock'],
    ['Folk Rock'],
    ['Cuando ya me empiece a quedar solo', 'Confesiones de invierno', 'Rasguña las piedras'],
    { paid: [120000, 'ARS'], value: 160, condition: 'VG', bought: '2026-04-27' },
  ],
  [
    'Soda Stereo',
    'Canción Animal',
    1990,
    'Argentina',
    'CBS',
    ['Rock'],
    ['Pop Rock'],
    ['(En) El séptimo día', 'Canción animal', 'De música ligera', 'Un millón de años luz'],
    { paid: [150000, 'ARS'], value: 190, condition: 'VG+', bought: '2026-06-14' },
  ],
  [
    'Nirvana',
    'Nevermind',
    1991,
    'US',
    'DGC',
    ['Rock'],
    ['Grunge'],
    ['Smells Like Teen Spirit', 'In Bloom', 'Come as You Are', 'Lithium', 'Something in the Way'],
    {
      descriptions: ['LP', 'Album', 'Picture Disc'],
      paid: [50, 'USD'],
      value: 65,
      condition: 'NM',
      bought: '2026-08-01',
    },
  ],
];

const WISHLIST: [string, string, number, string, string[], string[], number][] = [
  ['Pink Floyd', 'Meddle', 1971, 'UK', ['Rock'], ['Prog Rock'], 1],
  ['Led Zeppelin', 'Physical Graffiti', 1975, 'UK', ['Rock'], ['Hard Rock'], 2],
  ['Miles Davis', 'In a Silent Way', 1969, 'US', ['Jazz'], ['Fusion'], 2],
  ['Spinetta Jade', 'Bajo Belgrano', 1983, 'Argentina', ['Rock', 'Jazz'], ['Fusion'], 1],
];

/** Fixed demo exchange rates so the seed works offline. */
class DemoFx implements FxRateProvider {
  readonly source = 'demo';
  private readonly toUsd: Record<string, number> = { USD: 1, EUR: 1.1, ARS: 0.001 };
  async getRate(base: string, quote: string) {
    const b = this.toUsd[base];
    const q = this.toUsd[quote];
    return b && q ? b / q : null;
  }
}

function toRelease(i: number, r: Row): ExternalRelease {
  const [artist, title, year, country, label, genres, styles, tracks, o = {}] = r;
  const discs = (o.descriptions ?? []).find((d) => /^\d×LP$/.test(d));
  return {
    source: 'demo',
    externalId: `demo-r${i}`,
    url: null,
    title,
    artists: [{ externalId: `demo-a-${artist}`, name: artist }],
    year: o.editionYear ?? year,
    releaseDate: null,
    country,
    genres,
    styles,
    labels: [{ externalId: `demo-l-${label}`, name: label, catalogNumber: null }],
    formats: [
      {
        name: 'Vinyl',
        qty: discs ? Number(discs[0]) : 1,
        descriptions: [
          ...(o.descriptions ?? ['LP', 'Album']).filter((d) => d !== discs),
          '12"',
          '33 ⅓ RPM',
        ],
        text: o.color ?? null,
      },
    ],
    formatSummary: ['Vinyl', ...(o.descriptions ?? ['LP', 'Album']), o.color]
      .filter(Boolean)
      .join(', '),
    barcodes: [],
    tracklist: tracks.map((t, n) => {
      const perSide = Math.ceil(tracks.length / 2);
      const side = n < perSide ? 'A' : 'B';
      return {
        position: `${side}${n < perSide ? n + 1 : n - perSide + 1}`,
        title: t,
        durationSeconds: null,
        artistCredit: null,
      };
    }),
    images: [],
    notes: 'Datos de demostración.',
    masterId: `demo-m${i}`,
    community: { have: null, want: null },
    lowestPrice: null,
    numForSale: null,
  };
}

export async function seedDemo(db: Database, opts: { userId: string }) {
  await seedAll(db);
  const core = createCore({ db, fx: new DemoFx() });
  const { userId } = opts;
  await core.profiles.ensureProfile(userId);
  const releaseIds: string[] = [];
  for (const [i, row] of LIBRARY.entries()) {
    const ext = toRelease(i, row);
    const releaseId = await core.catalog.importExternalRelease(ext, {
      source: 'demo',
      externalId: ext.masterId!,
      url: null,
      title: row[1],
      artists: ext.artists,
      year: row[2],
      genres: row[5],
      styles: row[6],
      mainReleaseId: ext.externalId,
      images: [],
    });
    releaseIds.push(releaseId);
    const o = row[8] ?? {};
    const [existing] = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM ${schema.priceSnapshots} WHERE release_id = ${releaseId} AND source = 'demo'`,
    );
    if (o.value && !existing?.n)
      await db
        .insert(schema.priceSnapshots)
        .values({ releaseId, source: 'demo', kind: 'median', price: o.value, currency: 'USD' });
    await core.collection.add(userId, {
      releaseId,
      clientRequestId: `demo-${i}`,
      purchasePrice: o.paid?.[0],
      purchaseCurrency: o.paid?.[1],
      purchaseDate: o.bought,
      conditionMedia: (o.condition ?? 'VG+') as never,
      conditionSleeve: 'VG' as never,
      storageLocation: `Estante ${1 + (i % 4)}`,
      tags: i % 5 === 0 ? ['favoritos'] : [],
    });
  }
  // Spread "added" dates over the purchase dates so the timeline charts look real.
  await db.execute(sql`UPDATE ${schema.collectionItems} SET created_at = purchase_date::timestamptz + interval '18 hours'
    WHERE user_id = ${userId} AND purchase_date IS NOT NULL`);
  for (const [i, [artist, title, year, country, genres, styles, priority]] of WISHLIST.entries()) {
    const ext = toRelease(100 + i, [artist, title, year, country, 'Demo', genres, styles, []]);
    const releaseId = await core.catalog.importExternalRelease(ext);
    await core.wishlist.add(userId, {
      releaseId,
      priority,
      targetPrice: 60,
      targetCurrency: 'USD',
      clientRequestId: `demo-w${i}`,
    });
  }
  // Value history: a few monthly points ending today.
  const summary = await core.stats.summary(userId);
  for (let m = 6; m >= 1; m--) {
    const date = new Date();
    date.setUTCMonth(date.getUTCMonth() - m);
    const f = 1 - m * 0.06;
    await db
      .insert(schema.collectionValueSnapshots)
      .values({
        userId,
        capturedOn: date.toISOString().slice(0, 10),
        itemCount: Math.round(summary.items * f),
        totalInvested: summary.invested * f,
        totalEstimated: summary.estimated * (f - 0.03),
        currency: 'USD',
      })
      .onConflictDoNothing();
  }
  await core.valuation.snapshotCollection(userId);
  return { wishlist: WISHLIST.length, ...(await core.stats.summary(userId)) };
}
