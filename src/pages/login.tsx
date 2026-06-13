'use client';

import { useState } from 'react';
import { supabaseClient } from '../../lib/supabase-client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('Access granted. Redirecting...');
      window.location.href = '/chat'; // Redirect to the main interface
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabaseClient.auth.signUp({
      email,
      password,
    });

    if (error) setMessage(error.message);
    else setMessage('Check your email for the confirmation link.');
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="max-w-md w-full p-8 bg-gray-800 rounded-lg shadow-lg border border-gray-700">
        <h2 className="text-3xl font-bold mb-6 text-center tracking-tight">System Access</h2>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Email Vector</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-400">Passcode</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded focus:outline-none focus:border-blue-500 text-white"
              required
            />
          </div>
          
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
            >
              {loading ? 'Authenticating...' : 'Login'}
            </button>
            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
            >
              Sign Up
            </button>
          </div>
        </form>
        {message && <p className="mt-4 text-center text-sm text-yellow-400">{message}</p>}
      </div>
    </div>
  );
}
