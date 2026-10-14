// Small, themed building blocks shared by every screen.
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius, Spacing, type Palette } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: string }) {
  const c = useTheme();
  return <MaterialCommunityIcons name={name} size={size} color={color ?? c.text} />;
}

// --- Text --------------------------------------------------------------------

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type Tone = 'default' | 'secondary' | 'accent' | 'accent2' | 'danger' | 'success' | 'onAccent';

export function T({
  variant = 'body',
  tone = 'default',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const c = useTheme();
  const color = {
    default: c.text,
    secondary: c.textSecondary,
    accent: c.accent,
    accent2: c.accent2,
    danger: c.danger,
    success: c.success,
    onAccent: c.onAccent,
  }[tone];
  return <Text style={[textStyles[variant], { color }, style]} {...rest} />;
}

const textStyles = StyleSheet.create({
  display: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2 },
  caption: { fontSize: 13, lineHeight: 18 },
});

// --- Layout ------------------------------------------------------------------

/**
 * Scrollable screen body. Tab screens (no native header) pass `title` to get
 * a large in-page header that respects the status bar.
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  scroll = true,
  padded = true,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const header = title ? (
    <View style={[styles.pageHeader, { paddingTop: insets.top + Spacing.md }]}>
      <View style={{ flex: 1 }}>
        <T variant="display">{title}</T>
        {subtitle ? <T tone="secondary">{subtitle}</T> : null}
      </View>
      {right}
    </View>
  ) : null;
  const contentStyle = [padded && styles.padded, { paddingBottom: Spacing.xxl * 2, gap: Spacing.lg }];
  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: c.background }]}>
        {header}
        <View style={[{ flex: 1 }, ...contentStyle]}>{children}</View>
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps="handled">
      {header}
      {children}
    </ScrollView>
  );
}

export function Row({ children, style, gap = Spacing.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: Spacing.sm }}>
      <Row style={{ justifyContent: 'space-between', minHeight: 28 }}>
        <T variant="label" tone="secondary" style={{ textTransform: 'uppercase' }}>
          {title}
        </T>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Card({
  children,
  onPress,
  onLongPress,
  style,
  accent,
}: {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accent?: boolean;
}) {
  const c = useTheme();
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: c.surface, borderColor: accent ? c.accent : c.border },
    style,
  ];
  if (!onPress && !onLongPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: c.surfaceAlt }}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  chevron = !!onPress,
}: {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
}) {
  const c = useTheme();
  return (
    <Card onPress={onPress} onLongPress={onLongPress} style={{ paddingVertical: Spacing.md }}>
      <Row gap={Spacing.md}>
        {left}
        <View style={{ flex: 1 }}>
          <T variant="heading" numberOfLines={2}>
            {title}
          </T>
          {subtitle ? (
            <T variant="caption" tone="secondary" numberOfLines={2}>
              {subtitle}
            </T>
          ) : null}
        </View>
        {right}
        {chevron ? <Icon name="chevron-right" color={c.textSecondary} /> : null}
      </Row>
    </Card>
  );
}

export function Empty({ icon, title, message, children }: { icon: IconName; title: string; message?: string; children?: ReactNode }) {
  const c = useTheme();
  return (
    <View style={[styles.empty, { borderColor: c.border }]}>
      <Icon name={icon} size={40} color={c.textSecondary} />
      <T variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {message ? (
        <T tone="secondary" style={{ textAlign: 'center' }}>
          {message}
        </T>
      ) : null}
      {children ? <View style={{ gap: Spacing.sm, alignSelf: 'stretch', marginTop: Spacing.sm }}>{children}</View> : null}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}

// --- Controls ----------------------------------------------------------------

/** primary: the one main action. tonal: a softer positive action. secondary: neutral. */
type ButtonVariant = 'primary' | 'tonal' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  small,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const { bg, fg, border } = buttonColors(c, variant);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {icon ? <Icon name={icon} size={small ? 18 : 20} color={fg} /> : null}
      <Text style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

