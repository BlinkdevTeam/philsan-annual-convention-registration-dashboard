import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const SPONSOR_LOGIN_URL = 'https://pskballrwzdbovtylgjs.supabase.co/functions/v1/sponsor-login'; // TODO: paste sponsor-login Edge Function URL once deployed
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

export default function SponsorLogin() {
    const { slug } = useParams();
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!SPONSOR_LOGIN_URL) {
            setError('Sponsor login isn\'t configured yet.');
            setLoading(false);
            return;
        }

        try {
            const response = await fetch(SPONSOR_LOGIN_URL, {
                method: 'POST',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ slug, password }),
            });

            const result = await response.json();

            if (!response.ok) {
                setError(result.error || 'Incorrect password.');
                setLoading(false);
                return;
            }

            // Store just enough to re-validate on the status page.
            // No real session token exists for sponsors, so the password
            // itself is re-sent on each request to sponsor-participants.
            sessionStorage.setItem(
                'philsan_sponsor_auth',
                JSON.stringify({ slug, password, name: result.sponsorName })
            );

            navigate(`/sponsor/${slug}/status`);
        } catch {
            setError('Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f1efe8] px-4">
            <div className="w-full max-w-[380px] bg-white rounded-lg shadow-lg p-8">
                <p className="text-[12px] text-[#A9D4B4] bg-[#16572A] inline-block px-3 py-1 rounded-full mb-4">
                    PHILSAN sponsor portal
                </p>
                <h1 className="text-[20px] font-bold text-[#16572A] mb-1">
                    Sponsor sign in
                </h1>
                <p className="text-[13px] text-[#5f5e5a] mb-6">
                    Enter your sponsor password to view your registrants.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="password" className="text-[12.5px] text-[#344054] block mb-1">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#339544] text-[14px]"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && <p className="text-[12.5px] text-[#A32D2D]">{error}</p>}

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 inline-flex items-center justify-center gap-2 bg-[#16572A] hover:bg-[#EDB221] text-white py-2.5 rounded-tl-[20px] rounded-br-[20px] text-[14px] font-medium disabled:opacity-60"
                    >
                        {loading ? 'Checking…' : 'View my registrants'}
                    </button>
                </form>
            </div>
        </div>
    );
}
