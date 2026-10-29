import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

// 2nd Pet Symposium: report + quiz/survey summary PDFs (symposium data only)
export default function SymposiumReportsCard() {
    const [raw, setRaw] = useState(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(''); // '' | 'report' | 'summary'

    useEffect(() => {
        (async () => {
            try {
                const m = await import('./symposiumReports');
                setRaw(await m.fetchSymposiumReportData(supabase));
            } catch (err) {
                setError(err.message || 'Could not load the symposium data.');
            }
        })();
    }, []);

    async function make(kind) {
        setBusy(kind);
        setError('');
        try {
            const m = await import('./symposiumReports');
            const fresh = await m.fetchSymposiumReportData(supabase); // always the latest data
            setRaw(fresh);
            if (kind === 'report') await m.downloadSymposiumReport(fresh);
            if (kind === 'summary') await m.downloadSymposiumQuizSurveySummary(fresh);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Could not create the PDF.');
        } finally {
            setBusy('');
        }
    }

    const btn = (kind, label, disabled) => (
        <button
            onClick={() => make(kind)}
            disabled={!raw || !!busy || disabled}
            className="px-3.5 py-2 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60"
        >
            {busy === kind ? 'Creating PDF…' : label}
        </button>
    );

    return (
        <section className="bg-white border border-[#e5e3dc] rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#efede6]">
                <h2 className="text-[15px] font-semibold text-[#1d1b16]">Reports (PDF)</h2>
                <div className="flex flex-wrap gap-2">
                    {btn('report', 'Symposium Report')}
                    {btn('summary', 'Quiz & Survey Summary', raw && !raw.attempts.length && !raw.survey.length)}
                </div>
            </div>
            <div className="p-4 space-y-3">
                <p className="text-[13px] text-[#5f5e5a]">
                    Symposium Report: registrations, sponsors, pre-registration trend, companies, survey results, speaker
                    ratings, quiz results and completion. Quiz &amp; Survey Summary (one PDF): survey ratings, speaker evaluation
                    and every written answer, then quiz scores, results by speaker and every question. Built from live
                    data each time.
                </p>
                {error && <p className="px-3 py-2 bg-[#FCEBEB] text-[#A32D2D] text-[13px] rounded-lg">{error}</p>}
                {!raw && !error && <p className="text-[13px] text-[#5f5e5a]">Loading current numbers…</p>}
                {raw && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                            ['Registered', raw.registrations.length],
                            ['Survey responses', raw.survey.length],
                            ['Quiz takers', raw.attempts.length],
                            ['Certificates', raw.certificates.length],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-lg bg-[#EAF3DE] px-3 py-2.5">
                                <p className="text-[12px] text-[#5f5e5a]">{label}</p>
                                <p className="text-[18px] font-semibold text-[#16572A]">{value.toLocaleString('en-US')}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