function buttonColors(c: Palette, v: ButtonVariant) {
  switch (v) {
    case 'primary':
      return { bg: c.accent, fg: c.onAccent, border: c.accent };
    case 'secondary':
      return { bg: c.surface, fg: c.text, border: c.border };
    case 'danger':
      return { bg: 'transparent', fg: c.danger, border: c.danger };
    case 'tonal':
      return { bg: c.accentSoft, fg: c.accent, border: c.accentSoft };
    case 'ghost':
      return { bg: 'transparent', fg: c.accent, border: 'transparent' };
  }
}

export function IconButton({
  name,
  onPress,
  label,
  color,
  size = 22,
  disabled,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? c.accent2 : c.surface, borderColor: selected ? c.accent2 : c.border },
      ]}>
      <Text style={{ color: selected ? c.onAccent2 : c.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.sm }}>
      {children}
    </ScrollView>
  );
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  const c = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: c.surfaceAlt }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: c.surface }]}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ color: selected ? c.text : c.textSecondary, fontWeight: '600', paddingHorizontal: 4 }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({
  label,
  hint,
  style,
  ...input
}: TextInputProps & { label?: string; hint?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.xs, flexGrow: 1 }}>
      {label ? (
        <T variant="label" tone="secondary">
          {label}
        </T>
      ) : null}
      <TextInput
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.surface, borderColor: c.border },
          input.multiline && { minHeight: 88, textAlignVertical: 'top' },
          style,
        ]}
        {...input}
      />
      {hint ? (
        <T variant="caption" tone="secondary">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** Numeric input that keeps the raw text while typing and reports a number or undefined. */
export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  allowNegative,
  integer,
  suffix,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  allowNegative?: boolean;
  integer?: boolean;
  suffix?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: Spacing.xs, flex: 1, minWidth: 72 }}>
      <T variant="label" tone="secondary" numberOfLines={1}>
        {label}
      </T>
      <View style={[styles.input, styles.numberWrap, { backgroundColor: c.surface, borderColor: c.border }]}>
        <NumberInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          allowNegative={allowNegative}
          integer={integer}
          style={{ flex: 1, color: c.text, fontSize: 16, padding: 0 }}
        />
        {suffix ? (
          <T variant="caption" tone="secondary">
            {suffix}
          </T>
        ) : null}
      </View>
    </View>
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder,
  allowNegative,
  integer,
  style,
}: {
  value: number | undefined | null;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  allowNegative?: boolean;
  integer?: boolean;
  style?: TextInputProps['style'];
}) {
  const c = useTheme();
  const shown = value == null || Number.isNaN(value) ? '' : String(value);
  // While focused, keep the raw text so partial input like "1." or "-" survives.
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={focused ? text : shown}
      placeholder={placeholder}
      placeholderTextColor={c.textSecondary}
      keyboardType={allowNegative ? 'numbers-and-punctuation' : integer ? 'number-pad' : 'decimal-pad'}
      selectTextOnFocus
      onFocus={() => {
        setText(shown);
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChangeText={(t) => {
        setText(t);
        const clean = t.replace(',', '.').trim();
        if (clean === '') return onChange(undefined);
        let n = Number(clean);
        if (!Number.isFinite(n)) return;
        if (integer) n = Math.round(n);
        if (!allowNegative) n = Math.abs(n);
        onChange(n);
      }}
      style={style}
    />
  );
}

export function Badge({
  label,
  tone = 'default',
}: {
  label: string;
  /** accent: status (Active). accent2: tags (category, focus, Custom). success: done. */
  tone?: 'default' | 'accent' | 'accent2' | 'success';
}) {
  const c = useTheme();
  const bg = { default: c.surfaceAlt, accent: c.accentSoft, accent2: c.accent2Soft, success: 'transparent' }[tone];
  const fg = { default: c.textSecondary, accent: c.accent, accent2: c.accent2, success: c.success }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor: tone === 'success' ? c.success : bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  padded: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  pageHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm, paddingBottom: Spacing.xs },
  card: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.xl,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    minHeight: 48,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: Spacing.md },
  buttonText: { fontSize: 16, fontWeight: '700' },
  iconButton: { padding: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  segmented: { flexDirection: 'row', borderRadius: Radius.md, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: Spacing.sm, borderRadius: Radius.sm },
  input: {
    borderWidth: 1,
    borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    fontSize: 16,
  },
  numberWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
