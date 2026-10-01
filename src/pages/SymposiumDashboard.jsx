import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// 2nd Pet Symposium — monitoring only (no approval).
// Reads symposium_registrations + symposium_sponsors (admins are `authenticated`).

const REFRESH_MS = 60_000;

async function fetchRegistrations() {
    const size = 1000; // Supabase returns max 1000 rows per request
    const rows = [];
    for (let from = 0; ; from += size) {
        const { data, error } = await supabase
            .from('symposium_registrations')
            .select('id, email, first_name, middle_name, last_name, mobile, company, position, agri_license, license_expiry, certificate_needed, sponsored, sponsor, created_at')
            .order('created_at', { ascending: false })
            .range(from, from + size - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < size) break;
    }
    return rows;
}

async function fetchSponsors() {
    const { data, error } = await supabase
        .from('symposium_sponsors')
        .select('id, name, max_participants, active')
        .order('name', { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
}

const fullName = (r) =>
    [r.first_name, r.middle_name ? `${r.middle_name.trim()[0]}.` : '', r.last_name].filter(Boolean).join(' ');

const fmtDateTime = (iso) =>
    new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const dayKey = (iso) => {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadCsv(rows) {
    const head = ['Registered', 'Last Name', 'First Name', 'Middle Name', 'Email', 'Mobile', 'Company', 'Position',
        'PRC License No.', 'License Expiry', 'Certificate Needed', 'Sponsored', 'Sponsor'];
    const body = rows.map((r) => [
        new Date(r.created_at).toLocaleString('en-PH'), r.last_name, r.first_name, r.middle_name, r.email, r.mobile,
        r.company, r.position, r.agri_license, r.license_expiry, r.certificate_needed, r.sponsored, r.sponsor,
    ]);
    const csv = '﻿' + [head, ...body].map((r) => r.map(csvCell).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `PHILSAN-Pet-Symposium-Registrations-${dayKey(new Date().toISOString())}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function Stat({ label, value, sub }) {
    return (
        <div className="bg-white border border-[#e5e3dc] rounded-xl p-4">
            <p className="text-[12px] uppercase tracking-wide text-[#5f5e5a]">{label}</p>
            <p className="text-[28px] font-semibold text-[#16572A] leading-tight mt-1">{value}</p>
            {sub && <p className="text-[12px] text-[#5f5e5a] mt-0.5">{sub}</p>}
        </div>
    );
}

function Card({ title, right, children }) {
    return (
        <section className="bg-white border border-[#e5e3dc] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#efede6]">
                <h2 className="text-[15px] font-semibold text-[#1d1b16]">{title}</h2>
                {right}
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

// Inline editor for a sponsor's max participants (empty = no limit)
function MaxEditor({ sponsor, onSaved }) {
    const [value, setValue] = useState(sponsor.max_participants ?? '');
    const [state, setState] = useState(''); // '' | 'saving' | error text

    useEffect(() => setValue(sponsor.max_participants ?? ''), [sponsor.max_participants]);

    const dirty = String(value) !== String(sponsor.max_participants ?? '');

    async function save() {
        const trimmed = String(value).trim();
        const max = trimmed === '' ? null : Number(trimmed);
        if (max !== null && (!Number.isInteger(max) || max < 0)) {
            setState('Whole number only');
            return;
        }
        setState('saving');
        const { error } = await supabase.from('symposium_sponsors').update({ max_participants: max }).eq('id', sponsor.id);
        if (error) {
            setState(error.message);
            return;
        }
        setState('');
        onSaved();
    }

    return (
        <div className="flex items-center gap-1.5">
            <input
                type="number"
                min="0"
                value={value}
                placeholder="—"
                onChange={(e) => { setValue(e.target.value); setState(''); }}
                onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
                className="w-16 px-2 py-1 border border-[#d3d1c7] rounded text-[13px] text-right"
                title="Max participants (leave empty for no limit)"
            />
            {dirty && (
                <button
                    onClick={save}
                    disabled={state === 'saving'}
                    className="px-2 py-1 text-[12px] bg-[#16572A] text-white rounded hover:bg-[#EDB221] disabled:opacity-60"
                >
                    {state === 'saving' ? '…' : 'Save'}
                </button>
            )}
            {state && state !== 'saving' && <span className="text-[11.5px] text-[#A32D2D]">{state}</span>}
        </div>
    );
}

export default function SymposiumDashboard() {
    const [regs, setRegs] = useState([]);
    const [sponsors, setSponsors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [updatedAt, setUpdatedAt] = useState(null);

    const [search, setSearch] = useState('');
    const [sponsorFilter, setSponsorFilter] = useState('all'); // 'all' | 'self' | sponsor name
    const [certFilter, setCertFilter] = useState('all'); // 'all' | 'yes' | 'no'

    const load = useCallback(async () => {
        try {
            const [r, s] = await Promise.all([fetchRegistrations(), fetchSponsors()]);
            setRegs(r);
            setSponsors(s);
            setError('');
            setUpdatedAt(new Date());
        } catch (err) {
            setError(err.message || 'Could not load registrations.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const t = setInterval(load, REFRESH_MS);
        return () => clearInterval(t);
    }, [load]);

    // ─── Numbers ────────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const today = dayKey(new Date().toISOString());
        const sponsored = regs.filter((r) => r.sponsored === 'yes').length;
        return {
            total: regs.length,
            today: regs.filter((r) => dayKey(r.created_at) === today).length,
            sponsored,
            self: regs.length - sponsored,
            cert: regs.filter((r) => r.certificate_needed === 'yes').length,
            license: regs.filter((r) => (r.agri_license || '').trim()).length,
        };
    }, [regs]);

    const sponsorRows = useMemo(() => {
        const counts = {};
        regs.forEach((r) => {
            if (r.sponsored === 'yes' && r.sponsor) counts[r.sponsor] = (counts[r.sponsor] || 0) + 1;
        });
        const known = new Set(sponsors.map((s) => s.name));
        const rows = sponsors.map((s) => {
            const used = counts[s.name] || 0;
            const max = s.max_participants;
            return { ...s, used, left: max == null ? null : Math.max(max - used, 0), full: max != null && used >= max };
        });
        // registrations pointing to a sponsor that no longer exists in the table
        Object.keys(counts)
            .filter((n) => !known.has(n))
            .forEach((n) => rows.push({ id: `orphan-${n}`, name: n, used: counts[n], max_participants: null, orphan: true }));
        return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', ignorePunctuation: true }));
    }, [regs, sponsors]);

    const slotTotals = useMemo(() => {
        const limited = sponsorRows.filter((s) => s.max_participants != null && !s.orphan);
        return {
            used: limited.reduce((n, s) => n + Math.min(s.used, s.max_participants), 0),
            max: limited.reduce((n, s) => n + s.max_participants, 0),
            full: limited.filter((s) => s.full).length,
        };
    }, [sponsorRows]);

    const perDay = useMemo(() => {
        const map = {};
        regs.forEach((r) => {
            const k = dayKey(r.created_at);
            map[k] = (map[k] || 0) + 1;
        });
        return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    }, [regs]);
    const dayMax = Math.max(1, ...perDay.map(([, n]) => n));

    // ─── Table ──────────────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return regs.filter((r) => {
            if (sponsorFilter === 'self' && r.sponsored === 'yes') return false;
            if (sponsorFilter !== 'all' && sponsorFilter !== 'self' && r.sponsor !== sponsorFilter) return false;
            if (certFilter !== 'all' && r.certificate_needed !== certFilter) return false;
            if (!q) return true;
            return [r.first_name, r.middle_name, r.last_name, r.email, r.mobile, r.company, r.position, r.agri_license, r.sponsor]
                .some((v) => (v || '').toLowerCase().includes(q));
        });
    }, [regs, search, sponsorFilter, certFilter]);

    async function signOut() {
        await supabase.auth.signOut();
        window.location.reload(); // the login check shows the sign-in screen again
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-[#f7f6f2] p-6">
                <p className="text-[14px] text-[#5f5e5a]">Loading symposium registrations…</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f7f6f2]">
        <header className="bg-[#16572A] text-white">
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
                <span className="text-[14px] font-semibold tracking-wide">PHILSAN · 2nd Pet Symposium</span>
                <button onClick={signOut} className="text-[13px] text-white/85 hover:text-[#EDB221]">
                    Sign out
                </button>
            </div>
        </header>
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-[22px] font-semibold text-[#1d1b16]">2nd Pet Symposium</h1>
                    <p className="text-[13px] text-[#5f5e5a]">
                        Registration monitoring
                        {updatedAt && ` · updated ${updatedAt.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}`}
                        {' · refreshes every minute'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={load}
                        className="px-3.5 py-2 border border-[#16572A] text-[#16572A] text-[13.5px] font-medium rounded-md hover:bg-[#EAF3DE]"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={() => downloadCsv(regs)}
                        disabled={!regs.length}
                        className="px-3.5 py-2 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60"
                    >
                        Export all (CSV)
                    </button>
                </div>
            </div>

            {error && (
                <p className="px-4 py-3 bg-[#FCEBEB] text-[#A32D2D] text-[13.5px] rounded-lg">{error}</p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <Stat label="Total registered" value={stats.total} />
                <Stat label="Today" value={stats.today} />
                <Stat label="Sponsored" value={stats.sponsored} />
                <Stat label="Self-paying" value={stats.self} />
                <Stat label="Need certificate" value={stats.cert} />
                <Stat label="With PRC license" value={stats.license} />
            </div>

            <div className="grid lg:grid-cols-3 gap-5">
                <div className="lg:col-span-2">
                    <Card
                        title="Sponsor slots"
                        right={
                            <span className="text-[12.5px] text-[#5f5e5a]">
                                {slotTotals.used} of {slotTotals.max} slots used · {slotTotals.full} full (hidden from the form)
                            </span>
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13.5px]">
                                <thead>
                                    <tr className="text-left text-[12px] uppercase tracking-wide text-[#5f5e5a]">
                                        <th className="py-2 pr-3 font-medium">Sponsor</th>
                                        <th className="py-2 pr-3 font-medium w-[38%]">Used</th>
                                        <th className="py-2 pr-3 font-medium text-right">Left</th>
                                        <th className="py-2 font-medium">Max</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sponsorRows.map((s) => {
                                        const pct = s.max_participants ? Math.min(100, (s.used / s.max_participants) * 100) : 0;
                                        return (
                                            <tr key={s.id} className="border-t border-[#efede6]">
                                                <td className="py-2 pr-3">
                                                    <button
                                                        onClick={() => setSponsorFilter(s.name)}
                                                        className="text-left hover:underline text-[#1d1b16]"
                                                        title="Show this sponsor's registrants"
                                                    >
                                                        {s.name}
                                                    </button>
                                                    {s.full && <span className="ml-2 px-1.5 py-0.5 text-[10.5px] font-semibold rounded bg-[#FCEBEB] text-[#A32D2D]">FULL</span>}
                                                    {s.active === false && <span className="ml-2 px-1.5 py-0.5 text-[10.5px] rounded bg-[#efede6] text-[#5f5e5a]">hidden</span>}
                                                    {s.orphan && <span className="ml-2 px-1.5 py-0.5 text-[10.5px] rounded bg-[#FAEEDA] text-[#854F0B]">not in sponsor list</span>}
                                                </td>
                                                <td className="py-2 pr-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-14 tabular-nums">
                                                            {s.used}{s.max_participants != null ? ` / ${s.max_participants}` : ''}
                                                        </span>
                                                        {s.max_participants != null && (
                                                            <div className="flex-1 h-2 bg-[#EAF3DE] rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full rounded-full"
                                                                    style={{ width: `${pct}%`, background: s.full ? '#A32D2D' : pct >= 75 ? '#EDB221' : '#1F773A' }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2 pr-3 text-right tabular-nums">{s.left ?? '—'}</td>
                                                <td className="py-2">{s.orphan ? '—' : <MaxEditor sponsor={s} onSaved={load} />}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <p className="text-[12px] text-[#5f5e5a] mt-3">
                            Change a limit and press Save. Leave Max empty for no limit. A sponsor drops off the
                            registration form as soon as it is full, and reappears if you raise its limit.
                        </p>
                    </Card>
                </div>

                <Card title="Registrations per day">
                    {perDay.length === 0 ? (
                        <p className="text-[13px] text-[#5f5e5a]">No registrations yet.</p>
                    ) : (
                        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                            {perDay.map(([day, n]) => (
                                <li key={day} className="flex items-center gap-2 text-[13px]">
                                    <span className="w-[86px] shrink-0 text-[#5f5e5a]">
                                        {new Date(`${day}T00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}
                                    </span>
                                    <div className="flex-1 h-4 bg-[#EAF3DE] rounded overflow-hidden">
                                        <div className="h-full bg-[#1F773A]" style={{ width: `${(n / dayMax) * 100}%` }} />
                                    </div>
                                    <span className="w-8 text-right tabular-nums">{n}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            </div>

            <Card
                title={`Registrants (${filtered.length}${filtered.length !== regs.length ? ` of ${regs.length}` : ''})`}
                right={
                    filtered.length !== regs.length && (
                        <button onClick={() => downloadCsv(filtered)} className="text-[12.5px] text-[#16572A] hover:underline">
                            Export these {filtered.length} (CSV)
                        </button>
                    )
                }
            >
                <div className="flex flex-wrap gap-2 mb-3">
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, email, company, license…"
                        className="flex-1 min-w-[220px] px-3 py-2 border border-[#d3d1c7] rounded-md text-[13.5px]"
                    />
                    <select
                        value={sponsorFilter}
                        onChange={(e) => setSponsorFilter(e.target.value)}
                        className="px-3 py-2 border border-[#d3d1c7] rounded-md text-[13.5px] bg-white"
                    >
                        <option value="all">All sponsors</option>
                        <option value="self">Self-paying only</option>
                        {sponsorRows.map((s) => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                        ))}
                    </select>
                    <select
                        value={certFilter}
                        onChange={(e) => setCertFilter(e.target.value)}
                        className="px-3 py-2 border border-[#d3d1c7] rounded-md text-[13.5px] bg-white"
                    >
                        <option value="all">Certificate: any</option>
                        <option value="yes">Certificate needed</option>
                        <option value="no">No certificate</option>
                    </select>
                    {(search || sponsorFilter !== 'all' || certFilter !== 'all') && (
                        <button
                            onClick={() => { setSearch(''); setSponsorFilter('all'); setCertFilter('all'); }}
                            className="px-3 py-2 text-[13px] text-[#5f5e5a] hover:text-[#1d1b16]"
                        >
                            Clear
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-[13px] whitespace-nowrap">
                        <thead>
                            <tr className="text-left text-[11.5px] uppercase tracking-wide text-[#5f5e5a] border-b border-[#efede6]">
                                <th className="py-2 pr-3 font-medium">#</th>
                                <th className="py-2 pr-3 font-medium">Name</th>
                                <th className="py-2 pr-3 font-medium">Company / Position</th>
                                <th className="py-2 pr-3 font-medium">Contact</th>
                                <th className="py-2 pr-3 font-medium">PRC License</th>
                                <th className="py-2 pr-3 font-medium">Cert.</th>
                                <th className="py-2 pr-3 font-medium">Sponsor</th>
                                <th className="py-2 font-medium">Registered</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((r, i) => (
                                <tr key={r.id} className="border-b border-[#f4f2ec] align-top hover:bg-[#fafaf7]">
                                    <td className="py-2 pr-3 text-[#8a887f] tabular-nums">{filtered.length - i}</td>
                                    <td className="py-2 pr-3 font-medium text-[#1d1b16]">{fullName(r)}</td>
                                    <td className="py-2 pr-3">
                                        <div className="max-w-[260px] truncate" title={r.company}>{r.company}</div>
                                        <div className="max-w-[260px] truncate text-[#5f5e5a]" title={r.position}>{r.position}</div>
                                    </td>
                                    <td className="py-2 pr-3">
                                        <div>{r.email}</div>
                                        <div className="text-[#5f5e5a]">{r.mobile}</div>
                                    </td>
                                    <td className="py-2 pr-3">
                                        {r.agri_license ? (
                                            <>
                                                <div>{r.agri_license}</div>
                                                {r.license_expiry && <div className="text-[#5f5e5a]">exp. {r.license_expiry}</div>}
                                            </>
                                        ) : (
                                            <span className="text-[#b4b2a9]">—</span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-3">
                                        {r.certificate_needed === 'yes'
                                            ? <span className="px-1.5 py-0.5 text-[11px] rounded bg-[#EAF3DE] text-[#16572A] font-medium">Yes</span>
                                            : <span className="text-[#8a887f]">No</span>}
                                    </td>
                                    <td className="py-2 pr-3">
                                        {r.sponsored === 'yes' ? r.sponsor : <span className="text-[#8a887f]">Self-paying</span>}
                                    </td>
                                    <td className="py-2 text-[#5f5e5a]">{fmtDateTime(r.created_at)}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="py-6 text-center text-[#5f5e5a]">
                                        {regs.length ? 'No registrants match these filters.' : 'No registrations yet.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </main>
        </div>
    );
}