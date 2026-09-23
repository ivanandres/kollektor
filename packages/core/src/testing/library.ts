import type { FakeCatalog } from './fakes';

/** A small, realistic catalog used across tests. */
export function seedLibrary(c: FakeCatalog) {
  return {
    dsotmUk: c.addRelease({
      id: '1873013', artist: 'Pink Floyd', title: 'The Dark Side Of The Moon', year: 1973, masterId: '10362',
      country: 'UK', labels: [{ name: 'Harvest', catno: 'SHVL 804' }, { name: 'EMI', catno: 'SHVL 804' }],
      genres: ['Rock'], styles: ['Prog Rock', 'Psychedelic Rock'], barcode: null, lowestPrice: 300,
      tracks: [['A1', 'Speak To Me', '1:30'], ['A2', 'Breathe', '2:43'], ['A3', 'On The Run', '3:36'], ['A4', 'Time', '7:01'],
        ['A5', 'The Great Gig In The Sky', '4:36'], ['B1', 'Money', '6:22'], ['B2', 'Us And Them', '7:46'],
        ['B3', 'Any Colour You Like', '3:25'], ['B4', 'Brain Damage', '3:48'], ['B5', 'Eclipse', '2:03']],
    }),
    dsotmJp: c.addRelease({
      id: '2000001', artist: 'Pink Floyd', title: 'The Dark Side Of The Moon', year: 1973, masterId: '10362',
      country: 'Japan', labels: [{ name: 'Odeon', catno: 'EMS-80324' }], genres: ['Rock'], styles: ['Prog Rock'],
      formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album', '12"'], text: null }],
      tracks: [['A1', 'Speak To Me'], ['B1', 'Money']],
    }),
    animals: c.addRelease({
      id: '2000002', artist: 'Pink Floyd', title: 'Animals', year: 1977, masterId: '10414', country: 'UK',
      labels: [{ name: 'Harvest', catno: 'SHVL 815' }], styles: ['Prog Rock'],
      tracks: [['A1', 'Pigs On The Wing 1'], ['A2', 'Dogs'], ['B1', 'Pigs (Three Different Ones)'], ['B2', 'Sheep']],
    }),
    foreverChanges: c.addRelease({
      id: '2000003', artist: 'Love', title: 'Forever Changes', year: 1967, masterId: '47680', country: 'US',
      labels: [{ name: 'Elektra', catno: 'EKS-74013' }], genres: ['Rock'], styles: ['Psychedelic Rock', 'Folk Rock'],
      tracks: [['A1', 'Alone Again Or'], ['A2', 'A House Is Not A Motel']],
    }),
    imagine: c.addRelease({
      id: '2000004', artist: 'John Lennon', title: 'Imagine', year: 1971, masterId: '4745', country: 'UK',
      labels: [{ name: 'Apple Records', catno: 'PAS 10004' }], genres: ['Rock', 'Pop'], styles: ['Pop Rock'],
      tracks: [['A1', 'Imagine'], ['A2', 'Crippled Inside'], ['B1', 'Oh My Love']],
    }),
    magical: c.addRelease({
      id: '2000005', artist: 'The Beatles', title: 'Magical Mystery Tour', year: 1967, masterId: '46402', country: 'US',
      labels: [{ name: 'Capitol Records', catno: 'SMAL 2835' }], genres: ['Rock', 'Pop'], styles: ['Psychedelic Rock'],
      tracks: [['A1', 'Magical Mystery Tour'], ['B5', 'All You Need Is Love']],
    }),
    kindOfBlue: c.addRelease({
      id: '2000006', artist: 'Miles Davis', title: 'Kind Of Blue', year: 1959, masterId: '5460', country: 'Japan',
      masterYear: 1959, labels: [{ name: 'CBS/Sony', catno: '20AP 1401' }], genres: ['Jazz'], styles: ['Modal', 'Cool Jazz'],
      formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album', 'Reissue', 'Limited Edition'], text: 'Red' }],
      tracks: [['A1', 'So What'], ['A2', 'Freddie Freeloader'], ['A3', 'Blue In Green']],
    }),
    ledZep: c.addRelease({
      id: '2000007', artist: 'Led Zeppelin', title: 'Led Zeppelin II', year: 1969, masterId: '7004', country: 'UK',
      labels: [{ name: 'Atlantic', catno: '588198' }], styles: ['Hard Rock', 'Blues Rock'],
      tracks: [['A1', 'Whole Lotta Love'], ['A2', 'What Is And What Should Never Be']],
    }),
  };
}
