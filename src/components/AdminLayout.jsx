import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
    { to: '/',         label: 'Overview',      icon: '📊', end: true },
    { to: '/participants', label: 'Participants', icon: '👥' },
    { to: '/sponsors', label: 'Sponsors',       icon: '🏢' },
];

export default function AdminLayout({ children }) {
    const { signOut } = useAuth();
    const navigate = useNavigate();

    async function handleSignOut() {
        await signOut();
        navigate('/');
    }

    return (
        <div className="flex min-h-screen bg-[#f1efe8]">
            <aside className="w-[220px] shrink-0 bg-[#16572A] flex flex-col">
                <div className="px-5 py-6 border-b border-[#ffffff18]">
                    <p className="text-[11px] text-[#A9D4B4] uppercase tracking-widest mb-1">Admin Portal</p>
                    <p className="text-[17px] font-bold text-white leading-tight">PHILSAN</p>
                </div>
                <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
                    {NAV.map(({ to, label, icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13.5px] transition-colors ${
                                    isActive
                                        ? 'bg-white text-[#16572A] font-medium'
                                        : 'text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white'
                                }`
                            }
                        >
                            <span>{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>
                <div className="px-3 py-4 border-t border-[#ffffff18]">
                    <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13.5px] text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white transition-colors"
                    >
                        <span>🚪</span>
                        Sign out
                    </button>
                </div>
            </aside>
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    );
}
