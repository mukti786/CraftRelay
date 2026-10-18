import { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Alert, Switch } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { MockDataBanner, Card, SectionHeader } from '@/src/components/common/Primitives';
import { FormField } from '@/src/components/common/FormField';
import { Button } from '@/src/components/common/Button';
import { StatusBadge } from '@/src/components/common/StatusBadge';
import { MOCK_WORKERS } from '@/src/mock/mockData';
import { Colors, Spacing, FontSize } from '@/src/constants/Colors';

// Keep all fields as strings so the form stays consistent with RHF's internal state.
// experience_years is validated as a numeric string; conversion happens in onSubmit.
const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  trade: z.string().min(2, 'Trade is required'),
  experience_years: z
    .string()
    .regex(/^\d+$/, 'Must be a whole number')
    .refine((v) => parseInt(v, 10) >= 0 && parseInt(v, 10) <= 60, 'Enter 0–60 years'),
  service_area: z.string().min(3, 'Service area required'),
  bio: z.string().max(300, 'Bio must be under 300 characters'),
});
type ProfileForm = z.infer<typeof profileSchema>;

export default function WorkerProfileScreen() {
  const worker = MOCK_WORKERS[0];
  const [available, setAvailable] = useState(worker.is_available);
  const [saved, setSaved] = useState(false);

  const { control, handleSubmit, formState: { errors, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: worker.full_name,
      trade: worker.trade,
      experience_years: String(worker.experience_years),
      service_area: worker.service_area,
      bio: worker.bio,
    },
  });

  const onSubmit = (_data: ProfileForm) => {
    // All fields are strings here; numeric conversion is applied before API call.
    // Part 3 will call PATCH /workers/me with { ...data, experience_years: parseInt(data.experience_years) }
    setSaved(true);
    Alert.alert(
      'Mock only',
      'Profile changes are not persisted. Backend PATCH /workers/me is wired in Part 3.',
      [{ text: 'OK', onPress: () => setSaved(false) }],
    );
  };

  return (
    <ScrollView style={styles.container}>
      <MockDataBanner />

      {/* Avatar + availability */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{worker.avatar_initials}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name}>{worker.full_name}</Text>
          <View style={styles.availRow}>
            <Text style={styles.availLabel}>Available for work</Text>
            <Switch
              value={available}
              onValueChange={setAvailable}
              trackColor={{ false: Colors.border, true: Colors.teal }}
              thumbColor={Colors.white}
            />
          </View>
        </View>
      </View>

      {/* Edit form */}
      <SectionHeader title="Edit Profile" />
      <View style={styles.form}>
        <Controller control={control} name="full_name" render={({ field }) => (
          <FormField label="Full Name" required value={field.value} onChangeText={field.onChange} error={errors.full_name?.message} />
        )} />
        <Controller control={control} name="trade" render={({ field }) => (
          <FormField label="Trade / Skill Category" required value={field.value} onChangeText={field.onChange} error={errors.trade?.message} />
        )} />
        <Controller control={control} name="experience_years" render={({ field }) => (
          <FormField label="Years of Experience" required keyboardType="numeric" value={field.value} onChangeText={field.onChange} error={errors.experience_years?.message} />
        )} />
        <Controller control={control} name="service_area" render={({ field }) => (
          <FormField label="Service Area (City, State)" required value={field.value} onChangeText={field.onChange} error={errors.service_area?.message} />
        )} />
        <Controller control={control} name="bio" render={({ field }) => (
          <FormField
            label="Bio (max 300 chars)"
            value={field.value}
            onChangeText={field.onChange}
            error={errors.bio?.message}
            multiline
            numberOfLines={4}
            hint="Describe your experience and specialisations."
          />
        )} />
        <Button
          label={saved ? 'Saved ✓' : 'Save Profile'}
          onPress={handleSubmit(onSubmit)}
          disabled={!isDirty && !saved}
        />
      </View>

      {/* Declared skills */}
      <SectionHeader title="Declared Skills" subtitle="Not assessor-verified" />
      {worker.declared_skills.map((skill) => (
        <Card key={skill.id} style={styles.skillCard}>
          <View style={styles.skillRow}>
            <Text style={styles.skillName}>{skill.skill_name}</Text>
            <StatusBadge label={skill.assessment_status.replace(/_/g, ' ')} variant="pending" />
          </View>
          <Text style={styles.skillMeta}>{skill.evidence_count} evidence submitted</Text>
        </Card>
      ))}
      <Button
        label="+ Declare a New Skill"
        onPress={() => Alert.alert('Mock only', 'Skill declaration connects to POST /skills in Part 3.')}
        variant="outline"
        style={styles.declareBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', padding: Spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.teal, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  avatarText: { color: Colors.white, fontWeight: '800', fontSize: FontSize.xl },
  headerInfo: { flex: 1 },
  name: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.white },
  availRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.xs, gap: Spacing.sm },
  availLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.8)' },
  form: { padding: Spacing.md },
  skillCard: { marginHorizontal: Spacing.md },
  skillRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skillName: { fontSize: FontSize.base, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  skillMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  declareBtn: { margin: Spacing.md },
});
