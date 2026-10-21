import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '@/design/tokens';

export function Page({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.pageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.pageContent}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.pageTitle}>{children}</Text>;
}

export function SectionTitle({ children, detail }: { children: ReactNode; detail?: string }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {detail ? <Text style={styles.sectionDetail}>{detail}</Text> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  dark = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  dark?: boolean;
}) {
  return <View style={[styles.card, dark ? styles.cardDark : null, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'outline' | 'soft' | 'danger';

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress: PressableProps['onPress'];
  variant?: ButtonVariant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const variantStyle =
    variant === 'outline'
      ? styles.buttonOutline
      : variant === 'soft'
        ? styles.buttonSoft
        : variant === 'danger'
          ? styles.buttonDanger
          : styles.buttonPrimary;
  const textStyle =
    variant === 'outline'
      ? styles.buttonTextOutline
      : variant === 'soft'
        ? styles.buttonTextSoft
        : variant === 'danger'
          ? styles.buttonTextDanger
          : styles.buttonTextPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variantStyle,
        pressed && !disabled ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Text style={[styles.buttonText, textStyle]}>{children}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, active ? styles.chipActive : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...inputProps
}: TextInputProps & { label: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        selectionColor={colors.forest}
        style={styles.input}
        {...inputProps}
      />
    </View>
  );
}

export function StatusMessage({ children, warning = false }: { children: ReactNode; warning?: boolean }) {
  return (
    <View style={[styles.message, warning ? styles.messageWarning : null]}>
      <Text style={[styles.messageText, warning ? styles.messageTextWarning : null]}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyMark}>
        <Text style={styles.emptyMarkText}>L</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDetail}>{detail}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  pageContent: {
    paddingHorizontal: spacing.page,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 22,
  },
  eyebrow: {
    color: colors.forest,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 22,
  },
  sectionDetail: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.paperBright,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.card,
    gap: 12,
  },
  cardDark: {
    backgroundColor: colors.forestDeep,
    borderColor: colors.forestDeep,
  },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.forest,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  buttonSoft: {
    backgroundColor: colors.sage,
  },
  buttonDanger: {
    backgroundColor: colors.clayPale,
  },
  buttonText: {
    fontFamily: fonts.body,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonTextPrimary: {
    color: colors.white,
  },
  buttonTextOutline: {
    color: colors.ink,
  },
  buttonTextSoft: {
    color: colors.forestDeep,
  },
  buttonTextDanger: {
    color: colors.clay,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.45,
  },
  chip: {
    minHeight: 38,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.paperBright,
    borderColor: colors.line,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  chipText: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.white,
  },
  fieldLabel: {
    color: colors.ink,
    fontFamily: fonts.body,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: colors.paperBright,
    paddingHorizontal: 14,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  message: {
    backgroundColor: colors.sage,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  messageWarning: {
    backgroundColor: colors.warningPale,
  },
  messageText: {
    color: colors.forestDeep,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
  },
  messageTextWarning: {
    color: colors.warning,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 34,
    paddingHorizontal: 18,
    gap: 12,
  },
  emptyMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMarkText: {
    color: colors.forest,
    fontFamily: fonts.display,
    fontSize: 25,
  },
  emptyTitle: {
    color: colors.ink,
    fontFamily: fonts.display,
    fontSize: 20,
    textAlign: 'center',
  },
  emptyDetail: {
    maxWidth: 280,
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
