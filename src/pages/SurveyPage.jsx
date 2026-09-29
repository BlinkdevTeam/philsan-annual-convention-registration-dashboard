import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getPortalEmail, clearPortalEmail } from '../lib/portal';
import { SURVEY_QUESTIONS, SURVEY_TITLE, SURVEY_INTRO } from '../lib/surveyQuestions';
import PortalShell, { GREEN } from '../components/PortalShell';

const emptyAnswers = () => Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q.key, '']));

export default function SurveyPage() {
  const navigate = useNavigate();
  const email = getPortalEmail();
  const [step, setStep] = useState('loading'); // 'loading' | 'form' | 'done'
  const [answers, setAnswers] = useState(emptyAnswers);
  const [isEdit, setIsEdit] = useState(false);
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!email) {
      navigate('/portal', { replace: true });
      return;
    }
    (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_survey_participant', { p_email: email });
      if (rpcError) {
        setError('Could not load the survey. Please refresh the page.');
        return;
      }
      if (!data?.found) {
        clearPortalEmail();
        navigate('/portal', { replace: true });
        return;
      }
      if (data.response) {
        const prefill = emptyAnswers();
        SURVEY_QUESTIONS.forEach((q) => (prefill[q.key] = data.response[q.key] ?? ''));
        setAnswers(prefill);
        setIsEdit(true);
      }
      setStep('form');
    })();
  }, []);

  const setAnswer = (key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setMissing((m) => m.filter((k) => k !== key));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const miss = SURVEY_QUESTIONS.filter((q) => !String(answers[q.key]).trim()).map((q) => q.key);
    setMissing(miss);
    if (miss.length) {
      setError('Please answer all required questions.');
      document.getElementById(`q-${miss[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setError('');
    setLoading(true);
    const payload = Object.fromEntries(SURVEY_QUESTIONS.map((q) => [q.key, String(answers[q.key]).trim()]));
    const { error: rpcError } = await supabase.rpc('submit_survey', { p_email: email, p_answers: payload });
    setLoading(false);

    if (rpcError) {
      setError(
        rpcError.message?.includes('not_timed_in')
          ? 'We could not confirm your attendance. Please contact the PHILSAN secretariat.'
          : 'Could not save your answers. Please try again.'
      );
      return;
    }
    setStep('done');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <PortalShell
      title={SURVEY_TITLE}
      intro={step === 'form' && SURVEY_INTRO}
      backTo={step === 'done' ? undefined : '/portal'}
    >
      {step === 'loading' && (
        <div className="bg-white rounded-xl shadow-sm p-6 mt-4 text-sm text-gray-500">
          {error || 'Loading survey…'}
        </div>
      )}

      {step === 'form' && (
        <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
          {isEdit && (
            <div className="bg-white rounded-xl shadow-sm px-6 py-4 text-sm text-gray-700">
              Your previous answers are loaded. Edit anything and save again.
            </div>
          )}

          {SURVEY_QUESTIONS.map((q, i) => {
            const prev = SURVEY_QUESTIONS[i - 1];
            const newSection = !prev || prev.section !== q.section;
            const isMissing = missing.includes(q.key);
            return (
              <div key={q.key}>
                {newSection && (
                  <div className="px-1 pt-2 pb-1">
                    <h2 className="font-bold text-[#1F773A]">{q.section}</h2>
                    {q.sectionNote && <p className="text-sm text-gray-600">{q.sectionNote}</p>}
                  </div>
                )}
                <div
                  id={`q-${q.key}`}
                  className={`bg-white rounded-xl shadow-sm p-5 border ${
                    isMissing ? 'border-red-400' : 'border-transparent'
                  }`}
                >
                  <p className="font-medium text-gray-800">
                    {q.label} <span className="text-red-500">*</span>
                  </p>

                  {q.type === 'choice' ? (
                    <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                      {q.options.map((opt) => {
                        const selected = answers[q.key] === opt.value;
                        return (
                          <label
                            key={opt.value}
                            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm text-center transition ${
                              selected
                                ? 'border-[#1F773A] bg-[#1F773A] text-white'
                                : 'border-gray-300 text-gray-700 hover:border-[#1F773A]'
                            }`}
                          >
                            <input
                              type="radio"
                              name={q.key}
                              value={opt.value}
                              checked={selected}
                              onChange={() => setAnswer(q.key, opt.value)}
                              className="sr-only"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <textarea
                      rows={4}
                      value={answers[q.key]}
                      onChange={(e) => setAnswer(q.key, e.target.value)}
                      placeholder="Your answer"
                      className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
                    />
                  )}

                  {isMissing && <p className="text-xs text-red-600 mt-2">This is a required question.</p>}
                </div>
              </div>
            );
          })}

          {error && <p className="text-sm text-red-600 px-1">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: GREEN }}
          >
            {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Submit'}
          </button>
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
          <h2 className="text-xl font-bold text-gray-800 mt-4">Thank you for your feedback!</h2>
          <p className="text-gray-600 text-sm mt-2">Your answers have been saved. You can edit them anytime.</p>
          <button
            onClick={() => navigate('/portal')}
            className="mt-6 rounded-lg px-6 py-2.5 font-semibold text-white"
            style={{ backgroundColor: GREEN }}
          >
            Back to portal
          </button>
        </div>
      )}
    </PortalShell>
  );
}
