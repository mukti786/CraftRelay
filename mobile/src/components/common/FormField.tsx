import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
  ViewStyle,
} from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';

interface FormFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  secureToggle?: boolean;
  containerStyle?: ViewStyle;
}

export function FormField({
  label,
  error,
  hint,
  required,
  secureToggle,
  containerStyle,
  secureTextEntry,
  ...rest
}: FormFieldProps) {
  const [isSecure, setIsSecure] = useState(secureTextEntry ?? false);
  const hasError = !!error;

  return (
    <View style={[styles.container, containerStyle]}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={[styles.inputWrapper, hasError && styles.inputError]}>
        <TextInput
          style={styles.input}
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={isSecure}
          autoCapitalize="none"
          {...rest}
        />
        {secureToggle && (
          <TouchableOpacity
            onPress={() => setIsSecure((s) => !s)}
            style={styles.toggleBtn}
            accessibilityLabel={isSecure ? 'Show password' : 'Hide password'}
          >
            <Text style={styles.toggleText}>{isSecure ? 'Show' : 'Hide'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {hasError && <Text style={styles.errorText}>{error}</Text>}
      {!hasError && hint && <Text style={styles.hintText}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  required: {
    color: Colors.error,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    paddingVertical: Spacing.sm + 2,
    minHeight: 44,
  },
  inputError: {
    borderColor: Colors.error,
  },
  toggleBtn: {
    paddingLeft: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  toggleText: {
    fontSize: FontSize.sm,
    color: Colors.teal,
    fontWeight: '600',
  },
  errorText: {
    fontSize: FontSize.xs,
    color: Colors.error,
    marginTop: Spacing.xs,
  },
  hintText: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: Spacing.xs,
  },
});
