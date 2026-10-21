import { Platform } from 'react-native';

export const colors = {
  background: '#17191C',
  surface: '#222427',
  surfaceRaised: '#2A2D31',
  text: '#F4F1EE',
  textMuted: '#AEA9A3',
  accent: '#F47A32',
  accentStrong: '#C0440B',
  accentSoft: '#34251E',
  accentLight: '#FFA06D',
  border: '#383A3D',
  white: '#FFFFFF',
  warning: '#F4C16F',
  warningSurface: '#3A3024',
  tab: '#1D1F22',
};

export const fonts = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
  body: Platform.select({ ios: 'Avenir Next', android: 'sans-serif', default: 'sans-serif' }),
};

export const spacing = {
  page: 22,
  card: 18,
  section: 28,
};
