import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';

export default function Login() {
    const { signIn } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setLoading(true);

        const { error } = await signIn(email, password);

        setLoading(false);

        if (error) {
            setError('Incorrect email or password.');
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f1efe8] px-4">
            <div className="w-full max-w-[380px] bg-white rounded-lg shadow-lg p-8">
                <p className="text-[12px] text-[#A9D4B4] bg-[#16572A] inline-block px-3 py-1 rounded-full mb-4">
                    PHILSAN admin
                </p>
                <h1 className="text-[22px] font-bold text-[#16572A] mb-1">
                    Registration dashboard
                </h1>
                <p className="text-[13px] text-[#5f5e5a] mb-6">
                    Sign in to review convention registrations.
                </p>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <div>
                        <label htmlFor="email" className="text-[12.5px] text-[#344054] block mb-1">
                            Email
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#339544] text-[14px]"
                            placeholder="admin@philsan.org"
                        />
                    </div>

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

                    {error && (
                        <p className="text-[12.5px] text-[#A32D2D]">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 inline-flex items-center justify-center gap-2 bg-[#16572A] hover:bg-[#EDB221] text-white py-2.5 rounded-tl-[20px] rounded-br-[20px] text-[14px] font-medium disabled:opacity-60"
                    >
                        {loading ? 'Signing in…' : 'Sign in'}
                    </button>
                </form>
            </div>
        </div>
    );
}
