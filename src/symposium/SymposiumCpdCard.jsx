import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
    SYMPOSIUM_CPD_DEFAULTS,
    fetchSymposiumCpdPeople,
    buildSymposiumRegistrationSheet,
    buildSymposiumAttendanceSheet,
} from './symposiumCpd';

// PRC CPDD-12-A / CPDD-12-B download card for the symposium dashboard.
// Lists every symposium registrant with a PRC license number (no check-in for the symposium).
// The form details below the buttons are saved in report_notes (id 'symposium_cpd').

const NOTES_ID = 'symposium_cpd';

const FIELDS = [
    ['program_title', 'Title of the Program', 'text', true],
    ['date', 'Date', 'text'],
    ['venue', 'Venue', 'text'],
    ['time', 'Time', 'text', false, 'e.g. 8:00 AM – 5:00 PM'],
    ['room', 'Room', 'text'],
    ['topics', 'Topic/s (one per line, Attendance Sheet only)', 'textarea', true],
    ['signed_date', 'Date and Time (signature block)', 'text', false, 'Leave blank to write by hand'],
];

const FILES = {
    A: { template: 'cpdd-12-a-template.docx', name: 'Pet Symposium CPDD-12-A Registration Sheet.docx' },
    B: { template: 'cpdd-12-b-template.docx', name: 'Pet Symposium CPDD-12-B Attendance Sheet.docx' },
};

export default function SymposiumCpdCard() {
    const [people, setPeople] = useState(null);
    const [settings, setSettings] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState('');
    const [showWarnings, setShowWarnings] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const [ppl, saved] = await Promise.all([
                    fetchSymposiumCpdPeople(supabase),
                    supabase.from('report_notes').select('settings').eq('id', NOTES_ID).maybeSingle(),
                ]);
                setPeople(ppl);
                setSettings({ ...SYMPOSIUM_CPD_DEFAULTS, ...(saved.data?.settings || {}) });
            } catch (err) {
                setError(err.message);
            }
        })();
    }, []);

    async function download(kind) {
        setBusy(kind);
        setError('');
        try {
            await supabase
                .from('report_notes')
                .upsert({ id: NOTES_ID, settings, updated_at: new Date().toISOString() });
            const fresh = await fetchSymposiumCpdPeople(supabase); // latest registrations
            setPeople(fresh);

            const res = await fetch(`/reports/${FILES[kind].template}`);
            if (!res.ok) throw new Error(`Missing file: /reports/${FILES[kind].template}`);
            const template = await res.arrayBuffer();
            const bytes =
                kind === 'A'
                    ? buildSymposiumRegistrationSheet(template, fresh.licensed, settings)
                    : buildSymposiumAttendanceSheet(template, fresh.licensed, settings);

            const a = document.createElement('a');
            a.href = URL.createObjectURL(
                new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
            );
            a.download = FILES[kind].name;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Could not create the document.');
        } finally {
            setBusy('');
        }
    }

    const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
    const btn =
        'px-3.5 py-2 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60 disabled:hover:bg-[#16572A]';

    return (
        <section className="bg-white border border-[#e5e3dc] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#efede6]">
                <div>
                    <h2 className="text-[15px] font-semibold text-[#1d1b16]">PRC CPD forms (Word)</h2>
                    <p className="text-[12.5px] text-[#5f5e5a] mt-0.5">
                        All registrants with a PRC license number, A–Z by surname. Blank and "N/A" licenses are left out.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button onClick={() => download('A')} disabled={!people || !!busy} className={btn}>
                        {busy === 'A' ? 'Creating…' : 'CPDD-12-A Registration Sheet'}
                    </button>
                    <button onClick={() => download('B')} disabled={!people || !!busy} className={btn}>
                        {busy === 'B' ? 'Creating…' : 'CPDD-12-B Attendance Sheet'}
                    </button>
                </div>
            </div>

            <div className="p-4 space-y-3">
                {error && <p className="text-[13px] text-[#A32D2D]">{error}</p>}
                {!people && !error && <p className="text-[13px] text-[#5f5e5a]">Loading registrants…</p>}

                {people && (
                    <div className="grid sm:grid-cols-3 gap-3">
                        <div className="rounded-lg bg-[#EAF3DE] px-3 py-2.5">
                            <p className="text-[12px] text-[#5f5e5a]">On both forms (with license)</p>
                            <p className="text-[20px] font-semibold text-[#16572A]">{people.licensed.length}</p>
                        </div>
                        <div className="rounded-lg bg-[#f4f2ec] px-3 py-2.5">
                            <p className="text-[12px] text-[#5f5e5a]">Left out (no license)</p>
                            <p className="text-[20px] font-semibold text-[#5f5e5a]">{people.total - people.licensed.length}</p>
                        </div>
                        <button
                            onClick={() => setShowWarnings((v) => !v)}
                            disabled={!people.warnings.length}
                            className={`rounded-lg px-3 py-2.5 text-left ${people.warnings.length ? 'bg-amber-50 hover:bg-amber-100' : 'bg-[#f4f2ec]'}`}
                        >
                            <p className="text-[12px] text-[#5f5e5a]">License numbers to double-check</p>
                            <p className={`text-[20px] font-semibold ${people.warnings.length ? 'text-amber-700' : 'text-[#5f5e5a]'}`}>
                                {people.warnings.length}{' '}
                                {people.warnings.length > 0 && (
                                    <span className="text-[12px] font-normal">{showWarnings ? '▲ hide' : '▼ show'}</span>
                                )}
                            </p>
                        </button>
                    </div>
                )}

                {showWarnings && people?.warnings.length > 0 && (
                    <ul className="rounded-lg border border-amber-200 divide-y divide-amber-100 text-[13px]">
                        {people.warnings.map((w, i) => (
                            <li key={i} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                                <span className="text-[#1d1b16]">{w.name}</span>
                                <span className="text-[#5f5e5a]">
                                    {w.license} · {w.reason}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}

                {settings && (
                    <>
                        <button onClick={() => setShowDetails((v) => !v)} className="text-[13px] text-[#16572A] hover:underline">
                            {showDetails ? '▲ Hide form details' : '▼ Edit form details (title, date, venue, topics…)'}
                        </button>
                        {showDetails && (
                            <div className="grid md:grid-cols-2 gap-3">
                                {FIELDS.map(([key, label, type, wide, placeholder]) => (
                                    <label key={key} className={wide ? 'md:col-span-2' : ''}>
                                        <span className="text-[13px] font-medium text-[#344054]">{label}</span>
                                        {type === 'textarea' ? (
                                            <textarea
                                                rows={4}
                                                value={settings[key]}
                                                onChange={(e) => set(key, e.target.value)}
                                                className="mt-1 w-full rounded-md border border-[#d3d1c7] px-3 py-2 text-[13.5px]"
                                            />
                                        ) : (
                                            <input
                                                value={settings[key]}
                                                onChange={(e) => set(key, e.target.value)}
                                                placeholder={placeholder}
                                                className="mt-1 w-full rounded-md border border-[#d3d1c7] px-3 py-2 text-[13.5px]"
                                            />
                                        )}
                                    </label>
                                ))}
                                <p className="md:col-span-2 text-[12px] text-[#5f5e5a]">
                                    Saved automatically each time you download a form.
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
