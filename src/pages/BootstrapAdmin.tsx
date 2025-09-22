import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

const BootstrapAdmin = () => {
  const { user, isAuthenticated } = useAuth();
  const [status, setStatus] = useState<null | { kind: 'ok' | 'err'; msg: string }>(null);
  const [loading, setLoading] = useState(false);

  const makeMeAdmin = async () => {
    setStatus(null);
    setLoading(true);
    try {
      if (!isAuthenticated || !user) {
        setStatus({ kind: 'err', msg: 'You must be signed in to promote an account.' });
        return;
      }
      // Update own user_metadata.role to 'admin'
      const { error: uerr } = await supabase.auth.updateUser({ data: { role: 'admin' } });
      if (uerr) {
        setStatus({ kind: 'err', msg: uerr.message });
        return;
      }
      // Best-effort sync to profiles table
      await supabase.from('profiles').upsert({ id: user.id, username: user.username, name: user.name, role: 'admin' });
      setStatus({ kind: 'ok', msg: 'This account is now admin. You can navigate to /admin.' });
    } catch (e: any) {
      setStatus({ kind: 'err', msg: e?.message || 'Unknown error' });
    } finally {
      setLoading(false);
    }
  };

  if (import.meta.env.VITE_ALLOW_BOOTSTRAP_ADMIN !== 'true') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card>
          <CardHeader>
            <CardTitle>Bootstrap Disabled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Set VITE_ALLOW_BOOTSTRAP_ADMIN=true in .env.local to enable this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Make Me Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This one-time bootstrap tool promotes the currently signed-in account to admin by updating user metadata and the profiles table.
          </p>
          {status && (
            <Alert variant={status.kind === 'err' ? 'destructive' : undefined}>
              <AlertDescription>{status.msg}</AlertDescription>
            </Alert>
          )}
          <Button onClick={makeMeAdmin} disabled={loading}>
            {loading ? 'Promoting...' : 'Promote current user to admin'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default BootstrapAdmin;
