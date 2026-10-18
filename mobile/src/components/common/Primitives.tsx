import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';
import { Button } from './Button';

// ── Loading state ─────────────────────────────────────────
interface LoadingStateProps {
  message?: string;
  style?: ViewStyle;
}
export function LoadingState({ message = 'Loading…', style }: LoadingStateProps) {
  return (
    <View style={[styles.center, style]}>
      <ActivityIndicator size="large" color={Colors.navy} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

// ── Empty state ───────────────────────────────────────────
interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}
export function EmptyState({ icon = '📭', title, description, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.center, style]}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {description && <Text style={styles.emptyDesc}>{description}</Text>}
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} variant="outline" style={styles.actionBtn} />
      )}
    </View>
  );
}

// ── Error / failure state ─────────────────────────────────
interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  style?: ViewStyle;
}
export function ErrorState({
  title = 'Something went wrong',
  description = 'Please check your connection and try again.',
  onRetry,
  style,
}: ErrorStateProps) {
  return (
    <View style={[styles.center, style]}>
      <Text style={styles.icon}>⚠️</Text>
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.emptyDesc}>{description}</Text>
      {onRetry && <Button label="Retry" onPress={onRetry} variant="outline" style={styles.actionBtn} />}
    </View>
  );
}

// ── Mock data notice banner ───────────────────────────────
export function MockDataBanner() {
  return (
    <View style={styles.mockBanner}>
      <Text style={styles.mockText}>
        🛠️  Mock data — development only. Actions do not persist.
      </Text>
    </View>
  );
}

// ── Card wrapper ──────────────────────────────────────────
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}
export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ── Section header ────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
}
export function SectionHeader({ title, subtitle }: SectionHeaderProps) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────
export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  icon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSize.base,
    color: Colors.textSecondary,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: FontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  actionBtn: {
    marginTop: Spacing.lg,
    minWidth: 140,
  },
  mockBanner: {
    backgroundColor: '#FEF9C3',
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
  },
  mockText: {
    fontSize: FontSize.xs,
    color: '#92400E',
    textAlign: 'center',
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
});
