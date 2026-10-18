import { Tabs } from 'expo-router';
import { Colors } from '@/src/constants/Colors';
import { Text } from 'react-native';

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 20 }}>{icon}</Text>;
}

export default function AssessorLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.teal,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: { borderTopColor: Colors.border },
        headerStyle: { backgroundColor: Colors.navy },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen name="queue" options={{ title: 'Assessment Queue', tabBarLabel: 'Queue', tabBarIcon: () => <TabIcon icon="📋" /> }} />
      <Tabs.Screen name="review" options={{ title: 'Review Case', tabBarLabel: 'Review', tabBarIcon: () => <TabIcon icon="🔍" /> }} />
    </Tabs>
  );
}
