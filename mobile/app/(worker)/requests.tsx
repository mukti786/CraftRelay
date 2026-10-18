import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MockDataBanner, Card, SectionHeader, EmptyState } from '@/src/components/common/Primitives';
import { FormField } from '@/src/components/common/FormField';
import { Button } from '@/src/components/common/Button';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_SERVICE_REQUESTS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import type { ServiceRequestStatus } from '@/src/types';

const statusColors: Record<ServiceRequestStatus, { bg: string; text: string; label: string }> = {
  REQUESTED:          { bg: '#DBEAFE', text: '#1D4ED8', label: 'Requested' },
  ACCEPTED:           { bg: '#DCFCE7', text: '#15803D', label: 'Accepted' },
  DECLINED:           { bg: '#FEE2E2', text: '#B91C1C', label: 'Declined' },
  IN_PROGRESS:        { bg: '#FEF9C3', text: '#A16207', label: 'In Progress' },
  COMPLETION_PENDING: { bg: '#E0F2FE', text: '#0369A1', label: 'Pending Completion' },
  COMPLETED:          { bg: '#D1FAE5', text: '#065F46', label: 'Completed ✓' },
  CANCELLED:          { bg: '#F3F4F6', text: '#6B7280', label: 'Cancelled' },
};

const filterSchema = z.object({ query: z.string() });
type FilterForm = z.infer<typeof filterSchema>;

export default function WorkerRequestsScreen() {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');

  const requests = MOCK_SERVICE_REQUESTS.filter((r) => r.worker_id === 'wp-001' ||
    filter === 'all' ? true :
    filter === 'active' ? !['COMPLETED', 'CANCELLED', 'DECLINED'].includes(r.status) :
    r.status === 'COMPLETED'
  );

  const handleAccept = (id: string) => {
    Alert.alert('Mock only', `PATCH /requests/${id}/status {status: ACCEPTED} — wired in Part 3.`);
  };

  const handleComplete = (id: string) => {
    Alert.alert('Mock only', `POST /requests/${id}/complete — wired in Part 3.`);
  };

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'active', 'completed'] as const).map((f) => (
          <Button
            key={f}
            label={f.charAt(0).toUpperCase() + f.slice(1)}
            onPress={() => setFilter(f)}
            variant={filter === f ? 'secondary' : 'outline'}
            size="sm"
            style={styles.filterBtn}
          />
        ))}
      </View>

      {requests.length === 0 ? (
        <EmptyState icon="🔧" title="No service requests" description="New requests from customers will appear here." />
      ) : (
        requests.map((req) => {
          const sc = statusColors[req.status];
          return (
            <Card key={req.id}>
              <View style={styles.reqHeader}>
                <View style={styles.reqInfo}>
                  <Text style={styles.reqSkill}>{req.skill_requested}</Text>
                  <Text style={styles.reqCustomer}>From: {req.customer_name}</Text>
                  <Text style={styles.reqLocation}>📍 {req.location}</Text>
                  <Text style={styles.reqDate}>Preferred: {req.preferred_date}</Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                  <Text style={[styles.statusText, { color: sc.text }]}>{sc.label}</Text>
                </View>
              </View>

              <Text style={styles.reqDesc} numberOfLines={3}>{req.description}</Text>

              {/* Action buttons based on status */}
              {req.status === 'REQUESTED' && (
                <View style={styles.actionRow}>
                  <Button label="Accept" onPress={() => handleAccept(req.id)} variant="secondary" size="sm" style={styles.actionBtn} />
                  <Button label="Decline" onPress={() => Alert.alert('Mock', 'PATCH /status {DECLINED}')} variant="danger" size="sm" style={styles.actionBtn} />
                </View>
              )}
              {req.status === 'IN_PROGRESS' && (
                <Button label="Mark Complete" onPress={() => handleComplete(req.id)} variant="secondary" size="sm" />
              )}
              {req.status === 'COMPLETED' && (
                <View style={styles.completedBanner}>
                  <Text style={styles.completedText}>✓ Job completed · Customer confirmed: {req.customer_confirmed ? 'Yes' : 'Pending'}</Text>
                </View>
              )}
            </Card>
          );
        })
      )}

      <SectionHeader title="Status Reference" subtitle="Service request lifecycle" />
      <Card>
        <Text style={styles.lifecycleText}>
          REQUESTED → ACCEPTED / DECLINED{'\n'}
          ACCEPTED → IN_PROGRESS{'\n'}
          IN_PROGRESS → COMPLETION_PENDING → COMPLETED{'\n'}
          Any non-terminal → CANCELLED
        </Text>
        <Text style={styles.lifecycleNote}>
          ℹ️ Status changes are recorded as audit events. Only the worker can mark IN_PROGRESS → COMPLETION_PENDING; customer confirms completion.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, padding: Spacing.md },
  filterBtn: { flex: 1 },
  reqHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.sm },
  reqInfo: { flex: 1 },
  reqSkill: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary },
  reqCustomer: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2 },
  reqLocation: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  reqDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  statusPill: { borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  statusText: { fontSize: FontSize.xs, fontWeight: '700' },
  reqDesc: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.sm },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  actionBtn: { flex: 1 },
  completedBanner: { backgroundColor: '#D1FAE5', borderRadius: BorderRadius.md, padding: Spacing.sm },
  completedText: { fontSize: FontSize.xs, color: '#065F46', fontWeight: '600' },
  lifecycleText: { fontSize: FontSize.sm, color: Colors.textPrimary, fontFamily: 'monospace', lineHeight: 22 },
  lifecycleNote: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm, lineHeight: 18 },
});
