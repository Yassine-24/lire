import type { ReactNode } from 'react';
import {
  Modal,
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

export function Page({
  children,
  scroll = true,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.pageContent, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.pageContent, contentStyle]}>{children}</View>
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
      style={({ pressed }) => [styles.chip, active ? styles.chipActive : null, pressed ? styles.pressed : null]}
    >
      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmitEditing,
  editable = true,
}: Pick<TextInputProps, 'onSubmitEditing'> & {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  editable?: boolean;
}) {
  return (
    <View style={[styles.searchField, !editable ? styles.disabled : null]}>
      <Text accessibilityElementsHidden style={styles.searchIcon}>⌕</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize="none"
        editable={editable}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        returnKeyType="search"
        selectionColor={colors.accent}
        style={styles.searchInput}
        value={value}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText('')} style={styles.clearSearch}>
          <Text style={styles.clearSearchText}>×</Text>
        </Pressable>
      ) : null}
    </View>
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
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.accent}
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

export function ConfirmDialog({
  visible,
  title,
  detail,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  warning,
}: {
  visible: boolean;
  title: string;
  detail: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  warning?: string;
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.dialogBackdrop}>
        <View accessibilityViewIsModal style={styles.dialog}>
          <View style={styles.dialogMark}><Text style={styles.dialogMarkText}>!</Text></View>
          <Eyebrow>One last check</Eyebrow>
          <Text style={styles.dialogTitle}>{title}</Text>
          <Text style={styles.dialogDetail}>{detail}</Text>
          {warning ? <StatusMessage warning>{warning}</StatusMessage> : null}
          <Button variant="danger" disabled={busy} onPress={onConfirm}>
            {busy ? 'Removing…' : confirmLabel}
          </Button>
          <Button variant="outline" disabled={busy} onPress={onCancel}>Keep it</Button>
        </View>
      </View>
    </Modal>
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
    backgroundColor: colors.background,
  },
  pageContent: {
    paddingHorizontal: spacing.page,
    paddingTop: 16,
    paddingBottom: 32,
    gap: 19,
  },
  eyebrow: {
    color: colors.accent,
    fontFamily: fonts.body,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  pageTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.9,
    fontWeight: '700',
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionDetail: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 22,
    padding: spacing.card,
    gap: 13,
  },
  cardDark: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.surfaceElevated,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: colors.accentStrong,
  },
  buttonOutline: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSoft: {
    backgroundColor: colors.accentSoft,
    borderWidth: 1,
    borderColor: '#54301F',
  },
  buttonDanger: {
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#6A302D',
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
    color: colors.text,
  },
  buttonTextSoft: {
    color: colors.accentLight,
  },
  buttonTextDanger: {
    color: colors.danger,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.48,
  },
  chip: {
    minHeight: 37,
    paddingHorizontal: 13,
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: '#7F3C1D',
  },
  chipText: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.accentLight,
  },
  searchField: {
    minHeight: 54,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingLeft: 14,
    paddingRight: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchIcon: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 24,
    lineHeight: 28,
  },
  searchInput: {
    flex: 1,
    minHeight: 50,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  clearSearch: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearSearchText: {
    color: colors.textMuted,
    fontSize: 22,
    lineHeight: 24,
  },
  fieldLabel: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 8,
  },
  input: {
    minHeight: 51,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 15,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 14,
  },
  message: {
    backgroundColor: colors.accentSoft,
    borderColor: '#4C2B1C',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 15,
  },
  messageWarning: {
    backgroundColor: colors.warningSurface,
    borderColor: '#624521',
  },
  messageText: {
    color: colors.text,
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
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMarkText: {
    color: colors.accent,
    fontFamily: fonts.display,
    fontSize: 25,
  },
  emptyTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 20,
    textAlign: 'center',
  },
  emptyDetail: {
    maxWidth: 280,
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  dialogBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(3, 6, 9, 0.82)',
  },
  dialog: {
    padding: 22,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: 12,
  },
  dialogMark: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogMarkText: {
    color: colors.danger,
    fontFamily: fonts.mono,
    fontSize: 18,
    fontWeight: '700',
  },
  dialogTitle: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '700',
  },
  dialogDetail: {
    color: colors.textMuted,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
  },
});
