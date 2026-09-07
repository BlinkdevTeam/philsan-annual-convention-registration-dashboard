import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

function tally(rows, key) {
    const counts = {};
    for (const row of rows) {
        const val = row.participants?.[key] ?? 'Unknown';
        counts[val] = (counts[val] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
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

    const totalScanned = logs.length;
    const lastScan = logs[0]?.scanned_at ?? null;

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

            {/* Top stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border border-[#e5e3da] p-5">
                    <p className="text-[12px] uppercase tracking-wide text-[#98a2b3] mb-1">
                        Total Scanned
                    </p>
                    <p className="text-[28px] font-bold text-[#16572A]">{totalScanned}</p>
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

            {/* Live scan feed */}
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
                    {logs.map((log) => {
                        const p = log.participants;
                        return (
                            <div
                                key={log.id}
                                className="px-5 py-3 border-b border-[#f1efe8] last:border-b-0 flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-[13.5px] font-medium text-[#1d1b16]">
                                        {p ? `${p.first_name} ${p.last_name}` : 'Unknown participant'}
                                    </p>
                                    <p className="text-[12px] text-[#98a2b3]">
                                        {p?.company ?? '—'}
                                        {p?.sponsor ? ` · ${p.sponsor}` : ''}
                                    </p>
                                </div>
                                <p className="text-[12px] text-[#5f5e5a] shrink-0 pl-3">
                                    {new Date(log.scanned_at).toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    })}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}