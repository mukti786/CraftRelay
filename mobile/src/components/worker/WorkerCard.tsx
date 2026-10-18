import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';
import { StatusBadge } from '../common/StatusBadge';
import type { WorkerProfile } from '@/src/types';

interface WorkerCardProps {
  worker: WorkerProfile;
  onPress?: () => void;
}

export function WorkerCard({ worker, onPress }: WorkerCardProps) {
  const handlePress = onPress ?? (() => router.push(`/(customer)/worker/${worker.id}` as never));

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`View ${worker.full_name} profile`}
    >
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{worker.avatar_initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{worker.full_name}</Text>
          <Text style={styles.trade}>{worker.trade} · {worker.experience_years} yrs exp</Text>
          <Text style={styles.location}>📍 {worker.service_area}</Text>
        </View>
        <View style={styles.availability}>
          <View style={[styles.dot, worker.is_available ? styles.dotAvailable : styles.dotBusy]} />
          <Text style={styles.availText}>{worker.is_available ? 'Available' : 'Busy'}</Text>
        </View>
      </View>

      {/* Verified competencies */}
      {worker.verified_competencies.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Assessor-Verified Skills</Text>
          {worker.verified_competencies.map((vc) => (
            <View key={vc.id} style={styles.verifiedRow}>
              <StatusBadge label="Verified ✓" variant="verified" />
              <Text style={styles.verifiedSkill}>{vc.skill_name}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Declared only — clearly distinguished */}
      {worker.declared_skills.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Self-Declared (Assessment Pending)</Text>
          <Text style={styles.declaredList}>
            {worker.declared_skills.map((s) => s.skill_name).join(' · ')}
          </Text>
          <Text style={styles.disclaimer}>
            ⚠️ Declared skills are not assessor-verified competencies.
          </Text>
        </View>
      )}

      {/* Rating */}
      <View style={styles.footer}>
        <Text style={styles.rating}>{'★'.repeat(Math.round(worker.average_rating))} {worker.average_rating.toFixed(1)}</Text>
        <Text style={styles.reviewCount}>{worker.review_count} reviews</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  avatarText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: FontSize.md,
  },
  headerInfo: { flex: 1 },
  name: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  trade: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 1 },
  location: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  availability: { alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginBottom: 2 },
  dotAvailable: { backgroundColor: Colors.success },
  dotBusy: { backgroundColor: Colors.textMuted },
  availText: { fontSize: FontSize.xs, color: Colors.textMuted },
  section: { marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: Spacing.xs },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs },
  verifiedSkill: { fontSize: FontSize.sm, color: Colors.textPrimary, marginLeft: Spacing.xs, fontWeight: '600' },
  declaredList: { fontSize: FontSize.sm, color: Colors.textSecondary },
  disclaimer: { fontSize: FontSize.xs, color: Colors.warning, marginTop: Spacing.xs },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.sm, paddingTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border },
  rating: { fontSize: FontSize.sm, color: '#F59E0B', fontWeight: '600' },
  reviewCount: { fontSize: FontSize.xs, color: Colors.textMuted },
});
