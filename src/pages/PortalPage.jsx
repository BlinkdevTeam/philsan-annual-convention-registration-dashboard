import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getPortalEmail, setPortalEmail, clearPortalEmail, callCertificate } from '../lib/portal';
import PortalShell, { GREEN } from '../components/PortalShell';

const NOT_FOUND_MSG =
  "We couldn't find a timed-in attendee with this email. Please use the email you registered with. " +
  'The quiz, survey and certificate open once your QR code has been scanned at the convention.';

export default function PortalPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(getPortalEmail());
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(!!getPortalEmail());
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus(addr) {
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_portal_status', { p_email: addr });
    setLoading(false);

    if (rpcError) {
      setError('Something went wrong. Please try again.');
      return;
    }
    if (!data?.found) {
      clearPortalEmail();
      setStatus(null);
      setError(NOT_FOUND_MSG);
      return;
    }
    setPortalEmail(addr);
    setStatus(data);
  }

  useEffect(() => {
    const saved = getPortalEmail();
    if (saved) loadStatus(saved);
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(clean)) {
      setError('Please enter a valid email address.');
      return;
    }
    setEmail(clean);
    loadStatus(clean);
  }

  function logout() {
    clearPortalEmail();
    setStatus(null);
    setEmail('');
    setError('');
  }

  async function getCertificate() {
    if (status.certificate_token) {
      navigate(`/certificate/${status.certificate_token}`);
      return;
    }
    setIssuing(true);
    setError('');
    try {
      const { token } = await callCertificate({ action: 'issue', email: getPortalEmail() });
      navigate(`/certificate/${token}`);
    } catch (err) {
      setError(err.message);
      setIssuing(false);
    }
  }

  // ---------- Login ----------
  if (!status) {
    return (
      <PortalShell
        title="39th PHILSAN Annual Convention"
        intro="Welcome! Log in with your registered email to take the quiz, answer the evaluation survey and get your certificate."
      >
        <form onSubmit={handleLogin} className="bg-white rounded-xl shadow-sm p-6 mt-4">
          <label htmlFor="email" className="block font-semibold text-gray-800">
            Registered email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1F773A]"
          />
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-lg py-2.5 font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: GREEN }}
          >
            {loading ? 'Checking…' : 'Log in'}
          </button>
        </form>
      </PortalShell>
    );
  }

  // ---------- Dashboard ----------
  const { quiz_done, survey_done, certificate_token, first_name } = status;
  const certReady = quiz_done && survey_done;

  return (
    <PortalShell title="39th PHILSAN Annual Convention">
      <div className="bg-white rounded-xl shadow-sm px-6 py-4 mt-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-gray-800">
            Hi <span className="font-semibold">{first_name}</span>!
          </p>
          <p className="text-xs text-gray-500">{getPortalEmail()}</p>
        </div>
        <button onClick={logout} className="text-xs underline text-gray-500">
          Log out
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <ActionCard
          step="1"
          title="Quiz"
          description={
            quiz_done
              ? 'Your answers have been recorded.'
              : 'Questions from the convention talks. You can only submit once.'
          }
          done={quiz_done}
          buttonLabel={quiz_done ? 'Quiz completed ✓' : 'Take Quiz'}
          disabled={quiz_done}
          onClick={() => navigate('/portal/quiz')}
        />

        <ActionCard
          step="2"
          title="Evaluation Survey"
          description={
            survey_done
              ? 'Thank you for your feedback. You can still edit your answers.'
              : 'Tell us about your convention experience.'
          }
          done={survey_done}
          buttonLabel={survey_done ? 'Edit Survey' : 'Take Survey'}
          secondary={survey_done}
          onClick={() => navigate('/portal/survey')}
        />

        <ActionCard
          step="3"
          title="Certificate"
          description={
            certReady
              ? 'Your Certificate of Attendance and Completion is ready.'
              : 'Unlocks after you complete the quiz and the survey.'
          }
          done={!!certificate_token}
          locked={!certReady}
          buttonLabel={
            !certReady
              ? '🔒 Download Certificate'
              : issuing
                ? 'Preparing your certificate…'
                : certificate_token
                  ? 'View Certificate'
                  : 'Download Certificate'
          }
          disabled={!certReady || issuing}
          onClick={getCertificate}
        />
      </div>

      {error && <p className="text-sm text-red-600 mt-4 px-1">{error}</p>}
    </PortalShell>
  );
}

function ActionCard({ step, title, description, done, locked, buttonLabel, disabled, secondary, onClick }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${locked ? 'opacity-80' : ''}`}>
      <div
        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${
          done ? 'text-white' : 'bg-[#EAF3DE] text-[#1F773A]'
        }`}
        style={done ? { backgroundColor: GREEN } : undefined}
      >
        {done ? '✓' : step}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-gray-800">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className={`sm:w-52 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
          disabled
            ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
            : secondary
              ? 'border border-[#1F773A] text-[#1F773A] hover:bg-[#EAF3DE]'
              : 'text-white hover:opacity-90'
        }`}
        style={!disabled && !secondary ? { backgroundColor: GREEN } : undefined}
      >
        {buttonLabel}
      </button>
    </div>
  );
}
