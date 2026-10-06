import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useParticipants } from '../lib/useParticipants';
import TransferModal from '../components/TransferModal';

const STATUS_TABS = [
    { value: 'approved', label: 'Approved' },
    { value: 'pending',  label: 'Pending' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'canceled', label: 'Canceled' },
    { value: 'all',      label: 'All' },
];

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    rejected: 'bg-[#FCEBEB] text-[#A32D2D]',
    canceled: 'bg-[#F0E6FF] text-[#6B21A8]',
};

function canTransfer(status) {
    return status === 'pending' || status === 'approved';
}

function sponsorOf(p) {
    return p.sponsored === 'yes' ? (p.sponsor ?? '').trim() : '';
}

function timeLabel(iso) {
    return iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
}

function fullName(p) {
    return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().toUpperCase();
}

export default function Dashboard() {
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('approved');
    const [search, setSearch] = useState('');
    const [sponsorFilter, setSponsorFilter] = useState('');
    const [transferTarget, setTransferTarget] = useState(null);
    const [actionError, setActionError] = useState('');

    // Time in: participant_id -> { id, scanned_at } from attendance_logs
    const [timeIns, setTimeIns] = useState(new Map());
    const [timeBusyId, setTimeBusyId] = useState(null);

    const fetchTimeIns = useCallback(async () => {
        const PAGE = 1000;
        const map = new Map();
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase
                .from('attendance_logs')
                .select('id, participant_id, scanned_at')
                .order('id', { ascending: true })
                .range(from, from + PAGE - 1);
            if (error) { console.error(error); return; }
            for (const l of data) map.set(l.participant_id, l);
            if (data.length < PAGE) break;
        }
        setTimeIns(map);
    }, []);

    useEffect(() => {
        fetchTimeIns();
        // Keep in sync with the scanners and the Attendance page
        let t = null;
        const channel = supabase
            .channel('participants_page_time_in')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
                clearTimeout(t);
                t = setTimeout(fetchTimeIns, 800);
            })
            .subscribe();
        return () => { clearTimeout(t); supabase.removeChannel(channel); };
    }, [fetchTimeIns]);

    async function handleTimeIn(p) {
        setActionError('');
        setTimeBusyId(p.id);
        const { data, error } = await supabase
            .from('attendance_logs')
            .insert({ participant_id: p.id, scanned_by: null, device_id: 'manual-dashboard' })
            .select('id, participant_id, scanned_at')
            .single();
        setTimeBusyId(null);
        if (error) {
            if (error.code === '23505') {
                setActionError(`${fullName(p)} is already timed in.`);
                fetchTimeIns();
            } else {
                setActionError(error.message);
            }
            return;
        }
        setTimeIns((prev) => new Map(prev).set(p.id, data));
    }

    async function handleUndoTimeIn(p) {
        const log = timeIns.get(p.id);
        if (!log) return;
        if (!window.confirm(`Undo time in for ${fullName(p)}?`)) return;
        setActionError('');
        setTimeBusyId(p.id);
        const { error } = await supabase.from('attendance_logs').delete().eq('id', log.id);
        setTimeBusyId(null);
        if (error) {
            setActionError(error.message);
            return;
        }
        setTimeIns((prev) => { const m = new Map(prev); m.delete(p.id); return m; });
    }

    // Time in / Undo control for one participant (approved only)
    function TimeInControl({ p, small }) {
        if (p.reg_status !== 'approved') return null;
        const log = timeIns.get(p.id);
        const busy = timeBusyId === p.id;
        const size = small ? 'text-[12px]' : 'text-[12.5px]';
        if (log) {
            return (
                <div className={`flex ${small ? 'items-center gap-2' : 'flex-col items-end'}`}>
                    <span className={`${size} text-[#3B6D11] font-medium whitespace-nowrap`}>✓ {timeLabel(log.scanned_at)}</span>
                    <button onClick={() => handleUndoTimeIn(p)} disabled={busy}
                        className={`${size} text-[#A32D2D] hover:underline disabled:opacity-50`}>
                        {busy ? '…' : 'Undo'}
                    </button>
                </div>
            );
        }
        return (
            <button onClick={() => handleTimeIn(p)} disabled={busy}
                className={`px-3 py-1.5 rounded-md ${size} font-medium text-white bg-[#16572A] hover:opacity-90 disabled:opacity-50 whitespace-nowrap`}>
                {busy ? 'Saving…' : 'Time in'}
            </button>
        );
    }

    const {
        participants,
        loading,
        error,
        transferParticipant,
    } = useParticipants(statusFilter);

    // Sponsor names for the dropdown (A → Z)
    const sponsorOptions = useMemo(() => {
        const names = new Set(participants.map(sponsorOf).filter(Boolean));
        if (sponsorFilter) names.add(sponsorFilter);
        return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    }, [participants, sponsorFilter]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();

        let list = sponsorFilter
            ? participants.filter((p) => sponsorOf(p) === sponsorFilter)
            : participants;

        if (q) {
            list = list.filter((p) =>
                `${p.first_name} ${p.last_name} ${p.email} ${p.company} ${sponsorOf(p)}`.toLowerCase().includes(q)
            );
        }

        // Alphabetical A → Z by the name exactly as displayed ("First Last")
        return [...list].sort((a, b) =>
            fullName(a).localeCompare(fullName(b), undefined, { sensitivity: 'base' })
        );
    }, [participants, search, sponsorFilter]);

    async function handleTransfer(sponsorName) {
        setActionError('');
        const { error } = await transferParticipant(transferTarget.id, sponsorName);
        if (error) {
            setActionError(error.message);
        } else {
            setTransferTarget(null);
        }
    }

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-8">
            <div className="mb-5">
                <h1 className="text-[20px] lg:text-[22px] font-bold text-[#16572A]">Participants</h1>
                <p className="text-[13px] text-[#5f5e5a] mt-1">Tap a row to view details and take action.</p>
            </div>

            {/* Status tabs */}
            <div className="overflow-x-auto -mx-4 px-4 mb-4">
                <div className="flex gap-1 bg-white border border-[#e5e3da] rounded-md p-1 w-max min-w-full">
                    {STATUS_TABS.map((tab) => (
                        <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                            className={`px-3 py-1.5 rounded text-[12.5px] font-medium transition-colors whitespace-nowrap ${
                                statusFilter === tab.value ? 'bg-[#16572A] text-white' : 'text-[#5f5e5a] hover:bg-[#f1efe8]'
                            }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search + sponsor filter */}
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input type="search" placeholder="Search name, email, company, sponsor…"
                    value={search} onChange={(e) => setSearch(e.target.value)}
                    className="flex-1 p-2.5 rounded-md border border-[#339544] text-[13.5px]" />
                <select value={sponsorFilter} onChange={(e) => setSponsorFilter(e.target.value)}
                    className="sm:w-[280px] p-2.5 rounded-md border border-[#339544] text-[13.5px] bg-white">
                    <option value="">All sponsors</option>
                    {sponsorOptions.map((name) => (
                        <option key={name} value={name}>{name}</option>
                    ))}
                </select>
            </div>
            {!loading && !error && sponsorFilter && (
                <p className="text-[12.5px] text-[#5f5e5a] -mt-2 mb-3">
                    {filtered.length} participant{filtered.length === 1 ? '' : 's'} under {sponsorFilter}
                </p>
            )}

            {actionError && <p className="text-[13px] text-[#A32D2D] mb-4">{actionError}</p>}
            {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>}
            {error   && <p className="text-[13.5px] text-[#A32D2D]">Error: {error}</p>}

            {!loading && !error && filtered.length === 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-8 text-center">
                    <p className="text-[14px] text-[#5f5e5a]">No registrations match this view.</p>
                </div>
            )}

            {/* Desktop table */}
            {!loading && !error && filtered.length > 0 && (
                <>
                    <div className="hidden lg:block bg-white border border-[#e5e3da] rounded-lg overflow-x-auto">
                        <table className="w-full text-[13.5px]">
                            <thead>
                                <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                    <th className="px-4 py-3 font-medium w-12">#</th>
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Company</th>
                                    <th className="px-4 py-3 font-medium">Age</th>
                                    <th className="px-4 py-3 font-medium">Student</th>
                                    <th className="px-4 py-3 font-medium">Sponsored</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p, i) => (
                                    <tr key={p.id}
                                        onClick={() => navigate(`/participants/${p.id}`)}
                                        className="border-t border-[#e5e3da] hover:bg-[#f7f6f1] cursor-pointer transition-colors">
                                        <td className="px-4 py-3 text-[#5f5e5a]">{i + 1}</td>
                                        <td className="px-4 py-3 font-medium text-[#16572A]">{fullName(p)}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.age ?? '—'}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.is_student === 'yes' ? 'Yes' : '—'}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.sponsored === 'yes' ? p.sponsor || 'Yes' : 'No'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                                {p.reg_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex flex-col items-end gap-1.5">
                                                <TimeInControl p={p} />
                                                {canTransfer(p.reg_status) && (
                                                    <button
                                                        onClick={() => setTransferTarget(p)}
                                                        className="px-3 py-1.5 rounded-md text-[12.5px] font-medium text-[#16572A] border border-[#16572A]">
                                                        Transfer
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="lg:hidden flex flex-col gap-3">
                        {filtered.map((p, i) => (
                            <div key={p.id}
                                onClick={() => navigate(`/participants/${p.id}`)}
                                className="bg-white border border-[#e5e3da] rounded-lg p-4 cursor-pointer active:bg-[#f7f6f1]">
                                <div className="flex items-start justify-between mb-2">
                                    <p className="text-[14px] font-bold text-[#16572A]">{i + 1}. {fullName(p)}</p>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                        {p.reg_status}
                                    </span>
                                </div>
                                <p className="text-[12.5px] text-[#5f5e5a]">{p.email}</p>
                                {p.company && <p className="text-[12.5px] text-[#5f5e5a]">{p.company}</p>}
                                {p.age && <p className="text-[12.5px] text-[#5f5e5a]">Age: {p.age}</p>}
                                {p.is_student === 'yes' && <p className="text-[11.5px] text-[#16572A] mt-1">Student</p>}
                                {p.sponsored === 'yes' && <p className="text-[11.5px] text-[#854F0B] mt-1">Sponsored by {p.sponsor || 'sponsor'}</p>}
                                {(p.reg_status === 'approved' || canTransfer(p.reg_status)) && (
                                    <div className="mt-3 flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                                        <TimeInControl p={p} small />
                                        {canTransfer(p.reg_status) && (
                                            <button
                                                onClick={() => setTransferTarget(p)}
                                                className="px-3 py-1.5 rounded-md text-[12px] font-medium text-[#16572A] border border-[#16572A]">
                                                Transfer
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {transferTarget && (
                <TransferModal
                    participant={transferTarget}
                    onCancel={() => setTransferTarget(null)}
                    onConfirm={handleTransfer}
                />
            )}
        </div>
    );
}