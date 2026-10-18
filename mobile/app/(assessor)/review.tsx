import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MockDataBanner, Card, SectionHeader } from '@/src/components/common/Primitives';
import { CriterionCard } from '@/src/components/assessor/CriterionCard';
import { FormField } from '@/src/components/common/FormField';
import { Button } from '@/src/components/common/Button';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_ASSESSMENT_CASES } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';

const decisionSchema = z.object({
  criterion_id: z.string().min(1, 'Select a criterion'),
  decision: z.enum(['APPROVED', 'REJECTED', 'MORE_EVIDENCE_REQUIRED'], {
    required_error: 'Select a decision',
  }),
  notes: z.string().min(5, 'Provide at least 5 characters of notes'),
});
type DecisionForm = z.infer<typeof decisionSchema>;

export default function AssessorReviewScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [lastDecision, setLastDecision] = useState<DecisionForm | null>(null);
  const activeCase = MOCK_ASSESSMENT_CASES[0];
  const qual = activeCase.qualification;

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<DecisionForm>({
    resolver: zodResolver(decisionSchema),
    defaultValues: { criterion_id: '', decision: 'APPROVED', notes: '' },
  });

  const selectedCriterion = watch('criterion_id');

  const onSubmit = async (data: DecisionForm) => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    setLastDecision(data);
    reset();

    const message =
      data.decision === 'APPROVED'
        ? '✅ Evidence approved. If all criteria are met, a VerifiedCompetency record will be created.'
        : data.decision === 'REJECTED'
        ? '❌ Evidence rejected. Worker will see your notes and can resubmit.'
        : '📩 More evidence requested. Worker will see your notes.';

    Alert.alert(
      'Mock decision recorded',
      `${message}\n\nIn Part 3, this calls POST /assessment/cases/${activeCase.id}/decide and creates an AuditEvent.`,
    );
  };

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Case header */}
      <View style={styles.header}>
        <Text style={styles.workerName}>{activeCase.worker.full_name}</Text>
        <Text style={styles.qualTitle}>{qual.title}</Text>
        <Text style={styles.qualNote}>{qual.note}</Text>
        <StatusBadge label={activeCase.status.replace(/_/g, ' ')} variant="pending" style={styles.statusBadge} />
      </View>

      {/* Authorization reminder */}
      <View style={styles.authBox}>
        <Text style={styles.authText}>
          🔒 Only an authorized assessor can issue verification decisions. Decisions create permanent audit records.
          Verified status cannot be removed without a new formal decision.
        </Text>
      </View>

      {/* Criteria review */}
      <SectionHeader title="Criteria Review" subtitle="Inspect evidence before deciding" />
      <View style={styles.listPad}>
        {qual.criteria.map((c) => (
          <CriterionCard key={c.id} criterion={c} showEvidence />
        ))}
      </View>

      {/* Last decision summary */}
      {lastDecision && (
        <Card style={styles.decisionRecord}>
          <Text style={styles.decisionTitle}>Last Decision (mock — not persisted):</Text>
          <Text style={styles.decisionDetail}>Criterion: {lastDecision.criterion_id}</Text>
          <Text style={styles.decisionDetail}>Decision: {lastDecision.decision}</Text>
          <Text style={styles.decisionDetail}>Notes: {lastDecision.notes}</Text>
        </Card>
      )}

      {/* Decision form */}
      <SectionHeader title="Record Decision" subtitle="Applies to the selected criterion" />
      <View style={styles.form}>
        {/* Criterion selector */}
        <Text style={styles.fieldLabel}>Select Criterion *</Text>
        {qual.criteria.map((c) => (
          <Controller key={c.id} control={control} name="criterion_id" render={({ field }) => (
            <Button
              label={`${c.mandatory ? 'M' : 'O'} — ${c.text.slice(0, 50)}…`}
              onPress={() => field.onChange(c.id)}
              variant={field.value === c.id ? 'primary' : 'outline'}
              size="sm"
              style={styles.criterionBtn}
            />
          )} />
        ))}
        {errors.criterion_id && <Text style={styles.errorText}>{errors.criterion_id.message}</Text>}

        {/* Decision selector */}
        <Text style={[styles.fieldLabel, { marginTop: Spacing.md }]}>Decision *</Text>
        <View style={styles.decisionRow}>
          {(['APPROVED', 'REJECTED', 'MORE_EVIDENCE_REQUIRED'] as const).map((d) => (
            <Controller key={d} control={control} name="decision" render={({ field }) => (
              <Button
                label={d === 'MORE_EVIDENCE_REQUIRED' ? 'More Evidence' : d.charAt(0) + d.slice(1).toLowerCase()}
                onPress={() => field.onChange(d)}
                variant={
                  field.value === d
                    ? d === 'APPROVED' ? 'secondary' : d === 'REJECTED' ? 'danger' : 'primary'
                    : 'outline'
                }
                size="sm"
                style={styles.decisionBtn}
              />
            )} />
          ))}
        </View>
        {errors.decision && <Text style={styles.errorText}>{errors.decision.message}</Text>}

        <Controller control={control} name="notes" render={({ field }) => (
          <FormField
            label="Decision Notes *"
            required
            multiline
            numberOfLines={4}
            placeholder="Explain your decision clearly. The worker will see these notes."
            value={field.value}
            onChangeText={field.onChange}
            error={errors.notes?.message}
          />
        )} />

        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⚠️ This decision will be recorded in the audit log. Only approve when you have reviewed all evidence for the criterion.
          </Text>
        </View>

        <Button
          label={submitting ? 'Recording…' : 'Record Decision'}
          onPress={handleSubmit(onSubmit)}
          loading={submitting}
          size="lg"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, padding: Spacing.lg },
  workerName: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  qualTitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  qualNote: { fontSize: FontSize.xs, color: '#FCD34D', marginTop: 2 },
  statusBadge: { marginTop: Spacing.sm },
  authBox: { backgroundColor: '#FEF9C3', margin: Spacing.md, borderRadius: BorderRadius.lg, padding: Spacing.md, borderLeftWidth: 4, borderLeftColor: Colors.warning },
  authText: { fontSize: FontSize.sm, color: '#92400E', lineHeight: 20 },
  listPad: { paddingHorizontal: Spacing.md },
  decisionRecord: { marginHorizontal: Spacing.md, backgroundColor: '#F0FDF4' },
  decisionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: '#15803D', marginBottom: Spacing.xs },
  decisionDetail: { fontSize: FontSize.sm, color: '#166534' },
  form: { padding: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs },
  criterionBtn: { marginBottom: Spacing.xs, alignSelf: 'stretch' },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginBottom: Spacing.sm },
  decisionRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xs },
  decisionBtn: { flex: 1 },
  warningBox: { backgroundColor: '#FEF3C7', borderRadius: BorderRadius.md, padding: Spacing.sm, marginBottom: Spacing.md },
  warningText: { fontSize: FontSize.xs, color: '#92400E', lineHeight: 18 },
});
