import { Platform } from 'react-native';

export const colors = {
  background: '#0A0D10',
  surface: '#13171C',
  surfaceRaised: '#1B2127',
  surfaceElevated: '#242B32',
  text: '#F5F2EE',
  textMuted: '#9AA3AB',
  accent: '#FF762F',
  accentStrong: '#E95E1C',
  accentSoft: '#2C1B13',
  accentLight: '#FFAD7B',
  border: '#293139',
  white: '#FFFFFF',
  danger: '#FF7168',
  dangerSoft: '#351C1C',
  warning: '#F4C16F',
  warningSurface: '#352719',
  tab: '#101418',
};

export const fonts = {
  display: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
};

export const spacing = {
  page: 20,
  card: 18,
  section: 26,
};
