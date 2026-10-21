import { Platform } from 'react-native';

export const colors = {
  background: '#0D1013',
  surface: '#15191E',
  surfaceRaised: '#1D232A',
  text: '#F2F5F7',
  textMuted: '#929DA8',
  accent: '#FF7029',
  accentStrong: '#E65313',
  accentSoft: '#2C1B13',
  accentLight: '#FFA06D',
  border: '#2B323A',
  white: '#FFFFFF',
  warning: '#F4C16F',
  warningSurface: '#352719',
  tab: '#111519',
};

export const fonts = {
  display: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const spacing = {
  page: 22,
  card: 18,
  section: 28,
};
