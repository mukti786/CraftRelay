import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TextInput } from 'react-native';
import { WorkerCard } from '@/src/components/worker/WorkerCard';
import { MockDataBanner, EmptyState, SectionHeader } from '@/src/components/common/Primitives';
import { MOCK_WORKERS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize, BorderRadius } from '@/src/constants/Colors';

export default function CustomerDiscoverScreen() {
  const [query, setQuery] = useState('');
  const [tradeFilter, setTradeFilter] = useState('');

  const trades = [...new Set(MOCK_WORKERS.map((w) => w.trade))];

  const filtered = MOCK_WORKERS.filter((w) => {
    const q = query.toLowerCase();
    const matchQuery =
      q === '' ||
      w.full_name.toLowerCase().includes(q) ||
      w.trade.toLowerCase().includes(q) ||
      w.service_area.toLowerCase().includes(q) ||
      w.verified_competencies.some((vc) => vc.skill_name.toLowerCase().includes(q));
    const matchTrade = tradeFilter === '' || w.trade === tradeFilter;
    return matchQuery && matchTrade;
  });

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Search */}
      <View style={styles.searchBox}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, trade, skill, or location…"
          placeholderTextColor={Colors.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          accessibilityLabel="Search workers"
        />
      </View>

      {/* Trade filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <ChipButton label="All Trades" active={tradeFilter === ''} onPress={() => setTradeFilter('')} />
        {trades.map((t) => (
          <ChipButton key={t} label={t} active={tradeFilter === t} onPress={() => setTradeFilter(t)} />
        ))}
      </ScrollView>

      {/* Important customer notice */}
      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>About Skill Verification</Text>
        <Text style={styles.noticeText}>
          Only skills marked <Text style={styles.noticeBold}>Verified ✓</Text> have been assessed by an authorized CraftRelay assessor.
          Self-declared skills are visible but clearly labelled as unverified.
          All qualification data is illustrative — not an official certification.
        </Text>
      </View>

      <SectionHeader title="Workers" subtitle={`${filtered.length} of ${MOCK_WORKERS.length} matching`} />

      {filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No workers found" description="Try a different search or clear the filter." />
      ) : (
        <View style={styles.listPad}>
          {filtered.map((w) => (
            <WorkerCard key={w.id} worker={w} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ChipButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Text
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
      accessibilityRole="button"
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  searchBox: {
    margin: Spacing.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
  },
  searchInput: { height: 44, fontSize: FontSize.base, color: Colors.textPrimary },
  chipRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm, gap: Spacing.xs },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  chipActive: {
    backgroundColor: Colors.navy,
    borderColor: Colors.navy,
    color: Colors.white,
  },
  noticeBox: {
    backgroundColor: '#EFF6FF',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: Colors.teal,
  },
  noticeTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.navy, marginBottom: Spacing.xs },
  noticeText: { fontSize: FontSize.sm, color: '#1E40AF', lineHeight: 20 },
  noticeBold: { fontWeight: '700', color: '#15803D' },
  listPad: { paddingHorizontal: Spacing.md },
});
