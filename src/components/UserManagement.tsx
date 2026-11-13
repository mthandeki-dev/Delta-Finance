'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, timeAgo } from './api';
import type { UserView } from '@/lib/types';

type Modal =
  | { type: 'add' }
  | { type: 'edit'; user: UserView }
  | { type: 'reset'; user: UserView }
  | { type: 'toggle'; user: UserView };

function roleBadge(role: string) {
  return role === 'ADMIN'
    ? 'badge border-df-yellow text-df-yellow'
    : 'badge border-df-line text-neutral-300';
}

function activeBadge(active: boolean) {
  return active
    ? 'badge border-green-700 text-green-400'
    : 'badge border-white text-neutral-400';
}

// ── Add / Edit User Form ──────────────────────────────────────────────────────

type UserFormProps = {
  initial?: UserView;
  onSave: () => void;
  onCancel: () => void;
};

function UserForm({ initial, onSave, onCancel }: UserFormProps) {
  const isEdit = !!initial;
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [role, setRole] = useState<'ADMIN' | 'VIEWER'>(initial?.role ?? 'VIEWER');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (isEdit) {
        await api(`/api/admin/users/${initial.id}`, {
          method: 'PUT',
          body: { fullName, username, email, role },
        });
      } else {
        if (password.length < 8) { setError('Password must be at least 8 characters.'); setBusy(false); return; }
        await api('/api/admin/users', {
          method: 'POST',
          body: { fullName, username, email, password, role },
        });
      }
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="uf-fullname">Full name</label>
        <input id="uf-fullname" className="input" type="text" placeholder="Jane Doe" value={fullName}
          onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="uf-username">Username <span className="text-df-yellow">*</span></label>
        <input id="uf-username" className="input" type="text" placeholder="janedoe" required
          value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        <p className="hint mt-1">Lowercase letters, numbers and underscores. 3–30 characters.</p>
      </div>
      <div>
        <label className="label" htmlFor="uf-email">Email</label>
        <input id="uf-email" className="input" type="email" placeholder="jane@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="uf-role">Role <span className="text-df-yellow">*</span></label>
        <select id="uf-role" className="input" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'VIEWER')} required>
          <option value="VIEWER">Viewer</option>
          <option value="ADMIN">Administrator</option>
        </select>
      </div>
      {!isEdit && (
        <div>
          <label className="label" htmlFor="uf-password">Temporary password <span className="text-df-yellow">*</span></label>
          <div className="relative">
            <input id="uf-password" className="input pr-16" type={showPw ? 'text' : 'password'}
              placeholder="Min. 8 characters" value={password}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
              onClick={() => setShowPw((v) => !v)}>
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="hint mt-1">The user will be required to change this on first login.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm"><span className="font-semibold text-df-yellow">Error.</span> {error}</p>
      )}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={busy} className="btn-primary flex-1">
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost flex-1" disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Reset Password Form ───────────────────────────────────────────────────────

function ResetPasswordForm({ user, onSave, onCancel }: { user: UserView; onSave: () => void; onCancel: () => void }) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setBusy(true);
    try {
      await api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST', body: { newPassword: password } });
      onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="hint">
        Set a new temporary password for <strong className="text-white">{user.fullName ?? user.username}</strong>.
        They will be required to change it on next login.
      </p>
      <div>
        <label className="label" htmlFor="rp-password">New temporary password <span className="text-df-yellow">*</span></label>
        <div className="relative">
          <input id="rp-password" className="input pr-16" type={showPw ? 'text' : 'password'}
            placeholder="Min. 8 characters" value={password}
            onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
          <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
            onClick={() => setShowPw((v) => !v)}>
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm"><span className="font-semibold text-df-yellow">Error.</span> {error}</p>
      )}
      <div className="flex gap-3 pt-1">
        <button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? 'Saving…' : 'Reset password'}</button>
        <button type="button" onClick={onCancel} className="btn-ghost flex-1" disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal>
      <div className="card w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost px-2 py-1 text-xs">✕ Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Main UserManagement component ─────────────────────────────────────────────

