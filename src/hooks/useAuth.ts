import { useState, useCallback, useEffect } from 'react';
import { User, AuthState } from '@/types/auth';
import { supabase } from '@/lib/supabaseClient';

function mapSupabaseUserToAppUser(sbUser: any): User {
  const meta = sbUser?.user_metadata || {};
  const email: string = sbUser?.email || '';
  return {
    id: sbUser?.id || '',
    username: meta.username || email || 'user',
    role: (meta.role as User['role']) || 'user',
    name: meta.name || email?.split('@')[0] || 'User',
  };
}

export const useAuth = () => {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
  });

  const ensureProfile = useCallback(async (sbUser: any) => {
    if (!sbUser) return;
    const meta = sbUser.user_metadata || {};
    const email: string = sbUser.email || '';
    const username = meta.username || email?.split('@')[0] || 'user';
    const name = meta.name || email?.split('@')[0] || 'User';
    const role = (meta.role as User['role']) || 'user';
    // Best-effort upsert; ignore errors in client for now
    await supabase.from('profiles').upsert({
      id: sbUser.id,
      username,
      name,
      role,
    }).select().single();
  }, []);

  // Initialize from existing session and subscribe to changes
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const sbUser = data.session?.user;
      if (isMounted && sbUser) {
        setAuthState({ user: mapSupabaseUserToAppUser(sbUser), isAuthenticated: true });
        await ensureProfile(sbUser);
      }
    };
    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sbUser = session?.user;
      if (sbUser) {
        setAuthState({ user: mapSupabaseUserToAppUser(sbUser), isAuthenticated: true });
        // Fire and forget
        ensureProfile(sbUser);
      } else {
        setAuthState({ user: null, isAuthenticated: false });
      }
    });

    return () => {
      isMounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }
      const sbUser = data.user;
      if (!sbUser) {
        return { success: false, error: 'No user returned from Supabase' };
      }
      setAuthState({ user: mapSupabaseUserToAppUser(sbUser), isAuthenticated: true });
      await ensureProfile(sbUser);
      return { success: true };
    },
    [ensureProfile]
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      options?: { name?: string; username?: string }
    ): Promise<{ success: boolean; needsConfirmation?: boolean; error?: string }> => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: options?.name,
            username: options?.username,
            role: 'user',
          },
        },
      });
      if (error) return { success: false, error: error.message };
      const sbUser = data.user;
      if (sbUser) {
        await ensureProfile(sbUser);
      }
      // If email confirmation is required, session/user may be null
      const needsConfirmation = !data.session;
      return { success: true, needsConfirmation };
    },
    [ensureProfile]
  );

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setAuthState({ user: null, isAuthenticated: false });
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    const redirectTo = window.location.origin; // Supabase will redirect here with type=recovery
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  const updatePassword = useCallback(async (newPassword: string): Promise<{ success: boolean; error?: string }> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }, []);

  return {
    ...authState,
    login,
    signUp,
    logout,
    requestPasswordReset,
    updatePassword,
  };
};