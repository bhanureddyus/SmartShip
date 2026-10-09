// Small presentational primitives mirroring `.btn`, `.chip`, `.badge`,
// `.card`, `.callout` and `.fine` from public/app.css.
import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { cardShadow, colors, font, radius, space } from '../theme';

type Tone = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  tone = 'secondary',
  disabled,
  size = 'md',
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        s.btn,
        size === 'sm' && s.btnSm,
        size === 'lg' && s.btnLg,
        tone === 'primary' && s.btnPrimary,
        tone === 'ghost' && s.btnGhost,
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <Text style={[s.btnText, tone === 'primary' && { color: colors.buttonPrimaryFg }, size === 'lg' && { fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  onPress,
  active,
  warn,
  ghost,
  testID,
}: {
  label: string;
  onPress?: () => void;
  active?: boolean;
  warn?: boolean;
  ghost?: boolean;
  testID?: string;
}) {
  const inner = (
    <View style={[s.chip, warn && s.chipWarn, active && s.chipActive, ghost && s.chipGhost]}>
      <Text style={[s.chipText, warn && { color: colors.warningFg }, active && { color: colors.buttonPrimaryFg }]}>{label}</Text>
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} testID={testID} accessibilityRole="button" accessibilityState={{ selected: Boolean(active) }}>
      {inner}
    </Pressable>
  );
}

export type BadgeKind = 'success' | 'warning' | 'error' | 'neutral' | 'accent';

export function Badge({ label, kind = 'neutral', testID }: { label: string; kind?: BadgeKind; testID?: string }) {
  const bg = { success: colors.successBg, warning: colors.warningBg, error: colors.errorBg, neutral: colors.surfaceHover, accent: colors.accentSoft }[kind];
  const fg = { success: colors.successFg, warning: colors.warningFg, error: colors.errorFg, neutral: colors.textSecondary, accent: colors.accentFg }[kind];
  return (
    <View style={[s.badge, { backgroundColor: bg }]} testID={testID}>
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Card({ children, style, title, right, testID }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; title?: string; right?: ReactNode; testID?: string }>) {
  return (
    <View style={[s.card, style]} testID={testID}>
      {title ? (
        <View style={s.cardHead}>
          <Text style={s.cardTitle}>{title}</Text>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Callout({ children, kind = 'info' }: PropsWithChildren<{ kind?: 'info' | 'ok' | 'warn' | 'err' }>) {
  const bg = { info: colors.accentSoft, ok: colors.successBg, warn: colors.warningBg, err: colors.errorBg }[kind];
  const fg = { info: colors.accentFg, ok: colors.successFg, warn: colors.warningFg, err: colors.errorFg }[kind];
  return (
    <View style={[s.callout, { backgroundColor: bg }]}>
      <Text style={[s.calloutText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Fine({ children, center }: PropsWithChildren<{ center?: boolean }>) {
  return <Text style={[s.fine, center && { textAlign: 'center' }]}>{children}</Text>;
}

export function Title({ children }: PropsWithChildren) {
  return <Text style={s.title}>{children}</Text>;
}

export function Lede({ children }: PropsWithChildren) {
  return <Text style={s.lede}>{children}</Text>;
}

export function Row({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[s.row, style]}>{children}</View>;
}

export function money(n: number): string {
  return '$' + n.toFixed(2);
}
export function money0(n: number): string {
  return '$' + Math.round(n).toString();
}

const s = StyleSheet.create({
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceHover,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  btnSm: { paddingVertical: 7, paddingHorizontal: 12, minHeight: 32 },
  btnLg: { paddingVertical: 14, paddingHorizontal: 20, minHeight: 50 },
  btnPrimary: { backgroundColor: colors.buttonPrimaryBg },
  btnGhost: { backgroundColor: 'transparent' },
  btnText: { fontSize: font.body, fontWeight: '600', color: colors.textPrimary },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHover,
    alignSelf: 'flex-start',
  },
  chipWarn: { backgroundColor: colors.warningBg },
  chipActive: { backgroundColor: colors.buttonPrimaryBg },
  chipGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.borderDefault },
  chipText: { fontSize: font.small, fontWeight: '500', color: colors.textSecondary },
  badge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: radius.pill, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: colors.surfacePrimary, borderRadius: radius.xl, padding: space.s5, marginBottom: space.s3, ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s3, gap: space.s3, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  callout: { borderRadius: radius.lg, paddingVertical: space.s3, paddingHorizontal: space.s4, marginBottom: space.s3 },
  calloutText: { fontSize: 14, lineHeight: 20 },
  fine: { fontSize: font.fine, color: colors.textTertiary, lineHeight: 18, marginTop: space.s3 },
  title: { fontSize: font.title, fontWeight: '700', color: colors.textPrimary, letterSpacing: -0.4, marginBottom: space.s1 },
  lede: { fontSize: font.body, color: colors.textSecondary, lineHeight: 22, marginBottom: space.s4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s2, alignItems: 'center' },
});
