import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { MockDataBanner, Card, SectionHeader, EmptyState } from '@/src/components/common/Primitives';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { Button } from '@/src/components/common/Button';
import { MOCK_ASSESSMENT_CASES } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import type { AssessmentStatus } from '@/src/types';

const caseStatusVariant: Record<AssessmentStatus, 'verified' | 'pending' | 'gap' | 'declared' | 'info' | 'warning' | 'neutral'> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  AWAITING_ASSESSOR: 'pending',
  NEEDS_REVISION: 'warning',
  COMPLETED: 'verified',
};

export default function AssessorQueueScreen() {
  const { logout } = useAuth();

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Assessor notice */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>Assessor Responsibility</Text>
        <Text style={styles.noticeText}>
          Only you can formally verify or reject competency evidence. Your decision is recorded as an audit event and cannot be reversed without a new decision.
        </Text>
      </View>

      <SectionHeader
        title="Assessment Queue"
        subtitle={`${MOCK_ASSESSMENT_CASES.length} case(s) pending review`}
      />

      {MOCK_ASSESSMENT_CASES.length === 0 ? (
        <EmptyState icon="📋" title="Queue empty" description="No assessment cases requiring review." />
      ) : (
        MOCK_ASSESSMENT_CASES.map((ac) => {
          const gap = ac.criteria_summary;
          return (
            <TouchableOpacity
              key={ac.id}
              style={styles.caseCard}
              onPress={() => router.push('/(assessor)/review' as never)}
              activeOpacity={0.85}
            >
              {/* Worker info */}
              <View style={styles.caseHeader}>
                <View style={styles.caseAvatar}>
                  <Text style={styles.caseAvatarText}>{ac.worker.avatar_initials}</Text>
                </View>
                <View style={styles.caseInfo}>
                  <Text style={styles.workerName}>{ac.worker.full_name}</Text>
                  <Text style={styles.workerTrade}>{ac.worker.trade} · {ac.worker.service_area}</Text>
                  <Text style={styles.qualTitle} numberOfLines={1}>{ac.qualification.title}</Text>
                  <Text style={styles.qualNote}>{ac.qualification.note}</Text>
                </View>
                <StatusBadge label={ac.status.replace(/_/g, ' ')} variant={caseStatusVariant[ac.status]} />
              </View>

              {/* Gap progress */}
              <View style={styles.gapRow}>
                {[
                  { label: 'Verified', val: gap.verified, color: Colors.success },
                  { label: 'Pending', val: gap.pending, color: Colors.warning },
                  { label: 'Gaps', val: gap.gap, color: Colors.error },
                  { label: 'Action', val: gap.needs_action, color: Colors.info },
                ].map(({ label, val, color }) => (
                  <View key={label} style={styles.gapItem}>
                    <Text style={[styles.gapVal, { color }]}>{val}</Text>
                    <Text style={styles.gapLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.tapHint}>Tap to review →</Text>
            </TouchableOpacity>
          );
        })
      )}

      <Button label="Sign Out" onPress={() => { logout(); router.replace('/' as never); }} variant="ghost" style={styles.logoutBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  noticeBox: { backgroundColor: '#EFF6FF', margin: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.info },
  noticeTitle: { fontSize: FontSize.base, fontWeight: '700', color: '#1D4ED8', marginBottom: Spacing.xs },
  noticeText: { fontSize: FontSize.sm, color: '#1E40AF', lineHeight: 20 },
  caseCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  caseHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.md },
  caseAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.sm },
  caseAvatarText: { color: Colors.white, fontWeight: '700', fontSize: FontSize.base },
  caseInfo: { flex: 1, marginRight: Spacing.sm },
  workerName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  workerTrade: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  qualTitle: { fontSize: FontSize.xs, color: Colors.teal, marginTop: 4, fontWeight: '600' },
  qualNote: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 1 },
  gapRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, marginBottom: Spacing.sm },
  gapItem: { alignItems: 'center' },
  gapVal: { fontSize: FontSize.lg, fontWeight: '800' },
  gapLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  tapHint: { fontSize: FontSize.xs, color: Colors.teal, textAlign: 'right', fontWeight: '600' },
  logoutBtn: { margin: Spacing.lg },
});
