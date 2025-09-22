import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Store, User, Lock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export const Login = () => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset-request' | 'reset-update'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const { login, signUp, requestPasswordReset, updatePassword } = useAuth();

  // Detect Supabase recovery redirect
  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    if (search.includes('type=recovery') || hash.includes('type=recovery')) {
      setMode('reset-update');
      setInfo('Please set a new password for your account.');
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInfo('');
    setError('');

    setIsLoading(true);
    
    if (mode === 'signin') {
      if (!email || !password) {
        setError('Please fill in all fields');
        setIsLoading(false);
        return;
      }
      const result = await login(email, password);
      if (!result.success) {
        setError(result.error || 'Login failed');
      }
    } else if (mode === 'signup') {
      if (!email || !password) {
        setError('Please fill in all fields');
        setIsLoading(false);
        return;
      }
      const result = await signUp(email, password, { name, username });
      if (!result.success) {
        setError(result.error || 'Sign up failed');
      } else if (result.needsConfirmation) {
        setInfo('Check your email to confirm your account before signing in.');
      }
    } else if (mode === 'reset-request') {
      if (!email) {
        setError('Please provide your account email');
        setIsLoading(false);
        return;
      }
      const res = await requestPasswordReset(email);
      if (!res.success) {
        setError(res.error || 'Could not send reset email');
      } else {
        setInfo('If an account exists for that email, a reset link has been sent. Check your inbox.');
      }
    } else if (mode === 'reset-update') {
      if (!newPassword) {
        setError('Please enter a new password');
        setIsLoading(false);
        return;
      }
      const res = await updatePassword(newPassword);
      if (!res.success) {
        setError(res.error || 'Could not update password');
      } else {
        setInfo('Password updated. You can now sign in.');
        setMode('signin');
      }
    }
    
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo1.png" alt="SSP POS Logo" className="w-42 h-42 object-contain mx-auto mb-4 drop-shadow-md" />
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        <Card className="shadow-lg">  
          <CardHeader className="space-y-1">
            <CardTitle>
              {mode === 'signin' && 'Login'}
              {mode === 'signup' && 'Create account'}
              {mode === 'reset-request' && 'Reset your password'}
              {mode === 'reset-update' && 'Set a new password'}
            </CardTitle>
            <CardDescription>
              {mode === 'signin' && 'Enter your credentials to access the POS system'}
              {mode === 'signup' && 'Create a new account to access the POS system'}
              {mode === 'reset-request' && 'We will send a password reset link to your email'}
              {mode === 'reset-update' && 'Enter your new password to complete the reset'}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <div className="relative">
                      <Input
                        id="name"
                        type="text"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <div className="relative">
                      <Input
                        id="username"
                        type="text"
                        placeholder="Preferred username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                </>
              )}
              {(mode === 'signin' || mode === 'signup' || mode === 'reset-request') && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>
              )}
              {(mode === 'signin' || mode === 'signup') && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>
              )}
              {mode === 'reset-update' && (
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    id="new-password"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
              </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {info && !error && (
                <Alert>
                  <AlertDescription>{info}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full h-11" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'signin' && 'Signing in...'}
                    {mode === 'signup' && 'Creating account...'}
                    {mode === 'reset-request' && 'Sending reset link...'}
                    {mode === 'reset-update' && 'Updating password...'}
                  </>
                ) : (
                  (
                    (mode === 'signin' && 'Sign In') ||
                    (mode === 'signup' && 'Create Account') ||
                    (mode === 'reset-request' && 'Send reset link') ||
                    (mode === 'reset-update' && 'Set new password')
                  )
                )}
              </Button>
              <div className="text-sm text-center text-muted-foreground space-y-1">
                {mode === 'signin' && (
                  <>
                    <p>
                      Don’t have an account?{' '}
                      <button type="button" className="text-primary underline" onClick={() => setMode('signup')}>
                        Create one
                      </button>
                    </p>
                    <p>
                      Forgot your password?{' '}
                      <button type="button" className="text-primary underline" onClick={() => setMode('reset-request')}>
                        Reset it
                      </button>
                    </p>
                  </>
                )}
                {mode === 'signup' && (
                  <p>
                    Already have an account?{' '}
                    <button type="button" className="text-primary underline" onClick={() => setMode('signin')}>
                      Sign in
                    </button>
                  </p>
                )}
                {mode === 'reset-request' && (
                  <p>
                    Remembered your password?{' '}
                    <button type="button" className="text-primary underline" onClick={() => setMode('signin')}>
                      Back to sign in
                    </button>
                  </p>
                )}
                {mode === 'reset-update' && (
                  <p>
                    Done updating?{' '}
                    <button type="button" className="text-primary underline" onClick={() => setMode('signin')}>
                      Go to sign in
                    </button>
                  </p>
                )}
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground text-center">
                Use your Supabase email and password to sign in.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};