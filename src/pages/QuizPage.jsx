import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getPortalEmail, clearPortalEmail } from '../lib/portal';
import PortalShell, { GREEN } from '../components/PortalShell';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// Everyone answers the Plenary questions, then picks the ONE learning session they attended
// and answers only that session's questions.
const PLENARY = 'Plenary';
const SESSION_KEY = '__session'; // stored in the draft only, never sent as an answer

// Progress is kept in this browser until submit, so a refresh doesn't wipe answers.
const draftKey = (email) => `philsan_quiz_draft_${email}`;
const loadDraft = (email) => {
  try {
    return JSON.parse(localStorage.getItem(draftKey(email)) || '{}');
  } catch {
    return {};
  }
};
const saveDraft = (email, answers) => {
  try {
    localStorage.setItem(draftKey(email), JSON.stringify(answers));
  } catch {
    /* storage unavailable — ignore */
  }
};
const clearDraft = (email) => {
  try {
    localStorage.removeItem(draftKey(email));
  } catch {
    /* ignore */
  }
};

export default function QuizPage() {
  const navigate = useNavigate();
  const email = getPortalEmail();
  const [step, setStep] = useState('loading'); // 'loading' | 'form' | 'done'
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [missing, setMissing] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chosenSession, setChosenSession] = useState('');

  useEffect(() => {
    if (!email) {
      navigate('/portal', { replace: true });
      return;
    }
    (async () => {
      // PRC license step comes first; send them back to the portal if not done
      const { data: lic } = await supabase.rpc('portal_get_license', { p_email: email });
      if (lic?.found && !lic.done) {
        navigate('/portal', { replace: true });
        return;
      }
      const { data, error: rpcError } = await supabase.rpc('get_quiz', { p_email: email });
      if (rpcError) {
        setError('Could not load the quiz. Please refresh the page.');
        return;
      }
      if (!data?.found) {
        clearPortalEmail();
        navigate('/portal', { replace: true });
        return;
      }
      if (data.already_taken) {
        clearDraft(email);
        navigate('/portal', { replace: true });
        return;
      }
      const qs = data.questions || [];
      const draft = loadDraft(email);
      setQuestions(qs);
      setAnswers(Object.fromEntries(qs.filter((q) => draft[q.id]).map((q) => [q.id, draft[q.id]])));
      if (draft[SESSION_KEY] && qs.some((q) => q.session === draft[SESSION_KEY])) setChosenSession(draft[SESSION_KEY]);
      setStep('form');
    })();
  }, []);

  useEffect(() => {
    if (step === 'form') saveDraft(email, { ...answers, [SESSION_KEY]: chosenSession });
  }, [answers, chosenSession, step, email]);

  // Plenary first, then the learning sessions in their original order
  const plenaryQs = questions.filter((q) => q.session === PLENARY);
  const sessionNames = [...new Set(questions.filter((q) => q.session !== PLENARY).map((q) => q.session))];
  const sessionQs = questions.filter((q) => q.session === chosenSession);
  const visible = [...plenaryQs, ...sessionQs];
  const totalToAnswer = plenaryQs.length + (chosenSession ? sessionQs.length : questions.filter((q) => q.session === sessionNames[0]).length);
  const answeredCount = visible.filter((q) => answers[q.id]).length;

  function chooseSession(name) {
    setChosenSession(name);
    setMissing((m) => m.filter((id) => id !== SESSION_KEY));
    setError('');
    // Drop answers from a session they switched away from
    setAnswers((a) =>
      Object.fromEntries(
        Object.entries(a).filter(([id]) => {
          const q = questions.find((x) => String(x.id) === String(id));
          return q && (q.session === PLENARY || q.session === name);
        })
      )
    );
  }

  function pick(qid, letter) {
    setAnswers((a) => ({ ...a, [qid]: letter }));
    setMissing((m) => m.filter((id) => id !== qid));
  }

  function handleReview(e) {
    e.preventDefault();
    const miss = [
      ...plenaryQs.filter((q) => !answers[q.id]).map((q) => q.id),
      ...(chosenSession ? sessionQs.filter((q) => !answers[q.id]).map((q) => q.id) : [SESSION_KEY]),
    ];
    setMissing(miss);
    if (miss.length) {
      const qLeft = miss.filter((m) => m !== SESSION_KEY).length;
      setError(qLeft ? `Please answer all questions (${qLeft} left).` : 'Please choose the learning session you attended.');
      document.getElementById(`q-${miss[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError('');
    setConfirming(true);
  }

  async function handleSubmit() {
    setLoading(true);
    // Only the Plenary answers + the chosen session's answers are sent
    const payload = Object.fromEntries(visible.map((q) => [q.id, answers[q.id]]));
    const { error: rpcError } = await supabase.rpc('submit_quiz', { p_email: email, p_answers: payload });
    setLoading(false);
    setConfirming(false);

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('already_taken')) {
        clearDraft(email);
        navigate('/portal', { replace: true });
      } else if (msg.includes('incomplete')) {
        setError('Some answers are missing. Please review the quiz and try again.');
      } else if (msg.includes('not_timed_in')) {
        setError('We could not confirm your attendance. Please contact the PHILSAN secretariat.');
      } else {
        setError('Could not submit your answers. Please check your connection and try again.');
      }
      return;
    }

    clearDraft(email);
    setStep('done');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderQuestion(q, i, prev, number) {
    const newSession = !prev || prev.session !== q.session;
    const newSpeaker = newSession || prev.speaker !== q.speaker;
    const isMissing = missing.includes(q.id);
    return (
      <div key={q.id}>
        {newSession && (
          <h2 className="px-1 pt-4 text-lg font-bold text-[#1F773A] uppercase tracking-wide">{q.session}</h2>
        )}
        {newSpeaker && <p className="px-1 pt-1 pb-2 text-sm font-semibold text-gray-600">{q.speaker}</p>}
        <div
          id={`q-${q.id}`}
          className={`bg-white rounded-xl shadow-sm p-5 border ${isMissing ? 'border-red-400' : 'border-transparent'}`}
        >
          <p className="font-medium text-gray-800">
            <span className="text-gray-400 mr-1">{number}.</span>
            {q.question}
          </p>
          <div className="mt-3 space-y-2">
            {q.options.map((text, idx) => {
              const letter = LETTERS[idx];
              const selected = answers[q.id] === letter;
              return (
                <label
                  key={letter}
                  className={`flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition ${
                    selected ? 'border-[#1F773A] bg-[#EAF3DE]' : 'border-gray-200 hover:border-[#1F773A]'
                  }`}
                >
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={selected}
                    onChange={() => pick(q.id, letter)}
                    className="sr-only"
                  />
                  <span
                    className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      selected ? 'text-white' : 'text-gray-600 bg-gray-100'
                    }`}
                    style={selected ? { backgroundColor: GREEN } : undefined}
                  >
                    {letter}
                  </span>
                  <span className="text-gray-700 pt-0.5">{text}</span>
                </label>
              );
            })}
          </div>
          {isMissing && <p className="text-xs text-red-600 mt-2">Please answer this question.</p>}
        </div>
      </div>
    );
  }

  return (
    <PortalShell
      title="39th PHILSAN Annual Convention Quiz"
      backTo={step === 'done' ? undefined : '/portal'}
      intro={
        step === 'form' && (
          <>
            Answer all the Plenary questions, then choose the learning session you attended and answer its
            questions. You can only submit the quiz{' '}
            <span className="font-semibold">once</span>, so review your answers before submitting. Your progress is
            saved on this device until you submit.
          </>
        )
      }
    >
      {step === 'loading' && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-4 text-sm text-gray-500">
          {error || 'Loading quiz…'}
        </div>
      )}

      {step === 'form' && (
        <form onSubmit={handleReview} noValidate className="mt-4 space-y-4 pb-24">
          {/* 1) Plenary — everyone */}
          {plenaryQs.map((q, i) => renderQuestion(q, i, plenaryQs[i - 1], i + 1))}

          {/* 2) Which learning session did you attend? */}
          {sessionNames.length > 0 && (
            <div id={`q-${SESSION_KEY}`}>
              <h2 className="px-1 pt-6 text-lg font-bold text-[#1F773A] uppercase tracking-wide">Learning Session</h2>
              <div
                className={`bg-white rounded-xl shadow-sm p-5 border ${
                  missing.includes(SESSION_KEY) ? 'border-red-400' : 'border-transparent'
                }`}
              >
                <p className="font-medium text-gray-800">Which learning session did you attend?</p>
                <p className="text-xs text-gray-500 mt-1">Answer the questions for the session you attended only.</p>
                <div className="mt-3 space-y-2">
                  {sessionNames.map((name) => {
                    const selected = chosenSession === name;
                    return (
                      <label
                        key={name}
                        className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition ${
                          selected ? 'border-[#1F773A] bg-[#EAF3DE]' : 'border-gray-200 hover:border-[#1F773A]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="learning-session"
                          checked={selected}
                          onChange={() => chooseSession(name)}
                          className="sr-only"
                        />
                        <span
                          className={`shrink-0 w-4 h-4 rounded-full border-2 ${selected ? 'border-[#1F773A]' : 'border-gray-300'}`}
                          style={selected ? { backgroundColor: GREEN } : undefined}
                        />
                        <span className="text-gray-700 font-medium">{name}</span>
                      </label>
                    );
                  })}
                </div>
                {missing.includes(SESSION_KEY) && (
                  <p className="text-xs text-red-600 mt-2">Please choose the learning session you attended.</p>
                )}
              </div>
            </div>
          )}

          {/* 3) Only the chosen session's questions */}
          {sessionQs.map((q, i) => renderQuestion(q, i, sessionQs[i - 1], plenaryQs.length + i + 1))}

          {/* Sticky progress + submit */}
          <div className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-xs text-gray-600">
                  {answeredCount} of {totalToAnswer} answered
                </p>
                <div className="h-2 bg-[#EAF3DE] rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${totalToAnswer ? (answeredCount / totalToAnswer) * 100 : 0}%`,
                      backgroundColor: GREEN,
                    }}
                  />
                </div>
                {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
              </div>
              <button
                type="submit"
                className="rounded-lg px-5 py-2.5 font-semibold text-white"
                style={{ backgroundColor: GREEN }}
              >
                Submit
              </button>
            </div>
          </div>
        </form>
      )}

      {step === 'done' && (
        <div className="bg-white rounded-xl shadow-sm p-8 mt-4 text-center">
          <div
            className="w-14 h-14 rounded-full mx-auto flex items-center justify-center text-white text-2xl"
            style={{ backgroundColor: GREEN }}
          >
            ✓
          </div>
          <h2 className="text-xl font-bold text-gray-800 mt-4">Quiz completed!</h2>
          <p className="text-gray-600 text-sm mt-2">Your answers have been recorded. Thank you!</p>
          <button
            onClick={() => navigate('/portal')}
            className="mt-6 rounded-lg px-6 py-2.5 font-semibold text-white"
            style={{ backgroundColor: GREEN }}
          >
            Back to portal
          </button>
        </div>
      )}

      {confirming && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-800">Submit your quiz?</h3>
            <p className="text-sm text-gray-600 mt-2">
              You can only submit once. After submitting, you won't be able to change your answers.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setConfirming(false)}
                disabled={loading}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium"
              >
                Review answers
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: GREEN }}
              >
                {loading ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalShell>
  );
}