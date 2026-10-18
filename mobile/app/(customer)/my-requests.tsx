import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MockDataBanner, Card, SectionHeader, EmptyState } from '@/src/components/common/Primitives';
import { FormField } from '@/src/components/common/FormField';
import { Button } from '@/src/components/common/Button';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_SERVICE_REQUESTS, MOCK_WORKERS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import type { ServiceRequestStatus } from '@/src/types';

const requestSchema = z.object({
  worker_id: z.string().min(1, 'Select a worker'),
  skill_requested: z.string().min(3, 'Specify the skill needed'),
  description: z.string().min(20, 'Describe the work in at least 20 characters'),
  location: z.string().min(3, 'Location required'),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
});
type RequestForm = z.infer<typeof requestSchema>;

const reviewSchema = z.object({
  rating: z.string().regex(/^[1-5]$/, 'Rating must be 1–5'),
  comment: z.string().min(5, 'Comment required'),
});
type ReviewForm = z.infer<typeof reviewSchema>;

const statusVariant: Record<ServiceRequestStatus, 'verified' | 'pending' | 'gap' | 'info' | 'warning' | 'neutral'> = {
  REQUESTED: 'info', ACCEPTED: 'declared' as never, DECLINED: 'gap', IN_PROGRESS: 'pending',
  COMPLETION_PENDING: 'warning', COMPLETED: 'verified', CANCELLED: 'neutral',
};

