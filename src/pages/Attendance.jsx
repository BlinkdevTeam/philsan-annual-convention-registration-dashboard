import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function tally(rows, key) {
    const counts = {};
    for (const row of rows) {
        const val = row.participants?.[key] ?? 'Unknown';
        counts[val] = (counts[val] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function AttendanceRow({ log, onUndo, onQr, busy }) {
    const p = log.participants;

    return (
        <div
            className="px-5 py-3 border-b border-[#f1efe8] last:border-b-0 grid items-center gap-3"
            style={{ gridTemplateColumns: '1fr 100px 48px 32px' }}
        >
            <div className="min-w-0">
                <p className="text-[13.5px] font-medium text-[#1d1b16] truncate">
                    {p ? `${p.first_name} ${p.last_name}` : 'Unknown participant'}
                </p>
                <p className="text-[12px] text-[#98a2b3] truncate">
                    {p?.company ?? '—'}
                    {p?.sponsor ? ` · ${p.sponsor}` : ''}
                </p>
            </div>
            <p className="text-[12px] text-[#5f5e5a] text-right whitespace-nowrap">
                {new Date(log.scanned_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                })}
            </p>
            <button
                onClick={() => onUndo(log, p)}
                disabled={busy}
                className="text-[11.5px] text-[#A32D2D] underline text-right disabled:opacity-60"
            >
                {busy ? '…' : 'Undo'}
            </button>
            {p ? (
                <Link
                    to={`/participants/${p.id}/qr`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11.5px] text-[#16572A] underline text-right whitespace-nowrap"
                >
                    QR{p.qr_print_count ? ` (${p.qr_print_count})` : ''}
                </Link>
            ) : (
                <span />
            )}
        </div>
    );
}

function BreakdownCard({ title, data }) {
    return (
        <div className="bg-white rounded-lg border border-[#e5e3da] p-4">
            <p className="text-[13px] font-medium text-[#344054] mb-3">{title}</p>
            <div className="flex flex-col gap-1.5">
                {data.length === 0 && (
                    <p className="text-[12px] text-[#98a2b3]">No scans yet</p>
                )}
                {data.map(([label, count]) => (
                    <div key={label} className="flex items-center justify-between text-[13px]">
                        <span className="text-[#5f5e5a] truncate pr-2">{label}</span>
                        <span className="text-[#16572A] font-semibold shrink-0">{count}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function Attendance() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Manual check-in state
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [checkinBusyId, setCheckinBusyId] = useState(null);
    const [checkinError, setCheckinError] = useState(null);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'checkin' | 'undo', participant?, log? }

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
            .from('attendance_logs')
            .select('*, participants(*)')
            .order('scanned_at', { ascending: false });

        if (error) {
            setError(error.message);
        } else {
            setLogs(data ?? []);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    // Realtime subscription — new scans stream in as they happen
    useEffect(() => {
        const channel = supabase
            .channel('attendance_logs_changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
                async (payload) => {
                    const newLog = payload.new;

                    // Fetch the related participant since the realtime payload
                    // only contains the raw attendance_logs row
                    const { data: participant } = await supabase
                        .from('participants')
                        .select('*')
                        .eq('id', newLog.participant_id)
                        .single();

                    setLogs((prev) => [{ ...newLog, participants: participant }, ...prev]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Keep participant data (e.g. qr_print_count) fresh across tabs —
    // printing happens on a separate page, so this syncs those updates in.
    useEffect(() => {
        const channel = supabase
            .channel('participants_changes')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'participants' },
                (payload) => {
                    const updated = payload.new;
                    setLogs((prev) =>
                        prev.map((log) =>
                            log.participant_id === updated.id
                                ? { ...log, participants: updated }
                                : log
                        )
                    );
                    setSearchResults((prev) =>
                        prev.map((p) => (p.id === updated.id ? updated : p))
                    );
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Set of participant_ids already checked in — from either scanner or manual entry
    const checkedInIds = useMemo(
        () => new Set(logs.map((log) => log.participant_id)),
        [logs]
    );

    // Debounced search over approved participants by name or email
    useEffect(() => {
        const term = searchTerm.trim();

        if (term.length < 2) {
            setSearchResults([]);
            return;
        }

        const timeout = setTimeout(async () => {
            setSearching(true);

            const { data, error } = await supabase
                .from('participants')
                .select('*')
                .eq('reg_status', 'approved')
                .or(
                    `first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`
                )
                .limit(10);

            if (!error) {
                setSearchResults(data ?? []);
            }
            setSearching(false);
        }, 350);

        return () => clearTimeout(timeout);
    }, [searchTerm]);

    async function handleManualCheckIn(participant) {
        setCheckinError(null);
        setCheckinBusyId(participant.id);

        const { error } = await supabase.from('attendance_logs').insert({
            participant_id: participant.id,
            scanned_by: null,
            device_id: 'manual-dashboard',
        });

        setCheckinBusyId(null);

        if (error) {
            // 23505 = unique_violation — the DB-level constraint on participant_id
            if (error.code === '23505') {
                setCheckinError(
                    `${participant.first_name} ${participant.last_name} is already checked in.`
                );
            } else {
                setCheckinError(error.message);
            }
        }
        // On success, the realtime subscription above will append the new
        // log automatically — no manual state update needed here.
    }

    async function handleUndoCheckIn(log) {
        setCheckinError(null);
        setCheckinBusyId(log.participant_id);

        const { error } = await supabase
            .from('attendance_logs')
            .delete()
            .eq('id', log.id);

        setCheckinBusyId(null);

        if (error) {
            setCheckinError(error.message);
            return;
        }

        // Remove locally right away — realtime only pushes INSERTs in this
        // page's subscription, so a DELETE won't come back on its own.
        setLogs((prev) => prev.filter((l) => l.id !== log.id));
    }

    const totalScanned = logs.length;
    const lastScan = logs[0]?.scanned_at ?? null;
    const walkInCount = useMemo(
        () => logs.filter((log) => log.device_id === 'walk-in-registration').length,
        [logs]
    );
    const walkInLogs = useMemo(
        () => logs.filter((log) => log.device_id === 'walk-in-registration'),
        [logs]
    );

    const bySponsor = useMemo(() => tally(logs, 'sponsor'), [logs]);
    const byAge = useMemo(() => tally(logs, 'age'), [logs]);
    const byCompany = useMemo(() => tally(logs, 'company'), [logs]);
    const bySouvenir = useMemo(() => tally(logs, 'souvenir'), [logs]);
    const byCertificate = useMemo(() => tally(logs, 'certificate_needed'), [logs]);
    const byStudent = useMemo(() => tally(logs, 'is_student'), [logs]);

    if (loading) {
        return (
            <div className="p-6">
                <p className="text-[#5f5e5a] text-sm">Loading attendance…</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <p className="text-red-600 text-sm">Error loading attendance: {error}</p>
            </div>
        );
    }

    return (
        <div className="p-6 flex flex-col gap-6">
            <div>
                <h1 className="text-[22px] font-bold text-[#1d1b16]">Attendance</h1>
                <p className="text-[13px] text-[#5f5e5a] mt-1">
                    Live feed of participants scanned in at the entrance
                </p>
            </div>

            {/* Manual check-in */}
            <div className="bg-white rounded-lg border border-[#e5e3da] p-5">
                <p className="text-[14px] font-medium text-[#1d1b16] mb-1">
                    Manual Check-In
                </p>
                <p className="text-[12.5px] text-[#5f5e5a] mb-3">
                    Use this if a participant's QR code fails to scan. Search by name or email.
                </p>

                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search participant name or email…"
                    className="w-full p-2.5 rounded-md border border-[#d8d5c9] text-[14px]"
                />

                {checkinError && (
                    <p className="text-[12.5px] text-[#A32D2D] mt-2">{checkinError}</p>
                )}

                {searching && (
                    <p className="text-[12.5px] text-[#98a2b3] mt-3">Searching…</p>
                )}

                {!searching && searchTerm.trim().length >= 2 && (
                    <div className="mt-3 flex flex-col gap-2">
                        {searchResults.length === 0 && (
                            <p className="text-[12.5px] text-[#98a2b3]">
                                No approved participants found.
                            </p>
                        )}
                        {searchResults.map((p) => {
                            const alreadyIn = checkedInIds.has(p.id);
                            const existingLog = logs.find((l) => l.participant_id === p.id);

                            return (
                                <div
                                    key={p.id}
                                    className="flex items-center justify-between border border-[#f1efe8] rounded-md px-3 py-2.5"
                                >
                                    <div>
                                        <p className="text-[13.5px] font-medium text-[#1d1b16]">
                                            {p.first_name} {p.last_name}
                                        </p>
                                        <p className="text-[12px] text-[#98a2b3]">
                                            {p.email}
                                            {p.company ? ` · ${p.company}` : ''}
                                        </p>
                                    </div>

                                    {alreadyIn ? (
                                        <div className="flex items-center gap-3 shrink-0 pl-3">
                                            <span className="text-[12px] text-[#16572A] font-medium">
                                                Already checked in
                                                {existingLog
                                                    ? ` at ${new Date(
                                                          existingLog.scanned_at
                                                      ).toLocaleTimeString([], {
                                                          hour: '2-digit',
                                                          minute: '2-digit',
                                                      })}`
                                                    : ''}
                                            </span>
                                            {existingLog && (
                                                <button
                                                    onClick={() => setPendingAction({ type: 'undo', log: existingLog, participant: p })}
                                                    disabled={checkinBusyId === p.id}
                                                    className="text-[12px] text-[#A32D2D] font-medium underline disabled:opacity-60"
                                                >
                                                    {checkinBusyId === p.id ? 'Undoing…' : 'Undo'}
                                                </button>
                                            )}
                                            <Link
                                                to={`/participants/${p.id}/qr`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[12px] text-[#16572A] font-medium underline"
                                            >
                                                View/Print QR
                                            </Link>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setPendingAction({ type: 'checkin', participant: p })}
                                            disabled={checkinBusyId === p.id}
                                            className="shrink-0 ml-3 bg-[#16572A] hover:bg-[#EDB221] text-white text-[12.5px] font-medium px-3 py-1.5 rounded-md disabled:opacity-60"
                                        >
                                            {checkinBusyId === p.id ? 'Logging in…' : 'Log In'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Top stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-lg border border-[#e5e3da] p-5">
                    <p className="text-[12px] uppercase tracking-wide text-[#98a2b3] mb-1">
                        Total Scanned
                    </p>
                    <p className="text-[28px] font-bold text-[#16572A]">{totalScanned}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#e5e3da] p-5">
                    <p className="text-[12px] uppercase tracking-wide text-[#98a2b3] mb-1">
                        Walk-In Registrations
                    </p>
                    <p className="text-[28px] font-bold text-[#16572A]">{walkInCount}</p>
                </div>
                <div className="bg-white rounded-lg border border-[#e5e3da] p-5">
                    <p className="text-[12px] uppercase tracking-wide text-[#98a2b3] mb-1">
                        Last Scan
                    </p>
                    <p className="text-[18px] font-semibold text-[#1d1b16]">
                        {lastScan
                            ? new Date(lastScan).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                              })
                            : '—'}
                    </p>
                </div>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <BreakdownCard title="By Sponsor" data={bySponsor} />
                <BreakdownCard title="By Age Group" data={byAge} />
                <BreakdownCard title="By Company" data={byCompany} />
                <BreakdownCard title="By Souvenir" data={bySouvenir} />
                <BreakdownCard title="By Certificate Needed" data={byCertificate} />
                <BreakdownCard title="By Student Status" data={byStudent} />
            </div>

            {/* Live scan feed + Walk-In queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-[#e5e3da]">
                    <div className="px-5 py-4 border-b border-[#e5e3da]">
                        <p className="text-[14px] font-medium text-[#1d1b16]">Live Scan Feed</p>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">
                        {logs.length === 0 && (
                            <p className="text-[13px] text-[#98a2b3] px-5 py-6">
                                No scans recorded yet.
                            </p>
                        )}
                        {logs.map((log) => (
                            <AttendanceRow
                                key={log.id}
                                log={log}
                                busy={checkinBusyId === log.participant_id}
                                onUndo={(l, p) => setPendingAction({ type: 'undo', log: l, participant: p })}
                            />
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-[#e5e3da]">
                    <div className="px-5 py-4 border-b border-[#e5e3da]">
                        <p className="text-[14px] font-medium text-[#1d1b16]">Walk-In Queue</p>
                        <p className="text-[12px] text-[#98a2b3] mt-0.5">
                            For the sticker printer — most recent walk-in first
                        </p>
                    </div>
                    <div className="max-h-[480px] overflow-y-auto">
                        {walkInLogs.length === 0 && (
                            <p className="text-[13px] text-[#98a2b3] px-5 py-6">
                                No walk-ins registered yet.
                            </p>
                        )}
                        {walkInLogs.map((log) => (
                            <AttendanceRow
                                key={log.id}
                                log={log}
                                busy={checkinBusyId === log.participant_id}
                                onUndo={(l, p) => setPendingAction({ type: 'undo', log: l, participant: p })}
                            />
                        ))}
                    </div>
                </div>
            </div>

            {/* Confirmation modal for manual check-in / undo */}
            {pendingAction && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setPendingAction(null); }}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px] p-6">
                        {pendingAction.type === 'checkin' ? (
                            <>
                                <h2 className="text-[17px] font-bold text-[#16572A] mb-2">
                                    Log in this participant?
                                </h2>
                                <p className="text-[13.5px] text-[#5f5e5a] mb-6 leading-[1.6]">
                                    This will check in{' '}
                                    <strong>
                                        {pendingAction.participant.first_name}{' '}
                                        {pendingAction.participant.last_name}
                                    </strong>{' '}
                                    for attendance right now.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setPendingAction(null)}
                                        className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleManualCheckIn(pendingAction.participant);
                                            setPendingAction(null);
                                        }}
                                        className="flex-1 py-2.5 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-tl-[16px] rounded-br-[16px]"
                                    >
                                        Yes, log in
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-[17px] font-bold text-[#344054] mb-2">
                                    Undo this check-in?
                                </h2>
                                <p className="text-[13.5px] text-[#5f5e5a] mb-6 leading-[1.6]">
                                    This will remove the attendance record for{' '}
                                    <strong>
                                        {pendingAction.participant?.first_name ?? 'this participant'}{' '}
                                        {pendingAction.participant?.last_name ?? ''}
                                    </strong>
                                    . They will need to be scanned or logged in again.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setPendingAction(null)}
                                        className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            handleUndoCheckIn(pendingAction.log);
                                            setPendingAction(null);
                                        }}
                                        className="flex-1 py-2.5 bg-[#A32D2D] hover:bg-[#791F1F] text-white text-[13.5px] font-medium rounded-md"
                                    >
                                        Yes, undo
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}