export function UserManagement() {
  const [users, setUsers] = useState<UserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<Modal | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const load = useCallback(async () => {
    try {
      const { users } = await api<{ users: UserView[] }>('/api/admin/users');
      setUsers(users);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(user: UserView) {
    try {
      const { active } = await api<{ active: boolean }>(`/api/admin/users/${user.id}/toggle-active`, { method: 'POST' });
      notify(`${user.fullName ?? user.username} ${active ? 'activated' : 'deactivated'}.`);
      setModal(null);
      await load();
    } catch (e) {
      notify((e as Error).message);
    }
  }

  const q = search.toLowerCase().trim();
  const filtered = users.filter((u) =>
    !q ||
    u.username?.includes(q) ||
    u.fullName?.toLowerCase().includes(q) ||
    u.email?.toLowerCase().includes(q) ||
    u.role.toLowerCase().includes(q),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20" aria-busy="true">
        <p className="hint">Loading users…</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="users-h" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Administration</p>
          <h1 id="users-h" className="card-title text-2xl">User Management</h1>
        </div>
        <button className="btn-primary" onClick={() => setModal({ type: 'add' })}>
          + Add User
        </button>
      </div>

      {error && (
        <p role="alert" className="card border-white text-sm">
          <strong className="text-df-yellow">Error.</strong> {error}
        </p>
      )}

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            className="input max-w-xs"
            type="search"
            placeholder="Search by name, username, email or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="hint">{filtered.length} of {users.length} user{users.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-df-line text-left">
                <th className="pb-3 pr-4 font-semibold text-neutral-300">User</th>
                <th className="pb-3 pr-4 font-semibold text-neutral-300">Email</th>
                <th className="pb-3 pr-4 font-semibold text-neutral-300">Role</th>
                <th className="pb-3 pr-4 font-semibold text-neutral-300">Status</th>
                <th className="pb-3 pr-4 font-semibold text-neutral-300">Last login</th>
                <th className="pb-3 font-semibold text-neutral-300">Created</th>
                <th className="pb-3 pl-4 font-semibold text-neutral-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-df-line">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-neutral-400">
                    {search ? 'No users match your search.' : 'No users yet. Click "Add User" to create the first one.'}
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="group">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{u.fullName ?? <span className="text-neutral-400">—</span>}</div>
                    <div className="text-xs text-neutral-400">{u.username ?? u.xrplAddress ?? '—'}</div>
                    {u.requirePasswordChange && (
                      <span className="badge mt-1 border-df-yellow text-df-yellow text-xs">Change pw</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-neutral-300">{u.email ?? <span className="text-neutral-500">—</span>}</td>
                  <td className="py-3 pr-4">
                    <span className={roleBadge(u.role)}>{u.role === 'ADMIN' ? 'Administrator' : 'Viewer'}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={activeBadge(u.active)}>{u.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td className="py-3 pr-4 text-neutral-400">{timeAgo(u.lastLoginAt)}</td>
                  <td className="py-3 pr-4 text-neutral-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 pl-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => setModal({ type: 'edit', user: u })}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-ghost px-2 py-1 text-xs"
                        onClick={() => setModal({ type: 'reset', user: u })}
                      >
                        Reset pw
                      </button>
                      <button
                        className={`px-2 py-1 text-xs ${u.active ? 'btn-danger' : 'btn-ghost'}`}
                        onClick={() => setModal({ type: 'toggle', user: u })}
                      >
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === 'add' && (
        <Modal title="Add user" onClose={() => setModal(null)}>
          <UserForm
            onSave={async () => { setModal(null); notify('User created.'); await load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === 'edit' && (
        <Modal title="Edit user" onClose={() => setModal(null)}>
          <UserForm
            initial={modal.user}
            onSave={async () => { setModal(null); notify('User updated.'); await load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === 'reset' && (
        <Modal title="Reset password" onClose={() => setModal(null)}>
          <ResetPasswordForm
            user={modal.user}
            onSave={async () => { setModal(null); notify('Password reset. The user will be prompted to choose a new one on login.'); await load(); }}
            onCancel={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.type === 'toggle' && (
        <Modal
          title={modal.user.active ? 'Deactivate user' : 'Activate user'}
          onClose={() => setModal(null)}
        >
          <p className="hint mb-6">
            {modal.user.active
              ? `Deactivating ${modal.user.fullName ?? modal.user.username} will immediately prevent them from signing in.`
              : `Activating ${modal.user.fullName ?? modal.user.username} will allow them to sign in again.`}
          </p>
          <div className="flex gap-3">
            <button
              className={modal.user.active ? 'btn-danger flex-1' : 'btn-primary flex-1'}
              onClick={() => toggleActive(modal.user)}
            >
              {modal.user.active ? 'Yes, deactivate' : 'Yes, activate'}
            </button>
            <button className="btn-ghost flex-1" onClick={() => setModal(null)}>Cancel</button>
          </div>
        </Modal>
      )}

      {/* ── Toast ── */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
        {toast && <p className="pointer-events-auto max-w-lg rounded-lg border border-df-yellow bg-black px-4 py-3 text-sm shadow-lg">{toast}</p>}
      </div>
    </section>
  );
}
