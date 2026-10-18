import { TouchableOpacity, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}` as keyof typeof styles],
        isDisabled && styles.disabled,
        style,
      ]}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' || variant === 'ghost' ? Colors.navy : Colors.white}
          size="small"
        />
      ) : (
        <Text style={[styles.label, styles[`label_${variant}` as keyof typeof styles], styles[`labelSize_${size}` as keyof typeof styles]]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  // Variants
  primary: {
    backgroundColor: Colors.navy,
  },
  secondary: {
    backgroundColor: Colors.teal,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.navy,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: Colors.error,
  },
  disabled: {
    opacity: 0.45,
  },
  // Sizes
  size_sm: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 2, minHeight: 36 },
  size_md: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm + 2, minHeight: 44 },
  size_lg: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, minHeight: 52 },
  // Labels
  label: { fontWeight: '600' } as TextStyle,
  label_primary: { color: Colors.white } as TextStyle,
  label_secondary: { color: Colors.white } as TextStyle,
  label_outline: { color: Colors.navy } as TextStyle,
  label_ghost: { color: Colors.navy } as TextStyle,
  label_danger: { color: Colors.white } as TextStyle,
  labelSize_sm: { fontSize: FontSize.sm } as TextStyle,
  labelSize_md: { fontSize: FontSize.base } as TextStyle,
  labelSize_lg: { fontSize: FontSize.md } as TextStyle,
});
