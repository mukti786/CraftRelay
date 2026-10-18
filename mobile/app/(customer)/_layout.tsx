import { Tabs } from 'expo-router';
import { Colors } from '@/src/constants/Colors';
import { Text } from 'react-native';

function TabIcon({ icon }: { icon: string }) {
  return <Text style={{ fontSize: 20 }}>{icon}</Text>;
}

export default function CustomerLayout() {
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
      <Tabs.Screen name="discover" options={{ title: 'Find Workers', tabBarLabel: 'Discover', tabBarIcon: () => <TabIcon icon="🔍" /> }} />
      <Tabs.Screen name="my-requests" options={{ title: 'My Requests', tabBarLabel: 'Requests', tabBarIcon: () => <TabIcon icon="📋" /> }} />
    </Tabs>
  );
}
