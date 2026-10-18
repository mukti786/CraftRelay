import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import { StatusBadge, criterionStatusBadge } from '../common/StatusBadge';
import type { QualificationCriterion } from '@/src/types';

interface CriterionCardProps {
  criterion: QualificationCriterion;
  onPress?: () => void;
  showEvidence?: boolean;
}

export function CriterionCard({ criterion, onPress, showEvidence = true }: CriterionCardProps) {
  const badge = criterionStatusBadge(criterion.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={onPress ? 0.85 : 1}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={styles.mandatoryRow}>
          {criterion.mandatory && (
            <View style={styles.mandatoryBadge}>
              <Text style={styles.mandatoryText}>MANDATORY</Text>
            </View>
          )}
          <StatusBadge label={badge.label} variant={badge.variant} />
        </View>
      </View>

      <Text style={styles.criterionText}>{criterion.text}</Text>

      {showEvidence && criterion.linked_evidence.length > 0 && (
        <View style={styles.evidenceSection}>
          <Text style={styles.evidenceLabel}>Linked Evidence ({criterion.linked_evidence.length})</Text>
          {criterion.linked_evidence.map((ev) => (
            <View key={ev.id} style={styles.evidenceRow}>
              <Text style={styles.evidenceIcon}>
                {ev.file_type === 'image' ? '🖼️' : ev.file_type === 'video' ? '🎬' : '📄'}
              </Text>
              <Text style={styles.evidenceDesc} numberOfLines={2}>{ev.description}</Text>
              <StatusBadge
                label={ev.review_status === 'APPROVED' ? '✓' : ev.review_status === 'REJECTED' ? '✗' : '…'}
                variant={ev.review_status === 'APPROVED' ? 'verified' : ev.review_status === 'REJECTED' ? 'gap' : 'pending'}
                style={styles.evidenceStatusBadge}
              />
            </View>
          ))}
        </View>
      )}

      {criterion.linked_evidence.length === 0 && criterion.status === 'GAP' && (
        <View style={styles.gapNotice}>
          <Text style={styles.gapText}>No evidence submitted for this criterion.</Text>
        </View>
      )}

      {criterion.assessor_notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Assessor note:</Text>
          <Text style={styles.notesText}>{criterion.assessor_notes}</Text>
        </View>
      )}

      {onPress && <Text style={styles.tapHint}>Tap to review →</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: { marginBottom: Spacing.xs },
  mandatoryRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs },
  mandatoryBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
  },
  mandatoryText: { fontSize: FontSize.xs, color: '#B91C1C', fontWeight: '700', letterSpacing: 0.4 },
  criterionText: {
    fontSize: FontSize.base,
    color: Colors.textPrimary,
    lineHeight: 22,
    marginVertical: Spacing.xs,
  },
  evidenceSection: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  evidenceLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: Spacing.xs },
  evidenceRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: Spacing.xs },
  evidenceIcon: { fontSize: 16, marginRight: Spacing.xs },
  evidenceDesc: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  evidenceStatusBadge: { marginLeft: Spacing.xs },
  gapNotice: {
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  gapText: { fontSize: FontSize.sm, color: Colors.error },
  notesBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  notesLabel: { fontSize: FontSize.xs, fontWeight: '700', color: '#15803D', marginBottom: 2 },
  notesText: { fontSize: FontSize.sm, color: '#166534' },
  tapHint: { fontSize: FontSize.xs, color: Colors.teal, textAlign: 'right', marginTop: Spacing.sm, fontWeight: '600' },
});
