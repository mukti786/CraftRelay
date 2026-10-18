import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import { Button } from '@/src/components/common/Button';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';
import type { UserRole } from '@/src/types';

const ROLES: { role: UserRole; label: string; icon: string; desc: string }[] = [
  { role: 'worker', icon: '🔧', label: 'Worker', desc: 'Declare skills, submit evidence, receive service requests' },
  { role: 'assessor', icon: '📋', label: 'Assessor', desc: 'Review evidence, record formal decisions' },
  { role: 'customer', icon: '🏠', label: 'Customer', desc: 'Discover verified workers, book services' },
  { role: 'admin', icon: '⚙️', label: 'Admin', desc: 'Manage qualifications, users, and audit records' },
];

/** Landing screen — onboarding + quick role selection for demo. */
export default function IndexScreen() {
  const { selectRole } = useAuth();

  const handleRoleSelect = (role: UserRole) => {
    selectRole(role);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.logoText}>⚡ CraftRelay</Text>
        <Text style={styles.tagline}>AI-Assisted Skill Assessment{'\n'}&amp; Service Discovery</Text>
        <Text style={styles.subtitle}>
          Connecting verified tradespeople with customers across India
        </Text>
      </View>

      {/* Key differentiators */}
      <View style={styles.featureRow}>
        {['🎓 Assessor-verified skills', '📝 Transparent assessment', '🔍 Trustworthy discovery'].map((f) => (
          <View key={f} style={styles.featurePill}>
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Demo quick-access */}
      <View style={styles.demoSection}>
        <Text style={styles.demoTitle}>🛠️ SIH Demo — Enter as Role</Text>
        <Text style={styles.demoSubtitle}>
          Select a role to explore the demo. This uses mock data — no account creation required.
        </Text>
        {ROLES.map(({ role, icon, label, desc }) => (
          <TouchableOpacity
            key={role}
            style={styles.roleCard}
            onPress={() => handleRoleSelect(role)}
            activeOpacity={0.85}
          >
            <Text style={styles.roleIcon}>{icon}</Text>
            <View style={styles.roleInfo}>
              <Text style={styles.roleLabel}>{label}</Text>
              <Text style={styles.roleDesc}>{desc}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Real login/register */}
      <View style={styles.authSection}>
        <Text style={styles.authLabel}>Have an account?</Text>
        <Button label="Sign In" onPress={() => router.push('/(auth)/login' as never)} variant="outline" style={styles.authBtn} />
        <Button label="Register" onPress={() => router.push('/(auth)/register' as never)} variant="ghost" style={styles.authBtn} />
      </View>

      <Text style={styles.disclaimer}>
        All qualification data on this platform is illustrative only. It is not derived from official
        NCVT, NSDC, or PMKVY records.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  hero: {
    backgroundColor: Colors.navy,
    borderRadius: 16,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  logoText: { fontSize: 28, fontWeight: '800', color: Colors.white, marginBottom: Spacing.xs },
  tagline: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.white, textAlign: 'center', lineHeight: 30 },
  subtitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: Spacing.sm, lineHeight: 20 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.lg },
  featurePill: { backgroundColor: Colors.teal + '22', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs },
  featureText: { fontSize: FontSize.xs, color: Colors.teal, fontWeight: '600' },
  demoSection: { marginBottom: Spacing.lg },
  demoTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary, marginBottom: Spacing.xs },
  demoSubtitle: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md, lineHeight: 20 },
  roleCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  roleIcon: { fontSize: 28, marginRight: Spacing.md },
  roleInfo: { flex: 1 },
  roleLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  roleDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, lineHeight: 16 },
  chevron: { fontSize: 22, color: Colors.textMuted },
  authSection: { alignItems: 'center', marginBottom: Spacing.lg, gap: Spacing.sm },
  authLabel: { fontSize: FontSize.sm, color: Colors.textSecondary },
  authBtn: { width: 200 },
  disclaimer: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
});
