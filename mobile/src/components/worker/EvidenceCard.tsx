import { View, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import { StatusBadge } from '../common/StatusBadge';
import type { EvidenceItem } from '@/src/types';

interface EvidenceCardProps {
  evidence: EvidenceItem;
}

const fileIcon = { image: '🖼️', video: '🎬', document: '📄' } as const;
const reviewVariant = { APPROVED: 'verified', REJECTED: 'gap', PENDING: 'pending' } as const;
const reviewLabel = { APPROVED: 'Approved ✓', REJECTED: 'Rejected ✗', PENDING: 'Pending Review' } as const;

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const date = new Date(evidence.submitted_at).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.icon}>{fileIcon[evidence.file_type]}</Text>
        <View style={styles.headerInfo}>
          <Text style={styles.skill}>{evidence.skill_name}</Text>
          <Text style={styles.date}>Submitted {date}</Text>
        </View>
        <StatusBadge
          label={reviewLabel[evidence.review_status]}
          variant={reviewVariant[evidence.review_status]}
        />
      </View>

      <Text style={styles.description} numberOfLines={3}>{evidence.description}</Text>

      {evidence.reviewer_notes && (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Assessor note:</Text>
          <Text style={styles.notesText}>{evidence.reviewer_notes}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  icon: { fontSize: 28, marginRight: Spacing.sm },
  headerInfo: { flex: 1 },
  skill: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  date: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  description: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  notesBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginTop: Spacing.sm,
  },
  notesLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.error, marginBottom: 2 },
  notesText: { fontSize: FontSize.sm, color: '#B91C1C' },
});
