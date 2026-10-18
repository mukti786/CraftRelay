import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import type { CriterionStatus } from '@/src/types';

type BadgeVariant =
  | 'verified'
  | 'pending'
  | 'gap'
  | 'declared'
  | 'info'
  | 'warning'
  | 'error'
  | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

export function StatusBadge({ label, variant = 'neutral', style }: StatusBadgeProps) {
  return (
    <View style={[styles.base, styles[variant], style]}>
      <Text style={[styles.text, styles[`text_${variant}` as keyof typeof styles]]}>{label}</Text>
    </View>
  );
}

/** Map CriterionStatus to a BadgeVariant and human label. */
export function criterionStatusBadge(status: CriterionStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'GAP': return { label: 'GAP', variant: 'gap' };
    case 'PENDING_REVIEW': return { label: 'Pending Review', variant: 'pending' };
    case 'ADDITIONAL_EVIDENCE_REQUIRED': return { label: 'More Evidence Needed', variant: 'warning' };
    case 'PRACTICAL_VERIFICATION_REQUIRED': return { label: 'Practical Required', variant: 'info' };
    case 'READY_FOR_ASSESSOR_DECISION': return { label: 'Ready for Assessor', variant: 'declared' };
    case 'VERIFIED': return { label: 'Verified ✓', variant: 'verified' };
  }
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  // Backgrounds
  verified: { backgroundColor: '#DCFCE7' },
  pending: { backgroundColor: '#FEF9C3' },
  gap: { backgroundColor: '#FEE2E2' },
  declared: { backgroundColor: '#DBEAFE' },
  info: { backgroundColor: '#E0F2FE' },
  warning: { backgroundColor: '#FEF3C7' },
  error: { backgroundColor: '#FEE2E2' },
  neutral: { backgroundColor: Colors.border },
  // Text colors
  text_verified: { color: '#15803D' },
  text_pending: { color: '#A16207' },
  text_gap: { color: '#B91C1C' },
  text_declared: { color: '#1D4ED8' },
  text_info: { color: '#0369A1' },
  text_warning: { color: '#B45309' },
  text_error: { color: '#B91C1C' },
  text_neutral: { color: Colors.textSecondary },
});
