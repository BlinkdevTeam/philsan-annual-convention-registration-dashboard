import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { SURVEY_QUESTIONS, labelFor } from '../lib/surveyQuestions';

const GREEN = '#1F773A';
const CHOICE_QS = SURVEY_QUESTIONS.filter((q) => q.type === 'choice');
const TEXT_QS = SURVEY_QUESTIONS.filter((q) => q.type === 'text');

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

export default function SurveyResults() {
  const [rows, setRows] = useState([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [textKey, setTextKey] = useState(TEXT_QS[0].key);
  const [search, setSearch] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    const [resp, approved] = await Promise.all([
      supabase
        .from('survey_responses')
        .select('*, participants(first_name, last_name, email, company, sponsor)')
        .order('updated_at', { ascending: false }),
      supabase.from('participants').select('id', { count: 'exact', head: true }).eq('reg_status', 'approved'),
    ]);
    if (resp.error) setError(resp.error.message);
    setRows(resp.data || []);
    setApprovedCount(approved.count || 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const total = rows.length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);

  const breakdowns = useMemo(
    () =>
      CHOICE_QS.map((q) => ({
        q,
        counts: q.options.map((o) => ({ ...o, n: rows.filter((r) => r[q.key] === o.value).length })),
      })),
    [rows]
  );

  const recommendPct = pct(rows.filter((r) => ['very_likely', 'likely'].includes(r.recommend)).length);
  const excellentGoodPct = pct(rows.filter((r) => ['excellent', 'good'].includes(r.overall_experience)).length);

  const textAnswers = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .map((r) => ({
        id: r.id,
        name: `${r.participants?.first_name ?? ''} ${r.participants?.last_name ?? ''}`.trim(),
        company: r.participants?.company,
        text: r[textKey],
      }))
      .filter((a) => a.text && (!s || a.text.toLowerCase().includes(s) || a.name.toLowerCase().includes(s)));
  }, [rows, textKey, search]);

  function exportCsv() {
    const header = [
      'First Name', 'Last Name', 'Email', 'Company', 'Sponsor',
      ...SURVEY_QUESTIONS.map((q) => `${q.section} - ${q.label}`),
      'Submitted', 'Last Updated',
    ];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.participants?.first_name, r.participants?.last_name, r.participants?.email,
        r.participants?.company, r.participants?.sponsor,
        ...SURVEY_QUESTIONS.map((q) => (q.type === 'choice' ? labelFor(q, r[q.key]) : r[q.key])),
        fmtDate(r.created_at), fmtDate(r.updated_at),
      ].map(esc).join(',')
    );
    const blob = new Blob(['\uFEFF' + [header.map(esc).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `philsan-survey-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) return <div className="p-6 text-gray-500">Loading survey results…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Survey Results</h1>
          <p className="text-sm text-gray-500">Evaluation Form — 39th PHILSAN Annual Convention</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!total}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: GREEN }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Responses" value={total} />
        <Stat
          label="Response rate"
          value={`${approvedCount ? Math.round((total / approvedCount) * 100) : 0}%`}
          sub={`of ${approvedCount} approved`}
        />
        <Stat label="Overall: Excellent/Good" value={`${excellentGoodPct}%`} />
        <Stat label="Would recommend" value={`${recommendPct}%`} sub="Very likely + Likely" />
      </div>

      {/* Choice breakdowns */}
      <div className="grid md:grid-cols-2 gap-4">
        {breakdowns.map(({ q, counts }) => (
          <div key={q.key} className="bg-white rounded-xl shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#1F773A]">{q.section}</p>
            <p className="font-medium text-gray-800 mt-1 mb-4">{q.label}</p>
            <div className="space-y-2.5">
              {counts.map((c) => (
                <div key={c.value}>
                  <div className="flex justify-between text-sm text-gray-700">
                    <span>{c.label}</span>
                    <span className="text-gray-500">
                      {c.n} · {pct(c.n)}%
                    </span>
                  </div>
                  <div className="h-2 bg-[#EAF3DE] rounded-full mt-1 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct(c.n)}%`, backgroundColor: GREEN }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Open-ended answers */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap gap-2 mb-4">
          {TEXT_QS.map((q) => (
            <button
              key={q.key}
              onClick={() => setTextKey(q.key)}
              className={`rounded-full px-4 py-1.5 text-sm border ${
                textKey === q.key
                  ? 'bg-[#1F773A] text-white border-[#1F773A]'
                  : 'border-gray-300 text-gray-700 hover:border-[#1F773A]'
              }`}
            >
              {q.section}
            </button>
          ))}
        </div>
        <p className="font-medium text-gray-800">{TEXT_QS.find((q) => q.key === textKey)?.label}</p>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search answers or names…"
          className="mt-3 w-full sm:w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
        />
        <p className="text-xs text-gray-500 mt-2">{textAnswers.length} answers</p>
        <ul className="mt-3 divide-y divide-gray-100 max-h-[480px] overflow-y-auto">
          {textAnswers.map((a) => (
            <li key={a.id} className="py-3">
              <p className="text-sm text-gray-800 whitespace-pre-line">{a.text}</p>
              <p className="text-xs text-gray-500 mt-1">
                {a.name}
                {a.company ? ` · ${a.company}` : ''}
              </p>
            </li>
          ))}
          {!textAnswers.length && <li className="py-6 text-sm text-gray-500 text-center">No answers yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}