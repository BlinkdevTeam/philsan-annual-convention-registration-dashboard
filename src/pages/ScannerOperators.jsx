// src/pages/ScannerOperators.jsx
// 39th Annual Convention: choose which login accounts may use the scanner app.
// Needs scanner_operators_setup.sql run in Supabase and the create-scanner-account Edge Function deployed.
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function ScannerOperators() {
  const [accounts, setAccounts] = useState([]);
  const [names, setNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null); // { type: 'ok' | 'error', text }
  const [search, setSearch] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [pwFor, setPwFor] = useState(null); // account id whose password box is open
  const [pwValue, setPwValue] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc('scanner_accounts');
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setAccounts(data || []);
      const n = {};
      (data || []).forEach((a) => {
        n[a.id] = a.display_name || (a.email || '').split('@')[0];
      });
      setNames(n);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addScanner(account) {
    setBusyId(account.id);
    setMessage(null);
    const { error } = await supabase.rpc('scanner_add', {
      p_email: account.email,
      p_display_name: names[account.id] || null,
    });
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'ok', text: `${account.email} can now use the scanner app.` });
    setBusyId(null);
    load();
  }

  async function saveName(account) {
    setBusyId(account.id);
    setMessage(null);
    const { error } = await supabase.rpc('scanner_add', {
      p_email: account.email,
      p_display_name: names[account.id] || null,
    });
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'ok', text: `Name saved for ${account.email}.` });
    setBusyId(null);
    load();
  }

  async function removeScanner(account) {
    if (!window.confirm(`Remove scanner access for ${account.email}?`)) return;
    setBusyId(account.id);
    setMessage(null);
    const { error } = await supabase.rpc('scanner_remove', { p_id: account.id });
    if (error) setMessage({ type: 'error', text: error.message });
    else setMessage({ type: 'ok', text: `${account.email} can no longer use the scanner app.` });
    setBusyId(null);
    load();
  }

  async function createAccount(e) {
    e.preventDefault();
    setCreating(true);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('create-scanner-account', {
      body: { email: newEmail, password: newPassword, display_name: newName },
    });
    let errorText = null;
    if (error) {
      // Non-2xx replies: read the function's own message if there is one
      try {
        const detail = await error.context?.json();
        errorText = detail?.error || error.message;
      } catch {
        errorText = error.message;
      }
    } else if (!data?.ok) {
      errorText = data?.error || 'Could not create the account.';
    }
    if (errorText) {
      setMessage({ type: 'error', text: errorText });
    } else {
      setMessage({
        type: 'ok',
        text: `Created ${data.email}. It can log in to the scanner app now with the password you set.`,
      });
      setNewEmail('');
      setNewPassword('');
      setNewName('');
      load();
    }
    setCreating(false);
  }

  async function changePassword(account) {
    if (pwValue.length < 6) {
      setMessage({ type: 'error', text: 'The password must be at least 6 characters.' });
      return;
    }
    setBusyId(account.id);
    setMessage(null);
    const { data, error } = await supabase.functions.invoke('create-scanner-account', {
      body: { action: 'set_password', user_id: account.id, password: pwValue },
    });
    let errorText = null;
    if (error) {
      try {
        const detail = await error.context?.json();
        errorText = detail?.error || error.message;
      } catch {
        errorText = error.message;
      }
    } else if (!data?.ok) {
      errorText = data?.error || 'Could not change the password.';
    }
    if (errorText) {
      setMessage({ type: 'error', text: errorText });
    } else {
      setMessage({ type: 'ok', text: `Password changed for ${account.email}.` });
      setPwFor(null);
      setPwValue('');
    }
    setBusyId(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      (a.email || '').toLowerCase().includes(q) ||
      (a.display_name || '').toLowerCase().includes(q));
  }, [accounts, search]);

  const scannerCount = accounts.filter((a) => a.is_scanner).length;

  return (
    <div className="p-6 max-w-5xl mx-auto font-[Montserrat]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#16572A]">Scanner Operators</h1>
          <p className="text-sm text-gray-600 mt-1">
            Choose which login accounts can use the scanner app.
          </p>
        </div>
        <div className="rounded-lg bg-[#EAF3DE] px-4 py-2 text-sm text-[#16572A]">
          <span className="text-xl font-bold">{scannerCount}</span> can scan
        </div>
      </div>

      <form
        onSubmit={createAccount}
        className="mb-6 rounded-lg border border-gray-200 bg-white p-4"
      >
        <h2 className="text-base font-semibold text-[#16572A] mb-1">Create a new scanner account</h2>
        <p className="text-xs text-gray-500 mb-3">
          The email doesn't need a real inbox (e.g. lane1@philsan.org). The account can scan right away.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="Email, e.g. lane1@philsan.org"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
          />
          <input
            type="text"
            required
            minLength={6}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password (at least 6 characters)"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name shown in scanner, e.g. Lane 1"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="mt-3 rounded-lg bg-[#1F773A] px-4 py-2 text-sm font-semibold text-white hover:bg-[#16572A] disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create account'}
        </button>
      </form>

      {message && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            message.type === 'error'
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-[#EAF3DE] text-[#16572A] border border-[#1F773A]/30'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="flex gap-2 mb-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
        />
        <button
          onClick={load}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#1F773A] text-white text-left">
            <tr>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Name shown in scanner</th>
              <th className="px-4 py-3 font-semibold">Last sign-in</th>
              <th className="px-4 py-3 font-semibold text-right">Scanner access</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">No accounts found.</td></tr>
            )}
            {!loading && filtered.map((a) => {
              const busy = busyId === a.id;
              const nameChanged = a.is_scanner && (names[a.id] || '') !== (a.display_name || '');
              return (
                <tr key={a.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{a.email}</div>
                    {a.is_scanner && (
                      <div className="text-xs text-gray-500">Scanner since {formatDate(a.scanner_since)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <input
                        value={names[a.id] || ''}
                        onChange={(e) => setNames({ ...names, [a.id]: e.target.value })}
                        className="w-40 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
                      />
                      {nameChanged && (
                        <button
                          onClick={() => saveName(a)}
                          disabled={busy}
                          className="rounded bg-[#EDB221] px-2 py-1 text-xs font-semibold text-gray-900 disabled:opacity-50"
                        >
                          Save
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(a.last_sign_in_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {a.is_scanner && pwFor === a.id ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={pwValue}
                          onChange={(e) => setPwValue(e.target.value)}
                          placeholder="New password (6+ characters)"
                          className="w-48 rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
                        />
                        <button
                          onClick={() => changePassword(a)}
                          disabled={busy}
                          className="rounded-lg bg-[#1F773A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16572A] disabled:opacity-50"
                        >
                          {busy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setPwFor(null); setPwValue(''); }}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : a.is_scanner ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          onClick={() => { setPwFor(a.id); setPwValue(''); setMessage(null); }}
                          disabled={busy}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Change password
                        </button>
                        <button
                          onClick={() => removeScanner(a)}
                          disabled={busy}
                          className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {busy ? 'Working…' : 'Remove'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addScanner(a)}
                        disabled={busy}
                        className="rounded-lg bg-[#1F773A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#16572A] disabled:opacity-50"
                      >
                        {busy ? 'Working…' : 'Allow scanning'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}