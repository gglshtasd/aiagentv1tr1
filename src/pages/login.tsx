'use client';

import { useState } from 'react';
import { supabaseClient } from '../lib/supabase-client';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const router = useRouter(); // 1. Initialize the Next.js router
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
        // 2. Validate against Master ENV Key OR generated Database Invite Keys
        const isMasterKey = starterKey === process.env.NEXT_PUBLIC_STARTER_KEY;
        let isValidDbKey = false;
        
        // Only check DB if it's a properly formatted UUID (prevents Supabase type errors)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(starterKey);

        if (!isMasterKey && isUUID) {
          const { data: keyData } = await supabaseClient
            .from('invite_codes')
            .select('*')
            .eq('code', starterKey)
            .eq('is_active', true)
            .single();
            
          if (keyData) isValidDbKey = true;
        }

        if (!isMasterKey && !isValidDbKey) {
          setMessage('Access Denied: Invalid or Expired Starter Key.');
          setLoading(false);
          return;
        }

        // Proceed with account creation
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({ email, password });
        if (authError) throw authError;

        // 3. If a Database Key was used, mark it as spent so it can't be reused
        if (isValidDbKey && authData.user) {
          await supabaseClient
            .from('invite_codes')
            .update({ is_active: false, used_by: authData.user.id })
            .eq('code', starterKey);
        }

        setMessage('Registration successful. You may now log in.');
        setIsSigningUp(false); // Switch them back to the login view automatically
        
      } else {
        // 4. LOGIN LOGIC
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        
        setMessage('Access granted. Redirecting...');
        
        // 5. DYNAMIC ROUTING: Send admins to the control plane, users to the chat
        if (data.user?.user_metadata?.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/chat');
        }
      }
    } catch (err: any) {
      setMessage(err.message || 'An error occurred during authentication.');
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
              <label className="block text-sm font-medium mb-1 text-blue-400">Starter Key (Required for New Users)</label>
              <input type="password" value={starterKey} onChange={(e) => setStarterKey(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-blue-600 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
          )}
          
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors mt-4">
            {loading ? 'Processing...' : (isSigningUp ? 'Register Account' : 'Initialize Login')}
          </button>
        </form>

        <button onClick={() => { setIsSigningUp(!isSigningUp); setMessage(''); }} className="w-full mt-4 text-sm text-gray-400 hover:text-white transition-colors">
          {isSigningUp ? 'Already have an account? Log in' : 'Need an account? Enter Starter Key'}
        </button>

        {message && <p className={`mt-4 text-center text-sm font-medium ${message.includes('success') || message.includes('granted') ? 'text-green-400' : 'text-yellow-400'}`}>{message}</p>}
      </div>
    </div>
  );
}
