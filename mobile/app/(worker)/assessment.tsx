import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { MockDataBanner, Card, SectionHeader, EmptyState } from '@/src/components/common/Primitives';
import { CriterionCard } from '@/src/components/assessor/CriterionCard';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_ASSESSMENT_CASES, MOCK_APPROVED_TASKS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';

export default function AssessmentScreen() {
  const activeCase = MOCK_ASSESSMENT_CASES[0];
  const qual = activeCase.qualification;
  const gap = activeCase.criteria_summary;

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Qualification header */}
      <View style={styles.header}>
        <Text style={styles.qualCode}>{qual.code} — v{qual.version}</Text>
        <Text style={styles.qualTitle}>{qual.title}</Text>
        <Text style={styles.qualNote}>{qual.note}</Text>
      </View>

      {/* Progress summary */}
      <SectionHeader title="Criterion Progress" />
      <Card style={styles.progressCard}>
        <View style={styles.summaryRow}>
          {[
            { label: 'Verified', val: gap.verified, color: '#15803D', bg: '#DCFCE7' },
            { label: 'Pending', val: gap.pending, color: '#A16207', bg: '#FEF9C3' },
            { label: 'Gaps', val: gap.gap, color: '#B91C1C', bg: '#FEE2E2' },
            { label: 'Action', val: gap.needs_action, color: '#0369A1', bg: '#E0F2FE' },
          ].map(({ label, val, color, bg }) => (
            <View key={label} style={[styles.summaryItem, { backgroundColor: bg }]}>
              <Text style={[styles.summaryVal, { color }]}>{val}</Text>
              <Text style={[styles.summaryLabel, { color }]}>{label}</Text>
            </View>
          ))}
        </View>
        <StatusBadge
          label={activeCase.status.replace(/_/g, ' ')}
          variant={activeCase.status === 'COMPLETED' ? 'verified' : 'pending'}
        />
      </Card>

      {/* Gap detection rules explanation */}
      <SectionHeader title="Evidence Gap Rules" subtitle="How criterion status is determined" />
      <Card style={styles.rulesCard}>
        {[
          { icon: '🔴', status: 'GAP', rule: 'No evidence submitted for this criterion.' },
          { icon: '🟡', status: 'PENDING_REVIEW', rule: 'Evidence submitted but not yet reviewed by assessor.' },
          { icon: '🟠', status: 'ADDITIONAL_EVIDENCE_REQUIRED', rule: 'Evidence submitted but rejected or deemed insufficient.' },
          { icon: '🔵', status: 'PRACTICAL_VERIFICATION_REQUIRED', rule: 'An approved practical task must be observed by assessor.' },
          { icon: '🟢', status: 'READY_FOR_ASSESSOR_DECISION', rule: 'Evidence complete — awaiting formal assessor decision.' },
          { icon: '✅', status: 'VERIFIED', rule: 'Assessor has formally approved this competency. Cannot be changed without a new decision.' },
        ].map(({ icon, status, rule }) => (
          <View key={status} style={styles.ruleRow}>
            <Text style={styles.ruleIcon}>{icon}</Text>
            <View style={styles.ruleInfo}>
              <Text style={styles.ruleStatus}>{status}</Text>
              <Text style={styles.ruleText}>{rule}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Criteria per criterion */}
      <SectionHeader title="Criteria Detail" subtitle="Evidence linked to each criterion" />
      {qual.criteria.length === 0 ? (
        <EmptyState icon="📋" title="No criteria loaded" />
      ) : (
        <View style={styles.listPad}>
          {qual.criteria.map((c) => (
            <CriterionCard key={c.id} criterion={c} showEvidence />
          ))}
        </View>
      )}

      {/* Practical tasks for unresolved criteria */}
      <SectionHeader title="Recommended Practical Tasks" subtitle="Approved tasks for gap criteria" />
      {MOCK_APPROVED_TASKS.map((task) => (
        <Card key={task.id} style={styles.taskCard}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskCriterion}>→ Criterion: {task.linked_criterion_id}</Text>
          <Text style={styles.taskDesc}>{task.description}</Text>
          <Text style={styles.taskRubric}>📄 Rubric: {task.rubric_reference}</Text>
          <Text style={styles.taskDuration}>⏱ {task.estimated_duration}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, padding: Spacing.lg },
  qualCode: { fontSize: FontSize.xs, color: Colors.teal, fontWeight: '700', textTransform: 'uppercase' },
  qualTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white, marginTop: 2 },
  qualNote: { fontSize: FontSize.xs, color: '#FCD34D', marginTop: Spacing.xs },
  progressCard: { marginHorizontal: Spacing.md },
  summaryRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  summaryItem: { flex: 1, alignItems: 'center', borderRadius: 8, padding: Spacing.sm },
  summaryVal: { fontSize: FontSize.xl, fontWeight: '800' },
  summaryLabel: { fontSize: FontSize.xs, fontWeight: '600' },
  rulesCard: { marginHorizontal: Spacing.md },
  ruleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  ruleIcon: { fontSize: 18, marginRight: Spacing.sm },
  ruleInfo: { flex: 1 },
  ruleStatus: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary, fontFamily: 'monospace' },
  ruleText: { fontSize: FontSize.xs, color: Colors.textSecondary, lineHeight: 16 },
  listPad: { paddingHorizontal: Spacing.md },
  taskCard: { marginHorizontal: Spacing.md },
  taskTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  taskCriterion: { fontSize: FontSize.xs, color: Colors.teal, marginTop: 2 },
  taskDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginTop: Spacing.xs },
  taskRubric: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  taskDuration: { fontSize: FontSize.xs, color: Colors.textMuted },
});