export default function CustomerRequestsScreen() {
  const [tab, setTab] = useState<'requests' | 'new'>('requests');
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const customerRequests = MOCK_SERVICE_REQUESTS; // demo: show all as customer's

  const { control: rc, handleSubmit: rhs, reset: rReset, formState: { errors: re } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { worker_id: '', skill_requested: '', description: '', location: '', preferred_date: '2026-04-10' },
  });

  const { control: vc, handleSubmit: vhs, reset: vReset, formState: { errors: ve } } = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { rating: '5', comment: '' },
  });

  const onRequestSubmit = async (_data: RequestForm) => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitting(false);
    rReset();
    setTab('requests');
    Alert.alert('Mock only', 'Service request not persisted. POST /requests/ is wired in Part 3.');
  };

  const onReviewSubmit = async (_data: ReviewForm) => {
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 800));
    setSubmitting(false);
    vReset();
    setReviewingId(null);
    Alert.alert('Mock only', 'Review not persisted. POST /requests/{id}/review is wired in Part 3.');
  };

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Tab switch */}
      <View style={styles.tabRow}>
        <Button label="My Requests" onPress={() => setTab('requests')} variant={tab === 'requests' ? 'primary' : 'outline'} size="sm" style={styles.tabBtn} />
        <Button label="New Request" onPress={() => setTab('new')} variant={tab === 'new' ? 'secondary' : 'outline'} size="sm" style={styles.tabBtn} />
      </View>

      {tab === 'requests' && (
        <>
          <SectionHeader title="My Service Requests" subtitle={`${customerRequests.length} total`} />
          {customerRequests.length === 0 ? (
            <EmptyState icon="📋" title="No requests yet" description="Create a new service request to get started." actionLabel="New Request" onAction={() => setTab('new')} />
          ) : (
            customerRequests.map((req) => (
              <Card key={req.id}>
                <View style={styles.reqHeader}>
                  <View style={styles.reqInfo}>
                    <Text style={styles.reqSkill}>{req.skill_requested}</Text>
                    <Text style={styles.reqWorker}>Worker: {req.worker.full_name} ({req.worker.trade})</Text>
                    <Text style={styles.reqMeta}>📍 {req.location} · {req.preferred_date}</Text>
                  </View>
                  <StatusBadge label={req.status.replace(/_/g, ' ')} variant={statusVariant[req.status] as never} />
                </View>
                <Text style={styles.reqDesc} numberOfLines={2}>{req.description}</Text>
                {req.status === 'COMPLETED' && !req.customer_confirmed && (
                  <View style={styles.reviewSection}>
                    {reviewingId === req.id ? (
                      <>
                        <Text style={styles.reviewTitle}>Leave a Review</Text>
                        <Controller control={vc} name="rating" render={({ field }) => (
                          <FormField label="Rating (1–5)" required keyboardType="numeric" value={field.value} onChangeText={field.onChange} error={ve.rating?.message} />
                        )} />
                        <Controller control={vc} name="comment" render={({ field }) => (
                          <FormField label="Comment" required multiline numberOfLines={3} value={field.value} onChangeText={field.onChange} error={ve.comment?.message} />
                        )} />
                        <View style={styles.reviewBtns}>
                          <Button label="Submit Review" onPress={vhs(onReviewSubmit)} loading={submitting} size="sm" style={styles.reviewBtn} />
                          <Button label="Cancel" onPress={() => setReviewingId(null)} variant="ghost" size="sm" style={styles.reviewBtn} />
                        </View>
                      </>
                    ) : (
                      <Button label="Leave a Review" onPress={() => setReviewingId(req.id)} variant="secondary" size="sm" />
                    )}
                  </View>
                )}
                {req.status === 'COMPLETED' && req.customer_confirmed && (
                  <View style={styles.completedBanner}>
                    <Text style={styles.completedText}>✓ Completed and reviewed</Text>
                  </View>
                )}
              </Card>
            ))
          )}
        </>
      )}

      {tab === 'new' && (
        <>
          <SectionHeader title="New Service Request" subtitle="Select a verified worker" />
          <View style={styles.form}>
            <Text style={styles.fieldLabel}>Select Worker *</Text>
            {MOCK_WORKERS.map((w) => (
              <Controller key={w.id} control={rc} name="worker_id" render={({ field }) => (
                <View style={styles.workerOption}>
                  <Button
                    label={`${w.full_name} — ${w.trade}`}
                    onPress={() => { field.onChange(w.id); rc('skill_requested' as never, { value: w.trade } as never); }}
                    variant={field.value === w.id ? 'primary' : 'outline'}
                    size="sm"
                    style={styles.workerBtn}
                  />
                  {w.verified_competencies.length === 0 && (
                    <Text style={styles.noVerified}>⚠️ No verified skills</Text>
                  )}
                </View>
              )} />
            ))}
            {re.worker_id && <Text style={styles.errorText}>{re.worker_id.message}</Text>}

            <Controller control={rc} name="skill_requested" render={({ field }) => (
              <FormField label="Skill Required" required placeholder="e.g. Pipe fitting" value={field.value} onChangeText={field.onChange} error={re.skill_requested?.message} />
            )} />
            <Controller control={rc} name="description" render={({ field }) => (
              <FormField label="Description of Work" required multiline numberOfLines={4} placeholder="Describe exactly what you need done…" value={field.value} onChangeText={field.onChange} error={re.description?.message} />
            )} />
            <Controller control={rc} name="location" render={({ field }) => (
              <FormField label="Location" required placeholder="City, State" value={field.value} onChangeText={field.onChange} error={re.location?.message} />
            )} />
            <Controller control={rc} name="preferred_date" render={({ field }) => (
              <FormField label="Preferred Date (YYYY-MM-DD)" required placeholder="2026-04-10" value={field.value} onChangeText={field.onChange} error={re.preferred_date?.message} />
            )} />

            <Button label={submitting ? 'Sending…' : 'Send Request'} onPress={rhs(onRequestSubmit)} loading={submitting} size="lg" />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  tabRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  tabBtn: { flex: 1 },
  reqHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  reqInfo: { flex: 1, marginRight: Spacing.sm },
  reqSkill: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  reqWorker: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  reqMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  reqDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20 },
  reviewSection: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  reviewTitle: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.sm },
  reviewBtns: { flexDirection: 'row', gap: Spacing.sm },
  reviewBtn: { flex: 1 },
  completedBanner: { marginTop: Spacing.sm, backgroundColor: '#D1FAE5', borderRadius: BorderRadius.md, padding: Spacing.sm },
  completedText: { fontSize: FontSize.xs, color: '#065F46', fontWeight: '600' },
  form: { padding: Spacing.md },
  fieldLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary, marginBottom: Spacing.xs },
  workerOption: { marginBottom: Spacing.xs },
  workerBtn: { alignSelf: 'stretch' },
  noVerified: { fontSize: FontSize.xs, color: Colors.warning, marginTop: 2 },
  errorText: { fontSize: FontSize.xs, color: Colors.error, marginBottom: Spacing.sm },
});
