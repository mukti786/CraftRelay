import { Tabs } from 'expo-router';
import { Colors } from '@/src/constants/Colors';

export default function WorkerLayout() {
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
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <TabIcon icon="🏠" color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'My Profile', tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <TabIcon icon="👤" color={color} /> }} />
      <Tabs.Screen name="evidence" options={{ title: 'Evidence', tabBarLabel: 'Evidence', tabBarIcon: ({ color }) => <TabIcon icon="📎" color={color} /> }} />
      <Tabs.Screen name="assessment" options={{ title: 'Assessment', tabBarLabel: 'Assessment', tabBarIcon: ({ color }) => <TabIcon icon="📋" color={color} /> }} />
      <Tabs.Screen name="requests" options={{ title: 'Requests', tabBarLabel: 'Requests', tabBarIcon: ({ color }) => <TabIcon icon="🔧" color={color} /> }} />
    </Tabs>
  );
}

function TabIcon({ icon, color }: { icon: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, color }}>{icon}</Text>;
}
