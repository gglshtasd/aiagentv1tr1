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

    if (isSigningUp) {
      // The Trap: Block random registrations
      if (starterKey !== process.env.NEXT_PUBLIC_STARTER_KEY) {
        setMessage('Access Denied: Invalid Starter Key.');
        setLoading(false);
        return;
      }

      const { error } = await supabaseClient.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setMessage('Registration successful. You may now log in.');
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else {
        setMessage('Access granted. Redirecting...');
        window.location.href = '/chat';
      }
    }
    setLoading(false);
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
          
          {/* Only show the Starter Key field if they are trying to sign up */}
          {isSigningUp && (
            <div>
              <label className="block text-sm font-medium mb-1 text-blue-400">Starter Key (Required for New Users)</label>
              <input type="password" value={starterKey} onChange={(e) => setStarterKey(e.target.value)} className="w-full px-4 py-2 bg-gray-900 border border-blue-600 rounded text-white" required />
            </div>
          )}
          
          <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors mt-4">
            {loading ? 'Processing...' : (isSigningUp ? 'Register Account' : 'Initialize Login')}
          </button>
        </form>

        <button onClick={() => setIsSigningUp(!isSigningUp)} className="w-full mt-4 text-sm text-gray-400 hover:text-white transition-colors">
          {isSigningUp ? 'Already have an account? Log in' : 'Need an account? Enter Starter Key'}
        </button>

        {message && <p className="mt-4 text-center text-sm text-yellow-400">{message}</p>}
      </div>
    </div>
  );
}
