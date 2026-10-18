/**
 * Auth context — Part 2: mock implementation only.
 * Real token persistence with Expo SecureStore added in Part 3.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { User, UserRole } from '@/src/types';
import { MOCK_USERS } from '@/src/mock/mockData';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, _password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  selectRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (
    email: string,
    _password: string,
  ): Promise<{ success: boolean; error?: string }> => {
    // Part 2: mock login — finds demo user by email prefix.
    // Part 3 will replace this with a real API call + SecureStore.
    const found = MOCK_USERS.find((u) => u.email === email);
    if (found) {
      setUser(found);
      return { success: true };
    }
    return { success: false, error: 'Email not found in demo accounts.' };
  };

  const logout = () => setUser(null);

  const selectRole = (role: UserRole) => {
    const found = MOCK_USERS.find((u) => u.role === role);
    if (found) setUser(found);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, selectRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
