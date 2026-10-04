import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import {
    BASE,
    SYMPOSIUM_NAME,
    getSymposiumEmail,
    setSymposiumEmail,
    clearSymposiumEmail,
    callSymposiumCertificate,
} from '../../symposium/symposiumPortal';
import { SURVEY_QUESTIONS } from '../../symposium/surveyQuestions';
import SymposiumLicenseForm from '../../symposium/SymposiumLicenseForm';
import PortalShell, { GREEN } from '../../components/PortalShell';

const NOT_FOUND_MSG =
    "We couldn't find a symposium registration with this email. Please use the email you registered with.";

export default function SymposiumPortal() {
    const navigate = useNavigate();
    const [email, setEmail] = useState(getSymposiumEmail());
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(!!getSymposiumEmail());
    const [issuing, setIssuing] = useState(false);
    const [error, setError] = useState('');
    const [license, setLicense] = useState(null); // result of symposium_get_license
    const [editingLicense, setEditingLicense] = useState(false);

    // PRC license step: must be done before Quiz / Survey / Certificate
    async function loadLicense(addr) {
        const { data, error: rpcError } = await supabase.rpc('symposium_get_license', { p_email: addr });
        // If the check itself fails, don't lock people out of the portal
        setLicense(rpcError || !data?.found ? { done: true, unavailable: true } : data);
    }

    async function loadStatus(addr) {
        setLoading(true);
        setError('');
        const { data, error: rpcError } = await supabase.rpc('symposium_portal_status', { p_email: addr });
        setLoading(false);

        if (rpcError) {
            setError('Something went wrong. Please try again.');
            return;
        }
        if (!data?.found) {
            clearSymposiumEmail();
            setStatus(null);
            setError(NOT_FOUND_MSG);
            return;
        }
        setSymposiumEmail(addr);
        await loadLicense(addr);
        setStatus(data);
    }

    useEffect(() => {
        const saved = getSymposiumEmail();
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
        clearSymposiumEmail();
        setStatus(null);
        setLicense(null);
        setEditingLicense(false);
        setEmail('');
        setError('');
    }

    async function getCertificate() {
        if (status.certificate_token) {
            navigate(`${BASE}/certificate/${status.certificate_token}`);
            return;
        }
        setIssuing(true);
        setError('');
        try {
            const { token } = await callSymposiumCertificate({ action: 'issue', email: getSymposiumEmail() });
            navigate(`${BASE}/certificate/${token}`);
        } catch (err) {
            setError(err.message);
            setIssuing(false);
        }
    }

    // ---------- Login ----------
    if (!status) {
        return (
            <PortalShell
                title={SYMPOSIUM_NAME}
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
    const { quiz_open, quiz_done, survey_done, certificate_token, first_name } = status;
    const surveyOpen = SURVEY_QUESTIONS.length > 0;
    const certReady = quiz_done && survey_done;
    const showLicenseForm = !license?.done || editingLicense;

    return (
        <PortalShell title={SYMPOSIUM_NAME}>
            <div className="bg-white rounded-xl shadow-sm px-6 py-4 mt-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="text-gray-800">
                        Hi <span className="font-semibold">{first_name}</span>!
                    </p>
                    <p className="text-xs text-gray-500">{getSymposiumEmail()}</p>
                </div>
                <button onClick={logout} className="text-xs underline text-gray-500">
                    Log out
                </button>
            </div>

            {showLicenseForm ? (
                <SymposiumLicenseForm
                    email={getSymposiumEmail()}
                    registered={license?.registered}
                    initial={license?.answers}
                    onCancel={editingLicense ? () => setEditingLicense(false) : undefined}
                    onSaved={async () => {
                        await loadLicense(getSymposiumEmail());
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
                            : quiz_open
                                ? 'Questions from the symposium talks. You can only submit once.'
                                : 'The quiz is not open yet. Please check back later.'
                    }
                    done={quiz_done}
                    buttonLabel={quiz_done ? 'Quiz completed ✓' : quiz_open ? 'Take Quiz' : 'Not open yet'}
                    disabled={quiz_done || !quiz_open}
                    onClick={() => navigate(`${BASE}/quiz`)}
                />

                <ActionCard
                    step="2"
                    title="Evaluation Survey"
                    description={
                        survey_done
                            ? 'Thank you for your feedback. You can still edit your answers.'
                            : surveyOpen
                                ? 'Tell us about your symposium experience.'
                                : 'The survey is not open yet. Please check back later.'
                    }
                    done={survey_done}
                    buttonLabel={survey_done ? 'Edit Survey' : surveyOpen ? 'Take Survey' : 'Not open yet'}
                    secondary={survey_done}
                    disabled={!surveyOpen}
                    onClick={() => navigate(`${BASE}/survey`)}
                />

                <ActionCard
                    step="3"
                    title="Certificate"
                    description={
                        certReady
                            ? 'Your Certificate of Attendance is ready.'
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
            </>
            )}

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