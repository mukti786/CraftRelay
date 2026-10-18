import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MockDataBanner, Card, SectionHeader, EmptyState } from '@/src/components/common/Primitives';
import { EvidenceCard } from '@/src/components/worker/EvidenceCard';
import { FormField } from '@/src/components/common/FormField';
import { Button } from '@/src/components/common/Button';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_EVIDENCE, MOCK_QUALIFICATIONS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';

const evidenceSchema = z.object({
  skill_name: z.string().min(2, 'Skill is required'),
  criterion_id: z.string().min(1, 'Select a criterion'),
  description: z.string().min(20, 'Describe your evidence in at least 20 characters'),
});
type EvidenceForm = z.infer<typeof evidenceSchema>;

export default function EvidenceScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const qual = MOCK_QUALIFICATIONS[0];

  const { control, handleSubmit, reset, formState: { errors } } = useForm<EvidenceForm>({
    resolver: zodResolver(evidenceSchema),
    defaultValues: { skill_name: '', criterion_id: '', description: '' },
  });

  const onSubmit = async (_data: EvidenceForm) => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1200)); // simulate network
    setSubmitting(false);
    setSubmitted(true);
    reset();
    Alert.alert(
      'Mock submission only',
      'Evidence is not saved to any server in Part 2. File upload + POST /evidence/submit is implemented in Part 4.',
    );
  };

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Existing evidence */}
      <SectionHeader title="Submitted Evidence" subtitle="Your evidence and review status" />
      {MOCK_EVIDENCE.length === 0 ? (
        <EmptyState icon="📎" title="No evidence submitted" description="Use the form below to submit your first piece of evidence." />
      ) : (
        <View style={styles.listPad}>
          {MOCK_EVIDENCE.map((ev) => <EvidenceCard key={ev.id} evidence={ev} />)}
        </View>
      )}

      {/* Qualification criteria reference */}
      <SectionHeader title="Qualification Criteria" subtitle={qual.title} />
      <Card style={styles.qualCard}>
        <Text style={styles.qualNote}>{qual.note}</Text>
        {qual.criteria.map((c) => (
          <View key={c.id} style={styles.criterionRow}>
            <StatusBadge label={c.status} variant={c.status === 'VERIFIED' ? 'verified' : c.status === 'GAP' ? 'gap' : 'pending'} />
            <Text style={styles.criterionText} numberOfLines={2}>{c.text}</Text>
            {c.mandatory && <Text style={styles.mandatory}>M</Text>}
          </View>
        ))}
      </Card>

      {/* Submit new evidence */}
      <SectionHeader title="Submit New Evidence" subtitle="Mapped to a specific criterion" />
      <View style={styles.form}>
        {submitted && (
          <View style={styles.successBanner}>
            <Text style={styles.successText}>✓ Submitted (mock only — not persisted)</Text>
          </View>
        )}

        <Controller control={control} name="skill_name" render={({ field }) => (
          <FormField label="Skill" required placeholder="e.g. Low-voltage wiring" value={field.value} onChangeText={field.onChange} error={errors.skill_name?.message} />
        )} />

        <Text style={styles.fieldLabel}>Criterion (select by ID)</Text>
        {qual.criteria.map((c) => (
          <Controller key={c.id} control={control} name="criterion_id" render={({ field }) => (
            <Button
              label={`${c.id}: ${c.text.slice(0, 40)}…`}
              onPress={() => field.onChange(c.id)}
              variant={field.value === c.id ? 'secondary' : 'outline'}
              size="sm"
              style={styles.criterionBtn}
            />
          )} />
        ))}
        {errors.criterion_id && <Text style={styles.errorText}>{errors.criterion_id.message}</Text>}

        <Controller control={control} name="description" render={({ field }) => (
          <FormField
            label="Evidence Description"
            required
            multiline
            numberOfLines={4}
            placeholder="Describe what the evidence shows and how it demonstrates the criterion…"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.description?.message}
            hint="Photo/video file attachment will be available in Part 4."
          />
        )} />

        <View style={styles.uploadNotice}>
          <Text style={styles.uploadText}>
            📎 File attachment not yet implemented — Part 4 adds photo/document upload via Expo ImagePicker + FastAPI.
          </Text>
        </View>

        <Button
          label={submitting ? 'Submitting…' : 'Submit Evidence'}
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
  listPad: { paddingHorizontal: Spacing.md },
  qualCard: { marginHorizontal: Spacing.md },
  qualNote: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '600', marginBottom: Spacing.sm },
  criterionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, marginBottom: Spacing.xs },
  criterionText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary },
  mandatory: { fontSize: FontSize.xs, color: Colors.error, fontWeight: '800' },
  form: { padding: Spacing.md },
  successBanner: { backgroundColor: '#DCFCE7', borderRadius: 8, padding: Spacing.sm, marginBottom: Spacing.md },
  successText: { color: '#15803D', fontWeight: '600' },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs },
  criterionBtn: { marginBottom: Spacing.xs, alignSelf: 'stretch' },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginBottom: Spacing.sm },
  uploadNotice: { backgroundColor: '#EFF6FF', borderRadius: 8, padding: Spacing.sm, marginBottom: Spacing.md },
  uploadText: { fontSize: FontSize.xs, color: '#1D4ED8' },
});
