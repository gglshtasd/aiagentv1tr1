'use client';

import { useState } from 'react';
import { supabaseClient } from '../lib/supabase-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [starterKey, setStarterKey] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (isSigningUp) {
        const isMasterKey = starterKey === process.env.NEXT_PUBLIC_STARTER_KEY;
        let isValidDbKey = false;
        
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(starterKey);

        if (!isMasterKey && isUUID) {
          const { data: keyData } = await supabaseClient.from('invite_codes').select('*').eq('code', starterKey).eq('is_active', true).maybeSingle();
          if (keyData) isValidDbKey = true;
        }

        if (!isMasterKey && !isValidDbKey) {
          setMessage('Access Denied: Invalid Starter Key.');
          setLoading(false);
          return;
        }

        const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
        if (authError) throw authError;

        if (authData.user) {
          // CRITICAL FIX 1: Explicitly create the user in public.users so database relations work!
          const { error: insertError } = await supabaseClient.from('users').insert({
            id: authData.user.id,
            email: email,
            role: 'user'
          });
          
          if (insertError) console.error('Failed to create public user record:', insertError);

          // Invalidate the invite code
          if (isValidDbKey) {
            await supabaseClient.from('invite_codes').update({ is_active: false }).eq('code', starterKey);
          }
        }

        setMessage('Registration successful. You may now log in.');
        setIsSigningUp(false); 
      } else {
        // --- SECURE LOGIN LOGIC ---
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        setMessage('Access granted. Routing...');

        // CRITICAL FIX 2: Query the 'users' table, and use maybeSingle() so it doesn't crash if empty
        const { data: userRecord } = await supabaseClient
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();
        
        // Redirect based on the actual database role
        if (userRecord?.role === 'admin') {
          window.location.href = '/admin';
        } else {
          window.location.href = '/chat';
        }
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        <h2 className="text-3xl font-bold mb-6 text-center tracking-tight">System Access</h2>
        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Email Vector</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Passcode</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded text-white" required />
          </div>
          {isSigningUp && (
            <div>
              <label className="block text-sm font-medium mb-1 text-blue-400">Starter Key</label>
              <input type="password" value={starterKey} onChange={(e) => setStarterKey(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-blue-600 rounded text-white outline-none" required />
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mt-4">
            {loading ? 'Processing...' : (isSigningUp ? 'Register Account' : 'Initialize Login')}
          </button>
        </form>
        <button onClick={() => { setIsSigningUp(!isSigningUp); setMessage(''); }} className="w-full mt-4 text-sm text-gray-400 hover:text-white">
          {isSigningUp ? 'Already have an account? Log in' : 'Need an account? Enter Starter Key'}
        </button>
        {message && <p className="mt-4 text-center text-sm font-medium text-green-400">{message}</p>}
      </div>
    </div>
  );
}
