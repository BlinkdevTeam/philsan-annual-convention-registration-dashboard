import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchReportRaw, aggregateReport, EVENT } from '../reports/reportData';

const NOTES_ID = 'prc';
const DEFAULT_SECTIONS = [
  'Registration Area',
  'Participant Check-In',
  'Walk-in Registration',
  'ID Distribution',
  'Souvenir Distribution',
].map((title) => ({ title, text: '' }));

const toEditable = (sections) => sections.map((s) => ({ title: s.title || '', text: (s.points || []).join('\n') }));
const toStored = (sections) =>
  sections
    .map((s) => ({
      title: s.title.trim(),
      points: s.text
        .split('\n')
        .map((l) => l.replace(/^[-•*]\s*/, '').trim())
        .filter(Boolean),
    }))
    .filter((s) => s.title || s.points.length);

async function loadAssets() {
  const get = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Missing file: ${url}`);
    return res.arrayBuffer();
  };
  const [cover, regular, medium, semibold, bold] = await Promise.all([
    get('/reports/prc-cover.pdf'),
    get('/fonts/Montserrat-Regular.ttf'),
    get('/fonts/Montserrat-Medium.ttf'),
    get('/fonts/Montserrat-SemiBold.ttf'),
    get('/fonts/Montserrat-Bold.ttf'),
  ]);
  return { cover, fonts: { regular, medium, semibold, bold } };
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [intro, setIntro] = useState('');
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [includeFeedback, setIncludeFeedback] = useState(true);
  const [saveState, setSaveState] = useState(''); // '' | 'saving' | 'saved' | error text
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [raw, notes] = await Promise.all([
          fetchReportRaw(supabase),
          supabase.from('report_notes').select('*').eq('id', NOTES_ID).maybeSingle(),
        ]);
        setSummary(aggregateReport(raw));
        if (notes.data) {
          setIntro(notes.data.intro || '');
          if (notes.data.sections?.length) setSections(toEditable(notes.data.sections));
        }
      } catch (err) {
        setLoadError(err.message);
      }
    })();
  }, []);

  const suggestedIntro = summary
    ? `The ${EVENT.name} was held at [venue] on ${EVENT.dateLabel}, with a total of ${summary.attendance.attendees.toLocaleString(
        'en-US'
      )} participants in attendance.`
    : '';

  async function saveNotes() {
    setSaveState('saving');
    const { error } = await supabase
      .from('report_notes')
      .upsert({ id: NOTES_ID, intro: intro.trim(), sections: toStored(sections), updated_at: new Date().toISOString() });
    setSaveState(error ? `Could not save: ${error.message}` : 'saved');
    if (!error) setTimeout(() => setSaveState(''), 2500);
    return !error;
  }

  async function generate() {
    setGenerating(true);
    setGenError('');
    try {
      await saveNotes();
      const [{ buildPrcReportPdf }, assets, raw] = await Promise.all([
        import('../reports/prcReportPdf'),
        loadAssets(),
        fetchReportRaw(supabase), // always use the latest data
      ]);
      const report = aggregateReport(raw);
      setSummary(report);
      const bytes = await buildPrcReportPdf(report, assets, {
        includeFeedback,
        notes: { intro: intro.trim(), sections: toStored(sections) },
      });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `PHILSAN-39th-PRC-Registration-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (err) {
      console.error(err);
      setGenError(err.message || 'Could not generate the report.');
    } finally {
      setGenerating(false);
    }
  }

  const updateSection = (i, patch) => setSections((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const removeSection = (i) => setSections((list) => list.filter((_, j) => j !== i));
  const moveSection = (i, dir) =>
    setSections((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const n = (v) => (v ?? 0).toLocaleString('en-US');

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
        <p className="text-sm text-gray-500">Reports for the Professional Regulation Commission (PRC)</p>
      </div>

      {/* PDF report */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-800">Registration Overview (PDF)</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Cover page, attendance, registration and time-in trends, attendee profile, evaluation survey, quiz
              results, completion funnel and your summary notes. Built from live data each time you generate it.
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeFeedback}
                onChange={(e) => setIncludeFeedback(e.target.checked)}
                className="accent-[#1F773A]"
              />
              Include a page of written feedback from the survey
            </label>
          </div>
          <button
            onClick={generate}
            disabled={generating || !summary}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white bg-[#1F773A] hover:opacity-90 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate PDF'}
          </button>
        </div>
        {genError && <p className="text-sm text-red-600 mt-3">{genError}</p>}

        {loadError && <p className="text-sm text-red-600 mt-4">Could not load data: {loadError}</p>}
        {!summary && !loadError && <p className="text-sm text-gray-500 mt-4">Loading current numbers…</p>}
        {summary && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              ['Registered', summary.attendance.registered],
              ['Attended', summary.attendance.attendees],
              ['Onsite registrations', summary.attendance.onsite],
              ['Survey responses', summary.survey.responses],
              ['Quiz takers', summary.quiz.attempts],
              ['Certificates', summary.funnel[4].value],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-[#EAF3DE] px-3 py-2.5">
                <p className="text-xs text-gray-600">{label}</p>
                <p className="text-lg font-bold text-[#1F773A]">{n(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <CpdFormsCard />

      {/* Summary notes */}
      <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-800">Summary Report notes</h2>
            <p className="text-sm text-gray-500">The last page of the PDF. Leave everything empty to skip it.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveState && (
              <span className={`text-sm ${saveState === 'saved' || saveState === 'saving' ? 'text-gray-500' : 'text-red-600'}`}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved ✓' : saveState}
              </span>
            )}
            <button
              onClick={saveNotes}
              className="rounded-lg border border-[#1F773A] px-4 py-2 text-sm font-semibold text-[#1F773A] hover:bg-[#EAF3DE]"
            >
              Save notes
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Opening statement</label>
            {suggestedIntro && (
              <button onClick={() => setIntro(suggestedIntro)} className="text-xs text-[#1F773A] underline">
                Use suggested text
              </button>
            )}
          </div>
          <textarea
            rows={2}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder={suggestedIntro}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
          />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {sections.map((s, i) => (
            <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 bg-[#EEF2F6] px-3 py-2">
                <input
                  value={s.title}
                  onChange={(e) => updateSection(i, { title: e.target.value })}
                  placeholder="Section title"
                  className="flex-1 bg-transparent text-sm font-semibold text-gray-800 focus:outline-none"
                />
                <button onClick={() => moveSection(i, -1)} className="text-gray-400 hover:text-gray-700 px-1" title="Move up">
                  ↑
                </button>
                <button onClick={() => moveSection(i, 1)} className="text-gray-400 hover:text-gray-700 px-1" title="Move down">
                  ↓
                </button>
                <button onClick={() => removeSection(i)} className="text-gray-400 hover:text-red-600 px-1" title="Remove">
                  ✕
                </button>
              </div>
              <textarea
                rows={5}
                value={s.text}
                onChange={(e) => updateSection(i, { text: e.target.value })}
                placeholder="One observation per line"
                className="w-full px-3 py-2 text-sm focus:outline-none resize-y"
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => setSections((list) => [...list, { title: '', text: '' }])}
          className="text-sm font-medium text-[#1F773A] hover:underline"
        >
          + Add section
        </button>
      </div>
    </div>
  );
}

// ---------------- PRC CPD forms (.docx) ----------------
const CPD_FIELDS = [
  ['program_title', 'Title of the Program', 'text', true],
  ['date', 'Date', 'text'],
  ['venue', 'Venue', 'text'],
  ['time', 'Time', 'text', false, 'e.g. 7:30 AM – 5:30 PM'],
  ['room', 'Room', 'text'],
  ['topics', 'Topic/s (one per line, Attendance Sheet only)', 'textarea', true],
  ['monitor_name', 'Certified correct by (CPD Program Monitor)', 'text'],
  ['representative_name', "Concurred by (CPD Provider's Authorized Representative)", 'text'],
  ['signed_date', 'Date and Time (signature block)', 'text', false, 'Leave blank to write by hand'],
];

function CpdFormsCard() {
  const [mod, setMod] = useState(null);
  const [people, setPeople] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [showWarnings, setShowWarnings] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const m = await import('../reports/cpdForms');
        setMod(m);
        const [ppl, saved] = await Promise.all([
          m.fetchCpdPeople(supabase),
          supabase.from('report_notes').select('settings').eq('id', 'cpd').maybeSingle(),
        ]);
        setPeople(ppl);
        setSettings({ ...m.CPD_DEFAULTS, ...(saved.data?.settings || {}) });
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
        .upsert({ id: 'cpd', settings, updated_at: new Date().toISOString() });
      const fresh = await mod.fetchCpdPeople(supabase); // latest data
      setPeople(fresh);
      const file = kind === 'A' ? 'cpdd-12-a-template.docx' : 'cpdd-12-b-template.docx';
      const res = await fetch(`/reports/${file}`);
      if (!res.ok) throw new Error(`Missing file: /reports/${file}`);
      const template = await res.arrayBuffer();
      const bytes =
        kind === 'A'
          ? mod.buildRegistrationSheet(template, fresh.registered, settings)
          : mod.buildAttendanceSheet(template, fresh.attended, settings);
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = kind === 'A' ? 'CPDD-12-A Registration Sheet.docx' : 'CPDD-12-B Attendance Sheet.docx';
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

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-gray-800">PRC CPD forms (Word)</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Official CPDD-12-A Registration Sheet and CPDD-12-B Attendance Sheet, filled with participants who gave a
            PRC license number, sorted by last name. Signature and expiry date columns are left blank.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => download('A')}
            disabled={!people || !!busy}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-[#1F773A] hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'A' ? 'Creating…' : 'CPDD-12-A Registration Sheet'}
          </button>
          <button
            onClick={() => download('B')}
            disabled={!people || !!busy}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white bg-[#1F773A] hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'B' ? 'Creating…' : 'CPDD-12-B Attendance Sheet'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!people && !error && <p className="text-sm text-gray-500">Loading participants…</p>}

      {people && (
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-lg bg-[#EAF3DE] px-3 py-2.5">
            <p className="text-xs text-gray-600">Registration Sheet (approved, with license)</p>
            <p className="text-lg font-bold text-[#1F773A]">{people.registered.length.toLocaleString('en-US')}</p>
          </div>
          <div className="rounded-lg bg-[#EAF3DE] px-3 py-2.5">
            <p className="text-xs text-gray-600">Attendance Sheet (checked in, with license)</p>
            <p className="text-lg font-bold text-[#1F773A]">{people.attended.length.toLocaleString('en-US')}</p>
          </div>
          <button
            onClick={() => setShowWarnings((v) => !v)}
            disabled={!people.warnings.length}
            className={`rounded-lg px-3 py-2.5 text-left ${
              people.warnings.length ? 'bg-amber-50 hover:bg-amber-100' : 'bg-gray-50'
            }`}
          >
            <p className="text-xs text-gray-600">License numbers to double-check</p>
            <p className={`text-lg font-bold ${people.warnings.length ? 'text-amber-700' : 'text-gray-500'}`}>
              {people.warnings.length} {people.warnings.length > 0 && <span className="text-xs font-normal">{showWarnings ? '▲ hide' : '▼ show'}</span>}
            </p>
          </button>
        </div>
      )}

      {showWarnings && people?.warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-200 divide-y divide-amber-100 text-sm">
          {people.warnings.map((w, i) => (
            <li key={i} className="px-3 py-2 flex flex-wrap justify-between gap-2">
              <span className="text-gray-800">{w.name}</span>
              <span className="text-gray-500">
                {w.license} · {w.reason}
              </span>
            </li>
          ))}
        </ul>
      )}

      {settings && (
        <div className="grid md:grid-cols-2 gap-3">
          {CPD_FIELDS.map(([key, label, type, wide, placeholder]) => (
            <label key={key} className={wide ? 'md:col-span-2' : ''}>
              <span className="text-sm font-medium text-gray-700">{label}</span>
              {type === 'textarea' ? (
                <textarea
                  rows={4}
                  value={settings[key]}
                  onChange={(e) => set(key, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
                />
              ) : (
                <input
                  value={settings[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={placeholder}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
                />
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
