import { useState, type FormEvent, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { usePublicAccessEnabled } from '../../lib/supabase/useAppSettings';
import { useSession } from '../../lib/supabase/useSession';
import { signIn, signUp } from '../../lib/supabase/auth';

/**
 * Wrap the app (or any subtree) in this component to gate it behind Supabase auth -- except while
 * app_settings.public_access_enabled = true (Step 16), in which case it renders children directly
 * with no login screen at all, for every visitor, authenticated or not.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { publicAccessEnabled, loading: settingsLoading } = usePublicAccessEnabled();
  const { session, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (settingsLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
      </div>
    );
  }

  if (publicAccessEnabled || session) {
    return <>{children}</>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      // On success, the useSession() subscription above picks up the new session automatically
      // and this component re-renders past the gate -- no manual redirect needed.
    } catch (err: any) {
      setError(err?.message || 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-slate-200 rounded p-6 shadow-sm space-y-3">
        <h1 className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
          {mode === 'signIn' ? 'Sign In' : 'Create Account'}
        </h1>
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <input
          type="password"
          required
          minLength={6}
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        {error && <p className="text-[11px] text-rose-600 font-semibold">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider rounded hover:bg-indigo-700 disabled:opacity-60"
        >
          {submitting ? 'Please wait...' : mode === 'signIn' ? 'Sign In' : 'Sign Up'}
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          className="w-full text-center text-[11px] text-indigo-600 font-semibold hover:underline"
        >
          {mode === 'signIn' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </form>
    </div>
  );
}
