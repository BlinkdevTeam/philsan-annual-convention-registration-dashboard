// src/pages/PortalEmails.jsx
// 39th Annual Convention: email the participant portal link to every approved participant,
// one batch at a time (Resend free plan = 100 emails a day, shared with certificate emails).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_BATCH = 80; // leaves room in the 100/day for certificate emails

async function callFunction(body) {
    const { data, error } = await supabase.functions.invoke('send-portal-links', { body });
    if (error) {
        let message = 'Something went wrong. Please try again.';
        try {
            const payload = await error.context.json();
            if (payload?.error) message = payload.error;
        } catch {
            /* keep default message */
        }
        throw new Error(message);
    }
    return data;
}

async function fetchSentList() {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('portal_link_emails')
            .select('email, full_name, sent_at')
            .order('sent_at', { ascending: false })
            .order('email', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE) break;
    }
    return rows;
}

function StatCard({ label, value, tone }) {
    const tones = {
        plain: 'bg-white text-[#16572A]',
        green: 'bg-[#EAF3DE] text-[#3B6D11]',
        amber: 'bg-[#FAEEDA] text-[#854F0B]',
    };
    return (
        <div className={`border border-[#e5e3da] rounded-lg px-4 py-4 ${tones[tone]}`}>
            <p className="text-[12px] text-[#5f5e5a] mb-1">{label}</p>
            <p className="text-[28px] font-bold leading-none">{value ?? '—'}</p>
        </div>
    );
}

const fmt = (iso) =>
    new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

