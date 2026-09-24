import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const GREEN = '#1F773A';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const fmtDate = (d) =>
  new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

export default function QuizResults() {
  const [questions, setQuestions] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [approvedCount, setApprovedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('participants'); // 'participants' | 'questions'
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('score_desc');
  const [expanded, setExpanded] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    const [qs, at, ap] = await Promise.all([
      supabase.from('quiz_questions').select('*').order('sort_order'),
      supabase
        .from('quiz_attempts')
        .select('*, participants(first_name, last_name, email, company, sponsor)')
        .order('submitted_at', { ascending: false }),
      supabase.from('participants').select('id', { count: 'exact', head: true }).eq('reg_status', 'approved'),
    ]);
    if (qs.error || at.error) setError((qs.error || at.error).message);
    setQuestions(qs.data || []);
    setAttempts(at.data || []);
    setApprovedCount(ap.count || 0);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function resetAttempt(a) {
    const name = `${a.participants?.first_name ?? ''} ${a.participants?.last_name ?? ''}`.trim();
    if (!window.confirm(`Reset ${name}'s quiz attempt? Their answers will be deleted and they can retake the quiz.`))
      return;
    const { error: delError } = await supabase.from('quiz_attempts').delete().eq('id', a.id);
    if (delError) {
      window.alert(`Could not reset: ${delError.message}`);
      return;
    }
    setAttempts((list) => list.filter((x) => x.id !== a.id));
  }

  const total = attempts.length;
  const pctOf = (score, max) => (max ? Math.round((score / max) * 100) : 0);
  const avgPct = total ? Math.round(attempts.reduce((s, a) => s + pctOf(a.score, a.total), 0) / total) : 0;
  const best = attempts.reduce((m, a) => Math.max(m, pctOf(a.score, a.total)), 0);

  const participantRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rows = attempts
      .map((a) => ({
        ...a,
        name: `${a.participants?.first_name ?? ''} ${a.participants?.last_name ?? ''}`.trim(),
        pct: pctOf(a.score, a.total),
      }))
      .filter(
        (r) =>
          !s ||
          r.name.toLowerCase().includes(s) ||
          (r.participants?.email ?? '').toLowerCase().includes(s) ||
          (r.participants?.company ?? '').toLowerCase().includes(s)
      );
    const sorters = {
      score_desc: (a, b) => b.pct - a.pct || new Date(a.submitted_at) - new Date(b.submitted_at),
      score_asc: (a, b) => a.pct - b.pct,
      recent: (a, b) => new Date(b.submitted_at) - new Date(a.submitted_at),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return rows.sort(sorters[sort]);
  }, [attempts, search, sort]);

  const questionStats = useMemo(
    () =>
      questions.map((q) => {
        const picks = q.options.map((_, i) => attempts.filter((a) => a.answers?.[q.id] === LETTERS[i]).length);
        const answered = picks.reduce((s, n) => s + n, 0);
        const correct = attempts.filter((a) => a.answers?.[q.id] === q.correct_option).length;
        return { q, picks, answered, correct, pct: pctOf(correct, answered) };
      }),
    [questions, attempts]
  );

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = [
      'First Name', 'Last Name', 'Email', 'Company', 'Sponsor', 'Score', 'Total', 'Percent', 'Submitted',
      ...questions.map((q, i) => `Q${i + 1} (${q.speaker}) — correct: ${q.correct_option}`),
    ];
    const lines = attempts.map((a) =>
      [
        a.participants?.first_name, a.participants?.last_name, a.participants?.email,
        a.participants?.company, a.participants?.sponsor,
        a.score, a.total, `${pctOf(a.score, a.total)}%`, fmtDate(a.submitted_at),
        ...questions.map((q) => a.answers?.[q.id] ?? ''),
      ]
        .map(esc)
        .join(',')
    );
    const blob = new Blob(['\uFEFF' + [header.map(esc).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `philsan-quiz-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (loading) return <div className="p-6 text-gray-500">Loading quiz results…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Quiz Results</h1>
          <p className="text-sm text-gray-500">
            39th PHILSAN Annual Convention · {questions.length} questions
          </p>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Submitted" value={total} />
        <Stat
          label="Participation"
          value={`${pctOf(total, approvedCount)}%`}
          sub={`of ${approvedCount} approved`}
        />
        <Stat label="Average score" value={`${avgPct}%`} />
        <Stat label="Highest score" value={`${best}%`} />
      </div>

      <div className="flex gap-2">
        {[
          ['participants', 'Participants'],
          ['questions', 'Questions'],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-1.5 text-sm border ${
              tab === key ? 'bg-[#1F773A] text-white border-[#1F773A]' : 'border-gray-300 text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'participants' && (
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex flex-wrap gap-3 mb-4">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, company…"
              className="flex-1 min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="score_desc">Highest score</option>
              <option value="score_asc">Lowest score</option>
              <option value="recent">Most recent</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Company</th>
                  <th className="py-2 pr-3">Score</th>
                  <th className="py-2 pr-3">Submitted</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {participantRows.map((r, i) => (
                  <FragmentRow
                    key={r.id}
                    r={r}
                    rank={i + 1}
                    questions={questions}
                    open={expanded === r.id}
                    onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                    onReset={() => resetAttempt(r)}
                  />
                ))}
                {!participantRows.length && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No quiz submissions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'questions' && (
        <div className="space-y-3">
          {questionStats.map(({ q, picks, answered, pct }, i) => {
            const prev = questionStats[i - 1]?.q;
            return (
              <div key={q.id}>
                {(!prev || prev.session !== q.session) && (
                  <h2 className="font-bold text-[#1F773A] uppercase tracking-wide pt-3 pb-1">{q.session}</h2>
                )}
                <div className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold text-gray-500">
                        Q{i + 1} · {q.speaker}
                      </p>
                      <p className="font-medium text-gray-800 mt-1">{q.question}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xl font-bold ${pct < 50 ? 'text-red-600' : 'text-gray-800'}`}>{pct}%</p>
                      <p className="text-xs text-gray-500">correct</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {q.options.map((text, idx) => {
                      const letter = LETTERS[idx];
                      const isCorrect = letter === q.correct_option;
                      const share = pctOf(picks[idx], answered);
                      return (
                        <div key={letter}>
                          <div className="flex justify-between gap-3 text-sm">
                            <span className={isCorrect ? 'font-semibold text-[#1F773A]' : 'text-gray-700'}>
                              {letter}. {text} {isCorrect && '✓'}
                            </span>
                            <span className="text-gray-500 shrink-0">
                              {picks[idx]} · {share}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${share}%`, backgroundColor: isCorrect ? GREEN : '#9CA3AF' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FragmentRow({ r, rank, questions, open, onToggle, onReset }) {
  return (
    <>
      <tr className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={onToggle}>
        <td className="py-2.5 pr-3 text-gray-400">{rank}</td>
        <td className="py-2.5 pr-3">
          <p className="font-medium text-gray-800">{r.name}</p>
          <p className="text-xs text-gray-500">{r.participants?.email}</p>
        </td>
        <td className="py-2.5 pr-3 text-gray-700">{r.participants?.company}</td>
        <td className="py-2.5 pr-3">
          <span className="font-semibold text-gray-800">
            {r.score}/{r.total}
          </span>{' '}
          <span className="text-gray-500">({r.pct}%)</span>
        </td>
        <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{fmtDate(r.submitted_at)}</td>
        <td className="py-2.5 text-right">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            className="text-xs text-red-600 hover:underline"
          >
            Reset
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={6} className="px-3 py-3">
            <div className="flex flex-wrap gap-1.5">
              {questions.map((q, i) => {
                const ans = r.answers?.[q.id];
                const ok = ans === q.correct_option;
                return (
                  <span
                    key={q.id}
                    title={`${q.speaker}: ${q.question}`}
                    className={`text-xs rounded px-2 py-1 ${ok ? 'bg-[#EAF3DE] text-[#1F773A]' : 'bg-red-50 text-red-700'}`}
                  >
                    Q{i + 1}: {ans ?? '–'}
                    {!ok && ` (${q.correct_option})`}
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
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