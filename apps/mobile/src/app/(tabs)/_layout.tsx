import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, fonts } from '@/design/tokens';

function TabGlyph({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ color: focused ? colors.accent : colors.textMuted, fontFamily: fonts.body, fontSize: 17, fontWeight: '700' }}>{symbol}</Text>;
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentLight,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.tab,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 72,
          paddingTop: 7,
          paddingBottom: 9,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.body,
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: ({ focused }) => <TabGlyph symbol="◷" focused={focused} /> }} />
      <Tabs.Screen name="library" options={{ title: 'Library', tabBarIcon: ({ focused }) => <TabGlyph symbol="▤" focused={focused} /> }} />
      <Tabs.Screen name="stats" options={{ title: 'Stats', tabBarIcon: ({ focused }) => <TabGlyph symbol="▥" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ focused }) => <TabGlyph symbol="◉" focused={focused} /> }} />
    </Tabs>
  );
}
