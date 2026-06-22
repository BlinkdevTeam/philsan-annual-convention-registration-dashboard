import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const SPONSOR_PARTICIPANTS_URL = 'https://pskballrwzdbovtylgjs.supabase.co/functions/v1/sponsor-participants'; // TODO: paste sponsor-participants Edge Function URL once deployed
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

const STATUS_BADGE = {
    pending: 'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

export default function SponsorStatus() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [auth, setAuth] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const stored = sessionStorage.getItem('philsan_sponsor_auth');

        if (!stored) {
            navigate(`/sponsor/${slug}`);
            return;
        }

        const parsedAuth = JSON.parse(stored);

        if (parsedAuth.slug !== slug) {
            navigate(`/sponsor/${slug}`);
            return;
        }

        setAuth(parsedAuth);
        fetchParticipants(parsedAuth);
    }, [slug]);

    async function fetchParticipants(authData) {
        setLoading(true);
        setError('');

        if (!SPONSOR_PARTICIPANTS_URL) {
            setError('Sponsor status page isn\'t configured yet.');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(SPONSOR_PARTICIPANTS_URL, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ slug: authData.slug, password: authData.password }),
            });

            const result = await response.json();

            if (!response.ok) {
                sessionStorage.removeItem('philsan_sponsor_auth');
                navigate(`/sponsor/${slug}`);
                return;
            }

            setParticipants(result.participants);
        } catch {
            setError('Couldn\'t load your registrants. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    function handleSignOut() {
        sessionStorage.removeItem('philsan_sponsor_auth');
        navigate(`/sponsor/${slug}`);
    }

    if (!auth) return null;

    return (
        <div className="min-h-screen bg-[#f1efe8]">
            <header className="bg-white border-b border-[#e5e3da] px-6 py-4 flex items-center justify-between">
                <div>
                    <p className="text-[12px] text-[#A9D4B4] bg-[#16572A] inline-block px-3 py-1 rounded-full mb-1">
                        PHILSAN sponsor portal
                    </p>
                    <h1 className="text-[19px] font-bold text-[#16572A]">{auth.name}</h1>
                </div>
                <button
                    onClick={handleSignOut}
                    className="text-[13px] text-[#16572A] border border-[#339544] rounded-md px-3 py-1.5"
                >
                    Sign out
                </button>
            </header>

            <main className="max-w-[900px] mx-auto px-6 py-8">
                <p className="text-[13.5px] text-[#5f5e5a] mb-5">
                    Registration status for participants you're sponsoring.
                </p>

                {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>}
                {error && <p className="text-[13.5px] text-[#A32D2D]">{error}</p>}

                {!loading && !error && participants.length === 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                        <p className="text-[14px] text-[#5f5e5a]">
                            No registrants under your sponsorship yet.
                        </p>
                    </div>
                )}

                {!loading && !error && participants.length > 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                        <table className="w-full text-[13.5px]">
                            <thead>
                                <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Company</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {participants.map((p, i) => (
                                    <tr key={i} className="border-t border-[#e5e3da]">
                                        <td className="px-4 py-3 text-[#344054]">
                                            {p.first_name} {p.last_name}
                                        </td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${
                                                    STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'
                                                }`}
                                            >
                                                {p.reg_status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
