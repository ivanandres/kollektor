import type { Criteria } from '../modules/achievements/criteria';

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: 'coleccion' | 'diversidad' | 'tiempo' | 'artistas' | 'paises' | 'rareza' | 'discografias';
  tier: number;
  criteria: Criteria;
}

const counts: [number, string, string][] = [
  [1, 'Primer vinilo', 'Agregaste tu primer disco.'],
  [10, '10 discos', 'Llegaste a 10 vinilos.'],
  [50, '50 discos', 'Llegaste a 50 vinilos.'],
  [100, '100 discos', 'Llegaste a 100 vinilos.'],
  [250, '250 discos', 'Llegaste a 250 vinilos.'],
  [500, '500 discos', 'Llegaste a 500 vinilos.'],
];

export const ACHIEVEMENTS: AchievementDef[] = [
  ...counts.map(([min, name, description], i): AchievementDef => ({
    code: `count-${min}`, name, description, icon: 'disc', category: 'coleccion', tier: i + 1, criteria: { type: 'count', min },
  })),
  ...[5, 10, 20].map((min, i): AchievementDef => ({
    code: `genres-${min}`, name: `${min} géneros`, description: `Tu colección abarca ${min} géneros distintos.`,
    icon: 'shapes', category: 'diversidad', tier: i + 1, criteria: { type: 'distinct', field: 'genre', min },
  })),
  ...[5, 6, 7].map((min, i): AchievementDef => ({
    code: `decades-${min}`, name: `${min} décadas`, description: `Tenés discos de ${min} décadas distintas.`,
    icon: 'hourglass', category: 'tiempo', tier: i + 1, criteria: { type: 'distinct', field: 'decade', min },
  })),
  ...[10, 50].map((min, i): AchievementDef => ({
    code: `artists-${min}`, name: `${min} artistas`, description: `Tenés discos de ${min} artistas distintos.`,
    icon: 'mic', category: 'artistas', tier: i + 1, criteria: { type: 'distinct', field: 'artist', min },
  })),
  ...[5, 10].map((min, i): AchievementDef => ({
    code: `countries-${min}`, name: `${min} países`, description: `Tenés ediciones de ${min} países distintos.`,
    icon: 'globe', category: 'paises', tier: i + 1, criteria: { type: 'distinct', field: 'country', min },
  })),
  { code: 'first-pressing', name: 'Primera edición', description: 'Tenés una primera edición.', icon: 'star', category: 'rareza', tier: 1, criteria: { type: 'has_release', where: { firstPressing: true }, min: 1 } },
  { code: 'japanese-edition', name: 'Edición japonesa', description: 'Tenés una edición japonesa.', icon: 'sun', category: 'rareza', tier: 1, criteria: { type: 'has_release', where: { country: ['Japan'] }, min: 1 } },
  { code: 'limited-edition', name: 'Edición limitada', description: 'Tenés una edición limitada.', icon: 'hash', category: 'rareza', tier: 1, criteria: { type: 'has_release', where: { editionType: ['limited'], formatDescription: ['Limited Edition', 'Numbered'] }, min: 1 } },
  { code: 'picture-disc', name: 'Picture disc', description: 'Tenés un picture disc.', icon: 'image', category: 'rareza', tier: 1, criteria: { type: 'has_release', where: { formatDescription: ['Picture Disc'] }, min: 1 } },
  { code: 'colored-vinyl', name: 'Vinilo de color', description: 'Tenés un vinilo de color.', icon: 'palette', category: 'rareza', tier: 1, criteria: { type: 'has_release', where: { coloredVinyl: true }, min: 1 } },
  { code: 'completist-1', name: 'Completista', description: 'Completaste la discografía esencial de un artista.', icon: 'trophy', category: 'discografias', tier: 1, criteria: { type: 'essential_lists_completed', min: 1 } },
  { code: 'completist-3', name: 'Completista serial', description: 'Completaste 3 discografías esenciales.', icon: 'trophy', category: 'discografias', tier: 2, criteria: { type: 'essential_lists_completed', min: 3 } },
];
