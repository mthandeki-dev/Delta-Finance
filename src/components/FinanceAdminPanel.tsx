'use client';

import { useState } from 'react';
import { api } from './api';
import type { FinanceAdmin } from '@/lib/types';

export function FinanceAdminPanel({ initial }: { initial: FinanceAdmin[] }) {
  const [admins, setAdmins] = useState<FinanceAdmin[]>(initial);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<FinanceAdmin>('/api/finance-admins', { method: 'POST', body: { name, email } });
      setAdmins((prev) => [created, ...prev]);
      setName('');
      setEmail('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/finance-admins/${id}`, { method: 'DELETE' });
      setAdmins((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  const active = admins.filter((a) => a.active);

  return (
    <section className="card" aria-labelledby="fa-h">
      <p className="eyebrow">Settings</p>
      <h2 id="fa-h" className="card-title">Restock notification emails</h2>
      <p className="hint mt-1">These addresses receive an email after every automatic restock attempt.</p>

      <form onSubmit={add} className="mt-5 flex flex-col sm:flex-row gap-2">
        <input
          className="input flex-1"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        <input
          className="input flex-1"
          type="email"
          placeholder="email@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={320}
        />
        <button className="btn-primary shrink-0" disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p role="alert" className="mt-2 text-xs text-orange-400">{error}</p>}

      <div className="mt-5 space-y-2">
        {active.length === 0 && <p className="hint text-sm">No recipients yet.</p>}
        {active.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-df-line px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-white">{a.name}</p>
              <p className="text-xs text-df-mute">{a.email}</p>
            </div>
            <button
              className="text-xs text-df-mute hover:text-orange-400 transition-colors"
              onClick={() => remove(a.id)}
              aria-label={`Remove ${a.name}`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
