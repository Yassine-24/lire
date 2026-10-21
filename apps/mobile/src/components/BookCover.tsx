import { useState } from 'react';
import { Image, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, fonts } from '@/design/tokens';

export function coverFromIsbn(isbn: string | null | undefined): string | null {
  const normalized = isbn?.replace(/[^0-9Xx]/g, '');
  return normalized ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(normalized)}-M.jpg?default=false` : null;
}

export function BookCover({
  title,
  uri,
  width = 54,
  height = 74,
  style,
}: {
  title: string;
  uri?: string | null;
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = Boolean(uri && uri !== failedUri);

  return (
    <View
      accessible
      accessibilityLabel={showImage ? `${title} cover` : `${title} cover unavailable`}
      style={[
        {
          width,
          height,
          borderRadius: 9,
          backgroundColor: '#261A14',
          borderWidth: 1,
          borderColor: '#57321F',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          accessibilityLabel={`${title} book cover`}
          onError={() => setFailedUri(uri ?? null)}
          resizeMode="cover"
          source={{ uri: uri ?? undefined }}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <View style={{ flex: 1, width: '100%', padding: 7, justifyContent: 'space-between' }}>
          <View style={{ width: 13, height: 2, borderRadius: 2, backgroundColor: colors.accent }} />
          <Text
            numberOfLines={2}
            style={{
              color: colors.accentLight,
              fontFamily: fonts.display,
              fontSize: Math.min(23, Math.max(16, width * 0.34)),
              fontWeight: '700',
            }}
          >
            {title.trim().slice(0, 1).toUpperCase() || 'L'}
          </Text>
          <View style={{ height: 2, borderRadius: 2, backgroundColor: '#704027' }} />
        </View>
      )}
    </View>
  );
}
