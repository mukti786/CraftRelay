import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/common/Button';
import { FormField } from '@/src/components/common/FormField';
import { MockDataBanner } from '@/src/components/common/Primitives';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof loginSchema>;

const DEMO_ACCOUNTS = [
  { role: 'Worker', email: 'arjun.sharma@demo.craftrelay' },
  { role: 'Assessor', email: 'dr.menon@demo.craftrelay' },
  { role: 'Customer', email: 'meera.iyer@demo.craftrelay' },
  { role: 'Admin', email: 'admin@demo.craftrelay' },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);

  const { control, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    const result = await login(data.email, data.password);
    setLoading(false);
    if (!result.success) {
      Alert.alert('Login failed', result.error ?? 'Invalid credentials');
    }
    // Navigation handled by RootNavigator after auth state changes
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <MockDataBanner />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Sign In</Text>
        <Text style={styles.subheading}>Welcome back to CraftRelay</Text>

        <Controller
          control={control}
          name="email"
          render={({ field }) => (
            <FormField
              label="Email"
              required
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              error={errors.email?.message}
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="password"
          render={({ field }) => (
            <FormField
              label="Password"
              required
              secureTextEntry
              secureToggle
              placeholder="••••••••"
              error={errors.password?.message}
              value={field.value}
              onChangeText={field.onChange}
            />
          )}
        />

        <Button
          label="Sign In"
          onPress={handleSubmit(onSubmit)}
          loading={loading}
          style={styles.submitBtn}
          size="lg"
        />

        <Button
          label="Don't have an account? Register"
          onPress={() => router.replace('/(auth)/register' as never)}
          variant="ghost"
          style={styles.registerBtn}
        />

        {/* Demo accounts */}
        <View style={styles.demoSection}>
          <Text style={styles.demoTitle}>Demo accounts (any password works):</Text>
          {DEMO_ACCOUNTS.map(({ role, email }) => (
            <Button
              key={role}
              label={`${role}: ${email}`}
              onPress={() => setValue('email', email)}
              variant="outline"
              size="sm"
              style={styles.demoBtn}
            />
          ))}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.background },
  container: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  heading: { fontSize: FontSize.xxl, fontWeight: '800', color: Colors.navy, marginBottom: Spacing.xs },
  subheading: { fontSize: FontSize.base, color: Colors.textSecondary, marginBottom: Spacing.lg },
  submitBtn: { marginTop: Spacing.sm },
  registerBtn: { marginTop: Spacing.sm },
  demoSection: { marginTop: Spacing.xl, gap: Spacing.sm },
  demoTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.xs },
  demoBtn: { alignSelf: 'stretch' },
});
