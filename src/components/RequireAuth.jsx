import { useAuth } from '../lib/AuthContext';
import Login from '../pages/login';

export default function RequireAuth({ children }) {
    const { session, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#f1efe8]">
                <p className="text-[13px] text-[#5f5e5a]">Loading…</p>
            </div>
        );
    }

    if (!session) {
        return <Login />;
    }

    return children;
}
