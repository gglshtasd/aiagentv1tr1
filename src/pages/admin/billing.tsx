import React, { useState, useEffect } from 'react';

// Strict TypeScript Interfaces
interface UserRelation {
  email: string;
}

interface WalletRecord {
  id: string;
  user_id: string;
  balance_inr: number;
  monthly_credit_limit_inr: number;
  margin_multiplier: number;
  is_blocked: boolean;
  users: UserRelation | null;
}

export default function BillingAdminPanel() {
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    try {
      const res = await fetch('/api/admin/wallets');
      if (!res.ok) throw new Error('Failed to fetch ledger');
      const data: WalletRecord[] = await res.json();
      setWallets(data);
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateWallet = async (walletId: string, updates: Partial<WalletRecord>) => {
    try {
      const res = await fetch('/api/admin/wallets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_id: walletId, ...updates }),
      });
      
      if (!res.ok) throw new Error('Update failed');
      await fetchWallets(); // Refresh state
    } catch (err: unknown) {
      if (err instanceof Error) alert(`Error: ${err.message}`);
    }
  };

  if (loading) return <div className="p-8 text-white font-mono">Loading Enterprise Ledger...</div>;
  if (error) return <div className="p-8 text-red-500 font-mono">System Error: {error}</div>;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-8 font-mono">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-2 text-blue-400">Master AI Orchestrator</h1>
        <p className="text-sm text-gray-400 mb-8">Enterprise Ledger & Margin Controls</p>

        <div className="bg-gray-800 rounded-lg shadow-xl overflow-hidden border border-gray-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-900 border-b border-gray-700">
              <tr>
                <th className="p-4">User Email</th>
                <th className="p-4">Current Spend (INR)</th>
                <th className="p-4">Monthly Limit (INR)</th>
                <th className="p-4">Margin (%)</th>
                <th className="p-4">Status</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr key={wallet.id} className="border-b border-gray-700 hover:bg-gray-750 transition-colors">
                  <td className="p-4 text-gray-300">{wallet.users?.email || 'Unknown User'}</td>
                  <td className="p-4 font-bold text-red-400">₹{Number(wallet.balance_inr).toFixed(2)}</td>
                  <td className="p-4">
                    <input 
                      type="number" 
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-24 text-white"
                      defaultValue={wallet.monthly_credit_limit_inr}
                      onBlur={(e) => updateWallet(wallet.id, { monthly_credit_limit_inr: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-4">
                    <input 
                      type="number" 
                      step="0.1"
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 w-20 text-white"
                      defaultValue={wallet.margin_multiplier}
                      onBlur={(e) => updateWallet(wallet.id, { margin_multiplier: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${wallet.is_blocked ? 'bg-red-900 text-red-200' : 'bg-green-900 text-green-200'}`}>
                      {wallet.is_blocked ? 'BLOCKED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => updateWallet(wallet.id, { is_blocked: !wallet.is_blocked })}
                      className="text-xs bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded border border-gray-500"
                    >
                      Toggle Block
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
