import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { getPortalEmail, setPortalEmail, clearPortalEmail, callCertificate } from '../lib/portal';
import PortalShell, { GREEN } from '../components/PortalShell';
import LicenseForm from '../components/LicenseForm';
import { PRESENTATIONS } from '../lib/presentations';

// Souvenir program PDF, served from the dashboard's public/ folder
const SOUVENIR_URL = '/souvenir-program.pdf';
const SOUVENIR_FILENAME = 'PHILSAN-39th-Annual-Convention-Souvenir-Program.pdf';

function downloadSouvenir() {
  const a = document.createElement('a');
  a.href = SOUVENIR_URL;
  a.download = SOUVENIR_FILENAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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
  const [license, setLicense] = useState(null); // result of portal_get_license
  const [editingLicense, setEditingLicense] = useState(false);
  const [showPresentations, setShowPresentations] = useState(false);

  // PRC license step: must be done before Quiz / Survey / Certificate
  async function loadLicense(addr) {
    const { data, error: rpcError } = await supabase.rpc('portal_get_license', { p_email: addr });
    // If the check itself fails, don't lock people out of the portal
    setLicense(rpcError || !data?.found ? { done: true, unavailable: true } : data);
  }

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
    await loadLicense(addr);
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
    setLicense(null);
    setEditingLicense(false);
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
  // Certificate needs the survey; CPD units also need the quiz
  const certReady = survey_done;
  const showLicenseForm = !license?.done || editingLicense;

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

      {showLicenseForm ? (
        <LicenseForm
          email={getPortalEmail()}
          registered={license?.registered}
          initial={license?.answers}
          onCancel={editingLicense ? () => setEditingLicense(false) : undefined}
          onSaved={async () => {
            await loadLicense(getPortalEmail());
            setEditingLicense(false);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      ) : (
      <>
      {!license.unavailable && (
        <div className="bg-white rounded-xl shadow-sm px-5 py-3 mt-4 flex items-center justify-between gap-2">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-[#1F773A]">✓ PRC License Information</span>{' '}
            {license.answers?.has_prc_license === 'Yes' ? 'saved' : '— no PRC license'}
          </p>
          <button onClick={() => setEditingLicense(true)} className="text-xs underline text-gray-500">
            Review / edit
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        <ActionCard
          step="1"
          title="Quiz"
          description={
            quiz_done
              ? 'Your answers have been recorded.'
              : 'Questions from the convention talks. Required for a certificate with CPD units. You can only submit once.'
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
            !certReady
              ? quiz_done
                ? 'Unlocks after you complete the survey. It will include your CPD units.'
                : 'Unlocks after you complete the survey. Take the quiz too for a certificate with CPD units.'
              : quiz_done
                ? 'Your Certificate of Attendance and Completion, with CPD units, is ready.'
                : 'Your Certificate of Attendance is ready. For a certificate with CPD units, take the quiz first.'
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

        <ActionCard
          step="4"
          title="Souvenir Program"
          description="The 39th PHILSAN Annual Convention souvenir program (PDF, about 27 MB)."
          buttonLabel="Download Program"
          secondary
          onClick={downloadSouvenir}
        />

        <ActionCard
          step="5"
          title="Speaker Presentations"
          description="Download the slides from the plenary and learning session talks."
          buttonLabel={showPresentations ? 'Hide list' : 'View presentations'}
          secondary
          onClick={() => setShowPresentations((v) => !v)}
        />
        {showPresentations && <PresentationList />}
      </div>
      </>
      )}

      {error && <p className="text-sm text-red-600 mt-4 px-1">{error}</p>}
    </PortalShell>
  );
}

function PresentationList() {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      {PRESENTATIONS.map((g) => (
        <div key={g.group} className="mb-5 last:mb-0">
          <h3 className="text-sm font-bold text-[#1F773A] uppercase tracking-wide mb-2">{g.group}</h3>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {g.items.map((p) => (
              <li key={p.file} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{p.speaker}</p>
                  <p className="text-xs text-gray-500">
                    {p.org ? `${p.org} · ` : ''}PDF, {p.sizeMb} MB
                  </p>
                </div>
                <a
                  href={p.file}
                  download={`PHILSAN-39th-${p.speaker.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`}
                  className="shrink-0 rounded-lg border border-[#1F773A] px-4 py-2 text-sm font-semibold text-[#1F773A] hover:bg-[#EAF3DE]"
                >
                  Download
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
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