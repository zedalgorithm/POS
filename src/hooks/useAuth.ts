import { useState, useCallback } from 'react';
import { User, AuthState } from '@/types/auth';

// Mock users for demo - in real app, this would come from your backend
const mockUsers: (User & { password: string })[] = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    name: 'Administrator'
  },
  {
    id: '2',
    username: 'cashier',
    password: 'cashier123',
    role: 'user',
    name: 'Cashier User'
  }
];

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false
  });

  const login = useCallback(async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const user = mockUsers.find(u => u.username === username && u.password === password);
    
    if (user) {
      const { password: _, ...userWithoutPassword } = user;
      setAuthState({
        user: userWithoutPassword,
        isAuthenticated: true
      });
      return { success: true };
    } else {
      return { success: false, error: 'Invalid username or password' };
    }
  }, []);

  const logout = useCallback(() => {
    setAuthState({
      user: null,
      isAuthenticated: false
    });
  }, []);

  return {
    ...authState,
    login,
    logout
  };
};