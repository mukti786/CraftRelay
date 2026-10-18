import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { MockDataBanner, Card, SectionHeader } from '@/src/components/common/Primitives';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { Button } from '@/src/components/common/Button';
import { MOCK_WORKERS, MOCK_ASSESSMENT_CASES, MOCK_APPROVED_TASKS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';
import type { AssessmentStatus } from '@/src/types';

const assessmentStatusMap: Record<AssessmentStatus, { label: string; variant: 'verified' | 'pending' | 'gap' | 'declared' | 'info' | 'warning' | 'neutral' }> = {
  NOT_STARTED: { label: 'Not Started', variant: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', variant: 'info' },
  AWAITING_ASSESSOR: { label: 'Awaiting Assessor', variant: 'pending' },
  NEEDS_REVISION: { label: 'Needs Revision', variant: 'warning' },
  COMPLETED: { label: 'Completed ✓', variant: 'verified' },
};

export default function WorkerDashboard() {
  const { logout } = useAuth();
  const worker = MOCK_WORKERS[0]; // Arjun Sharma — demo worker
  const activeCase = MOCK_ASSESSMENT_CASES[0];
  const gap = activeCase.criteria_summary;

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{worker.avatar_initials}</Text>
        </View>
        <View style={styles.heroInfo}>
          <Text style={styles.heroName}>{worker.full_name}</Text>
          <Text style={styles.heroTrade}>{worker.trade} · {worker.experience_years} yrs exp</Text>
          <Text style={styles.heroArea}>📍 {worker.service_area}</Text>
        </View>
      </View>

      {/* Assessment progress */}
      <SectionHeader title="Active Assessment" subtitle={activeCase.qualification.title} />
      <Card style={styles.progressCard}>
        <Text style={styles.qualNote}>{activeCase.qualification.note}</Text>
        <View style={styles.summaryRow}>
          {[
            { label: 'Total', val: gap.total, color: Colors.textPrimary },
            { label: 'Verified', val: gap.verified, color: Colors.success },
            { label: 'Pending', val: gap.pending, color: Colors.warning },
            { label: 'Gaps', val: gap.gap, color: Colors.error },
            { label: 'Action', val: gap.needs_action, color: Colors.info },
          ].map(({ label, val, color }) => (
            <View key={label} style={styles.summaryItem}>
              <Text style={[styles.summaryVal, { color }]}>{val}</Text>
              <Text style={styles.summaryLabel}>{label}</Text>
            </View>
          ))}
        </View>
        <Button label="View Assessment Details" onPress={() => router.push('/(worker)/assessment' as never)} variant="outline" size="sm" />
      </Card>

      {/* Declared skills */}
      <SectionHeader title="Declared Skills" subtitle="Assessment status per skill" />
      {worker.declared_skills.map((skill) => {
        const s = assessmentStatusMap[skill.assessment_status];
        return (
          <Card key={skill.id}>
            <View style={styles.skillRow}>
              <View style={styles.skillInfo}>
                <Text style={styles.skillName}>{skill.skill_name}</Text>
                <Text style={styles.skillMeta}>{skill.evidence_count} evidence item{skill.evidence_count !== 1 ? 's' : ''} submitted</Text>
              </View>
              <StatusBadge label={s.label} variant={s.variant} />
            </View>
            {skill.assessment_status === 'NEEDS_REVISION' && (
              <TouchableOpacity onPress={() => router.push('/(worker)/evidence' as never)}>
                <Text style={styles.actionLink}>→ Resubmit evidence</Text>
              </TouchableOpacity>
            )}
          </Card>
        );
      })}

      {/* Verified competencies */}
      <SectionHeader title="Verified Competencies" subtitle="Assessor-approved only" />
      {worker.verified_competencies.length === 0 ? (
        <Card>
          <Text style={styles.emptyText}>No verified competencies yet. Complete the assessment to earn verification.</Text>
        </Card>
      ) : (
        worker.verified_competencies.map((vc) => (
          <Card key={vc.id}>
            <View style={styles.skillRow}>
              <View style={styles.skillInfo}>
                <Text style={styles.skillName}>{vc.skill_name}</Text>
                <Text style={styles.skillMeta}>Verified by {vc.verified_by} · {new Date(vc.verified_at).toLocaleDateString('en-IN')}</Text>
                <Text style={styles.qualCode}>{vc.qualification_code}</Text>
              </View>
              <StatusBadge label="Verified ✓" variant="verified" />
            </View>
          </Card>
        ))
      )}

      {/* Recommended tasks for gaps */}
      <SectionHeader title="Recommended Practical Tasks" subtitle="For unresolved criteria gaps" />
      {MOCK_APPROVED_TASKS.map((task) => (
        <Card key={task.id}>
          <Text style={styles.taskTitle}>{task.title}</Text>
          <Text style={styles.taskDesc}>{task.description}</Text>
          <View style={styles.taskMeta}>
            <Text style={styles.taskMetaText}>⏱ {task.estimated_duration}</Text>
            <Text style={styles.taskMetaText}>📄 {task.rubric_reference}</Text>
          </View>
        </Card>
      ))}

      <Button label="Sign Out" onPress={() => { logout(); router.replace('/' as never); }} variant="ghost" style={styles.logoutBtn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  hero: { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', padding: Spacing.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.lg },
  heroInfo: { flex: 1 },
  heroName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  heroTrade: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  heroArea: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  progressCard: { marginHorizontal: Spacing.md },
  qualNote: { fontSize: FontSize.xs, color: Colors.warning, marginBottom: Spacing.sm, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.md },
  summaryItem: { alignItems: 'center' },
  summaryVal: { fontSize: FontSize.xl, fontWeight: '800' },
  summaryLabel: { fontSize: FontSize.xs, color: Colors.textMuted },
  skillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skillInfo: { flex: 1, marginRight: Spacing.sm },
  skillName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  skillMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  qualCode: { fontSize: FontSize.xs, color: Colors.teal, marginTop: 2 },
  actionLink: { fontSize: FontSize.sm, color: Colors.teal, marginTop: Spacing.xs, fontWeight: '600' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', padding: Spacing.sm },
  taskTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  taskDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.sm },
  taskMeta: { gap: Spacing.xs },
  taskMetaText: { fontSize: FontSize.xs, color: Colors.textMuted },
  logoutBtn: { margin: Spacing.lg },
});
