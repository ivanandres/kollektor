/**
 * Curated "essential discographies". Deliberately not "every release ever": a short list of
 * studio albums that define each artist. Editable and versioned here in the repo.
 */
export interface EssentialListDef {
  code: string;
  artist: string;
  name: string;
  albums: { title: string; year: number; aliases?: string[] }[];
}

export const ESSENTIAL_LISTS: EssentialListDef[] = [
  {
    code: 'led-zeppelin',
    artist: 'Led Zeppelin',
    name: 'Led Zeppelin — álbumes de estudio',
    albums: [
      { title: 'Led Zeppelin', year: 1969 },
      { title: 'Led Zeppelin II', year: 1969 },
      { title: 'Led Zeppelin III', year: 1970 },
      { title: 'Led Zeppelin IV', year: 1971, aliases: ['Untitled', 'Four Symbols', 'Zoso'] },
      { title: 'Houses of the Holy', year: 1973 },
      { title: 'Physical Graffiti', year: 1975 },
      { title: 'Presence', year: 1976 },
      { title: 'In Through the Out Door', year: 1979 },
    ],
  },
  {
    code: 'pink-floyd',
    artist: 'Pink Floyd',
    name: 'Pink Floyd — esenciales',
    albums: [
      { title: 'The Piper at the Gates of Dawn', year: 1967 },
      { title: 'A Saucerful of Secrets', year: 1968 },
      { title: 'Atom Heart Mother', year: 1970 },
      { title: 'Meddle', year: 1971 },
      { title: 'The Dark Side of the Moon', year: 1973 },
      { title: 'Wish You Were Here', year: 1975 },
      { title: 'Animals', year: 1977 },
      { title: 'The Wall', year: 1979 },
    ],
  },
  {
    code: 'the-beatles',
    artist: 'The Beatles',
    name: 'The Beatles — discografía británica',
    albums: [
      { title: 'Please Please Me', year: 1963 },
      { title: 'With the Beatles', year: 1963 },
      { title: "A Hard Day's Night", year: 1964 },
      { title: 'Beatles for Sale', year: 1964 },
      { title: 'Help!', year: 1965 },
      { title: 'Rubber Soul', year: 1965 },
      { title: 'Revolver', year: 1966 },
      { title: "Sgt. Pepper's Lonely Hearts Club Band", year: 1967 },
      { title: 'Magical Mystery Tour', year: 1967 },
      { title: 'The Beatles', year: 1968, aliases: ['White Album', 'The White Album'] },
      { title: 'Yellow Submarine', year: 1969 },
      { title: 'Abbey Road', year: 1969 },
      { title: 'Let It Be', year: 1970 },
    ],
  },
  {
    code: 'david-bowie',
    artist: 'David Bowie',
    name: 'David Bowie — esenciales',
    albums: [
      { title: 'Hunky Dory', year: 1971 },
      { title: 'The Rise and Fall of Ziggy Stardust and the Spiders from Mars', year: 1972 },
      { title: 'Aladdin Sane', year: 1973 },
      { title: 'Station to Station', year: 1976 },
      { title: 'Low', year: 1977 },
      { title: '"Heroes"', year: 1977, aliases: ['Heroes'] },
      { title: 'Scary Monsters (And Super Creeps)', year: 1980, aliases: ['Scary Monsters'] },
      { title: 'Blackstar', year: 2016, aliases: ['★'] },
    ],
  },
  {
    code: 'miles-davis',
    artist: 'Miles Davis',
    name: 'Miles Davis — esenciales',
    albums: [
      { title: 'Birth of the Cool', year: 1957 },
      { title: "'Round About Midnight", year: 1957, aliases: ['Round About Midnight', 'Round Midnight'] },
      { title: 'Milestones', year: 1958 },
      { title: 'Kind of Blue', year: 1959 },
      { title: 'Sketches of Spain', year: 1960 },
      { title: 'E.S.P.', year: 1965, aliases: ['ESP'] },
      { title: 'Miles Smiles', year: 1967 },
      { title: 'In a Silent Way', year: 1969 },
      { title: 'Bitches Brew', year: 1970 },
    ],
  },
  {
    code: 'radiohead',
    artist: 'Radiohead',
    name: 'Radiohead — álbumes de estudio',
    albums: [
      { title: 'Pablo Honey', year: 1993 },
      { title: 'The Bends', year: 1995 },
      { title: 'OK Computer', year: 1997 },
      { title: 'Kid A', year: 2000 },
      { title: 'Amnesiac', year: 2001 },
      { title: 'Hail to the Thief', year: 2003 },
      { title: 'In Rainbows', year: 2007 },
      { title: 'The King of Limbs', year: 2011 },
      { title: 'A Moon Shaped Pool', year: 2016 },
    ],
  },
  {
    code: 'charly-garcia',
    artist: 'Charly García',
    name: 'Charly García — trilogía de los 80 y más',
    albums: [
      { title: 'Yendo de la Cama al Living', year: 1982 },
      { title: 'Clics Modernos', year: 1983 },
      { title: 'Piano Bar', year: 1984 },
      { title: 'Parte de la Religión', year: 1987 },
    ],
  },
];
