import { useEffect } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';

/**
 * Inner component: handles role-based redirection after auth state changes.
 */
function RootNavigator() {
  const { user, isAuthenticated } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === undefined;

    if (!isAuthenticated && !inAuth && !inOnboarding) {
      router.replace('/(auth)/login' as never);
    } else if (isAuthenticated && user) {
      const inCorrectGroup = segments[0] === `(${user.role})`;
      if (!inCorrectGroup) {
        switch (user.role) {
          case 'worker':   router.replace('/(worker)/dashboard' as never); break;
          case 'assessor': router.replace('/(assessor)/queue' as never); break;
          case 'customer': router.replace('/(customer)/discover' as never); break;
          case 'admin':    router.replace('/(admin)/dashboard' as never); break;
        }
      }
    }
  }, [isAuthenticated, user, segments]);

  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0D2B5E' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerBackTitle: 'Back',
        }}
      />
      <StatusBar style="light" />
    </>
  );
}

/** Root layout — wraps every route in the AuthProvider. */
export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
