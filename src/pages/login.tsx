'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabase-client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleGoogleLogin = async () => {
    setLoading(true);
    const redirectTarget = `${window.location.origin}/api/auth/callback`;
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTarget } });
      if (error) throw error;
    } catch (err: any) {
      setMessage(err.message);
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSigningUp) {
        const isMasterKey = inviteCode === process.env.NEXT_PUBLIC_STARTER_KEY;
        let isValidDbKey = false;
        
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviteCode);

        if (!isMasterKey && isUUID) {
          const { data: keyData } = await supabase.from('invite_codes').select('*').eq('code', inviteCode).eq('is_active', true).maybeSingle();
          if (keyData) isValidDbKey = true;
        }

        if (!isMasterKey && !isValidDbKey) throw new Error('Access Denied: Invalid or Used Invite Key.');

        const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
          const assignedRole = isMasterKey ? 'admin' : 'user';
          await supabase.from('users').upsert({
            id: authData.user.id,
            email: email,
            role: assignedRole,
            advanced_mode_enabled: isMasterKey,
            monthly_credit_limit_inr: isMasterKey ? 50000 : 500 
          });
          if (isValidDbKey) await supabase.from('invite_codes').update({ is_active: false }).eq('code', inviteCode);
        }

        setMessage('Registration successful. You may now log in.');
        setIsSigningUp(false);
        setPassword('');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage('Access granted. Routing...');
        
        // CRITICAL FIX: Direct hard-routing to bypass React state delays
        const { data: roleData } = await supabase.from('users').select('role').eq('id', data.user.id).single();
        window.location.href = roleData?.role === 'admin' ? '/admin' : '/chat';
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white font-sans">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-xl shadow-2xl border border-gray-700">
        <h2 className="text-3xl font-bold mb-6 text-center tracking-tight">Gateway Access</h2>
        
        <button onClick={handleGoogleLogin} disabled={loading} className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold py-2.5 px-4 rounded mb-6 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
          Sign in with Google
        </button>

        <div className="flex items-center mb-6"><div className="flex-grow border-t border-gray-600"></div><span className="flex-shrink-0 px-4 text-gray-400 text-xs uppercase">Or Secure Email</span><div className="flex-grow border-t border-gray-600"></div></div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Email Vector</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Passcode</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white focus:outline-none focus:border-blue-500" required />
          </div>
          {isSigningUp && (
            <div>
              <label className="block text-sm font-medium mb-1 text-blue-400">Invite Code</label>
              <input type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-blue-600 rounded text-white outline-none" required placeholder="Paste UUID here..." />
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-2 transition-colors">
            {loading ? 'Processing...' : (isSigningUp ? 'Register Account' : 'Initialize Login')}
          </button>
        </form>

        <button onClick={() => { setIsSigningUp(!isSigningUp); setMessage(''); }} className="w-full mt-5 text-sm text-gray-400 hover:text-white transition-colors">
          {isSigningUp ? 'Already have an account? Log in' : 'Need an account? Enter Invite Code'}
        </button>
        {message && <p className={`mt-4 text-center text-sm font-medium ${message.includes('Error') || message.includes('Denied') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}
      </div>
    </div>
  );
}
