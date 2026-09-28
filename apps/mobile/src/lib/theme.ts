import { Platform } from 'react-native';

/** Modernist tokens (see design/project/_ds/…/styles.css), as React Native values. */
export const c = {
  bg: '#f3f2f2',
  surface: '#eae9e9',
  text: '#201e1d',
  accent: '#ec3013',
  // color-mix(#201e1d 40%, transparent) over the background
  divider: 'rgba(32,30,29,0.4)',
  n100: '#f8f4f4',
  n200: '#eae7e7',
  n300: '#d7d3d3',
  n400: '#bab6b6',
  n500: '#9b9797',
  n600: '#7d7979',
  n700: '#605d5d',
  n800: '#444141',
  n900: '#2d2b2b',
  a100: '#fff2ef',
  a400: '#ff9783',
  a600: '#dd2b0f',
  a700: '#ae1800',
  a800: '#7c1405',
} as const;

/** Archivo is loaded in 400/600/800 like the design system; 700 renders with the 800 face. */
export const font = (weight: 400 | 600 | 700 | 800 = 400) =>
  weight >= 700
    ? 'Archivo_800ExtraBold'
    : weight === 600
      ? 'Archivo_600SemiBold'
      : 'Archivo_400Regular';

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