// Search approved participants, tick the ones to email, send to just them.
function SendToSpecific({ onSent }) {
    const [all, setAll] = useState(null);
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState({}); // email -> { full_name, sent_at }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    async function loadAll() {
        try {
            const r = await callFunction({ action: 'recipients' });
            setAll(r.recipients);
        } catch (err) {
            setError(err.message);
        }
    }
    useEffect(() => { loadAll(); }, []);

    const matches = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!all || q.length < 2) return [];
        return all.filter((r) => `${r.full_name} ${r.email}`.toLowerCase().includes(q)).slice(0, 50);
    }, [all, query]);

    const pickedList = Object.entries(picked);

    function toggle(r) {
        setNotice('');
        setPicked((p) => {
            const next = { ...p };
            if (next[r.email]) delete next[r.email];
            else next[r.email] = r;
            return next;
        });
    }

    async function send() {
        const already = pickedList.filter(([, r]) => r.sent_at).length;
        const msg =
            `Send the portal link to ${pickedList.length} selected participant${pickedList.length === 1 ? '' : 's'}?` +
            (already ? `\n\n${already === 1 ? '1 of them was' : `${already} of them were`} already emailed and will get it again.` : '');
        if (!window.confirm(msg)) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const r = await callFunction({ action: 'send_selected', emails: pickedList.map(([e]) => e) });
            setNotice(`Sent to ${r.sent_now} participant${r.sent_now === 1 ? '' : 's'}.` + (r.skipped ? ` ${r.skipped} skipped (not approved).` : ''));
            setPicked({});
            await loadAll();
            onSent();
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="bg-white border border-[#e5e3da] rounded-lg p-5 mb-6">
            <h2 className="text-[15px] font-bold text-[#344054]">Send to specific people</h2>
            <p className="text-[12.5px] text-[#5f5e5a] mt-1 mb-3">
                Search approved participants by name or email, tick who should get the portal link, then send. People
                already emailed can be sent it again.
            </p>

            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={all ? 'Type at least 2 letters of a name or email…' : 'Loading participants…'}
                disabled={!all}
                className="w-full p-2.5 rounded-md border border-[#339544] text-[13.5px]"
            />

            {query.trim().length >= 2 && (
                <div className="mt-2 border border-[#e5e3da] rounded-md max-h-[280px] overflow-y-auto">
                    {matches.length === 0 ? (
                        <p className="px-4 py-3 text-[13px] text-[#5f5e5a]">No approved participant matches "{query}".</p>
                    ) : (
                        matches.map((r) => (
                            <label
                                key={r.email}
                                className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 border-[#f1efe8] cursor-pointer hover:bg-[#f7f6f1]"
                            >
                                <input type="checkbox" checked={!!picked[r.email]} onChange={() => toggle(r)} className="w-4 h-4" />
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[13.5px] text-[#344054] truncate">{r.full_name || '—'}</span>
                                    <span className="block text-[12px] text-[#5f5e5a] truncate">{r.email}</span>
                                </span>
                                {r.sent_at && (
                                    <span className="shrink-0 text-[11px] text-[#3B6D11] bg-[#EAF3DE] rounded-full px-2 py-0.5">
                                        Emailed {fmt(r.sent_at)}
                                    </span>
                                )}
                            </label>
                        ))
                    )}
                </div>
            )}

            {pickedList.length > 0 && (
                <div className="mt-4">
                    <p className="text-[12.5px] font-medium text-[#344054] mb-2">Selected ({pickedList.length})</p>
                    <div className="flex flex-wrap gap-2">
                        {pickedList.map(([email, r]) => (
                            <span key={email} className="inline-flex items-center gap-1.5 bg-[#f1efe8] rounded-full pl-3 pr-1.5 py-1 text-[12px] text-[#344054]">
                                {r.full_name || email}
                                <button
                                    type="button"
                                    onClick={() => toggle({ email })}
                                    className="w-5 h-5 rounded-full hover:bg-[#e5e3da] text-[#5f5e5a]"
                                    aria-label={`Remove ${r.full_name || email}`}
                                >
                                    ×
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={send}
                disabled={busy || pickedList.length === 0 || pickedList.length > 100}
                className="mt-4 bg-[#16572A] text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:opacity-90 disabled:opacity-50"
            >
                {busy ? 'Sending…' : `Send to selected (${pickedList.length})`}
            </button>
            {pickedList.length > 100 && <p className="text-[12.5px] text-[#A32D2D] mt-2">Pick at most 100 at a time.</p>}
            {notice && <p className="text-[13px] text-[#3B6D11] mt-3">{notice}</p>}
            {error && <p className="text-[13px] text-[#A32D2D] mt-3">{error}</p>}
        </div>
    );
}

export default function PortalEmails() {
    const [stats, setStats] = useState(null);
    const [list, setList] = useState([]);
    const [batch, setBatch] = useState(DEFAULT_BATCH);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [s, l] = await Promise.all([callFunction({ action: 'status' }), fetchSentList()]);
            setStats(s);
            setList(l);
        } catch (err) {
            setError(err.message || 'Could not load the email status.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    async function handleSend() {
        const size = Math.max(1, Math.min(100, parseInt(batch, 10) || 0));
        const count = Math.min(size, stats?.remaining ?? size);
        if (!window.confirm(`Send the portal link to the next ${count} participant${count === 1 ? '' : 's'}?`)) return;
        setSending(true);
        setError('');
        setNotice('');
        try {
            const r = await callFunction({ action: 'send', limit: size });
            setNotice(
                r.sent_now
                    ? `Sent to ${r.sent_now} participant${r.sent_now === 1 ? '' : 's'}. ${r.remaining} still to go.`
                    : 'Everyone has already been emailed.'
            );
        } catch (err) {
            setError(err.message);
        } finally {
            setSending(false);
            refresh();
        }
    }

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return list;
        return list.filter((r) => `${r.full_name ?? ''} ${r.email}`.toLowerCase().includes(q));
    }, [list, search]);

    const done = stats && stats.remaining === 0;

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-8 max-w-[1000px]">
            <h1 className="text-[20px] lg:text-[22px] font-bold text-[#16572A]">Portal Emails</h1>
            <p className="text-[13px] text-[#5f5e5a] mt-1 mb-5">
                Email the participant portal link to approved participants. The batch button skips anyone already emailed.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <StatCard label="Approved participants (unique emails)" value={stats?.approved} tone="plain" />
                <StatCard label="Already emailed" value={stats?.sent} tone="green" />
                <StatCard label="Still to email" value={stats?.remaining} tone="amber" />
            </div>

            <div className="bg-white border border-[#e5e3da] rounded-lg p-5 mb-6">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label htmlFor="batch" className="text-[12.5px] text-[#344054] block mb-1">Emails to send now</label>
                        <input
                            id="batch"
                            type="number"
                            min={1}
                            max={100}
                            value={batch}
                            onChange={(e) => setBatch(e.target.value)}
                            className="w-[110px] p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || loading || done || !stats}
                        className="bg-[#16572A] text-white text-[14px] font-medium rounded-md px-5 py-2.5 hover:opacity-90 disabled:opacity-50"
                    >
                        {sending ? 'Sending…' : done ? 'Everyone has been emailed' : 'Send portal link'}
                    </button>
                </div>
                <p className="text-[12px] text-[#888780] mt-3">
                    Your email plan allows 100 emails a day, shared with certificate emails. Send up to {DEFAULT_BATCH} a day
                    and come back tomorrow for the next batch.
                </p>
                {notice && <p className="text-[13px] text-[#3B6D11] mt-3">{notice}</p>}
                {error && <p className="text-[13px] text-[#A32D2D] mt-3">{error}</p>}
            </div>

            <SendToSpecific onSent={refresh} />

            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-bold text-[#344054]">Already emailed ({list.length})</h2>
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or email…"
                    className="w-full sm:w-[280px] p-2 rounded-md border border-[#d0cec6] text-[13px]"
                />
            </div>

            {loading && list.length === 0 ? (
                <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>
            ) : filtered.length === 0 ? (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-8 text-center text-[14px] text-[#5f5e5a]">
                    {list.length === 0 ? 'No portal emails sent yet.' : `No one matches "${search}".`}
                </div>
            ) : (
                <div className="bg-white border border-[#e5e3da] rounded-lg overflow-x-auto">
                    <table className="w-full text-[13.5px]">
                        <thead>
                            <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                <th className="px-4 py-3 font-medium w-12">#</th>
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Email</th>
                                <th className="px-4 py-3 font-medium">Sent</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <tr key={r.email} className="border-t border-[#e5e3da]">
                                    <td className="px-4 py-2.5 text-[#5f5e5a]">{i + 1}</td>
                                    <td className="px-4 py-2.5 text-[#344054]">{r.full_name || '—'}</td>
                                    <td className="px-4 py-2.5 text-[#5f5e5a]">{r.email}</td>
                                    <td className="px-4 py-2.5 text-[#5f5e5a] whitespace-nowrap">
                                        {new Date(r.sent_at).toLocaleString('en-PH', {
                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                                        })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}