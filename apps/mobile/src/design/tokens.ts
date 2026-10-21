import { Platform } from 'react-native';

export const colors = {
  paper: '#F5F1E8',
  paperBright: '#FBF9F4',
  ink: '#20312A',
  forest: '#315B48',
  forestDeep: '#254635',
  sage: '#DDE7DA',
  muted: '#747C72',
  line: '#E5DED2',
  white: '#FFFFFF',
  clay: '#B76549',
  clayPale: '#F3E4DA',
  warning: '#8B5C28',
  warningPale: '#F5EBD8',
  tab: '#FBF9F4',
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
