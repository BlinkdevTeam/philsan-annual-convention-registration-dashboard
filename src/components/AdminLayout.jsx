import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const NAV = [
    { to: '/',             label: 'Overview',      icon: '📊', end: true },
    { to: '/participants', label: 'Participants',   icon: '👥' },
    { to: '/sponsors',     label: 'Sponsors',       icon: '🏢' },
];

export default function AdminLayout({ children }) {
    const { signOut } = useAuth();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);

    async function handleSignOut() {
        await signOut();
        navigate('/');
    }

    return (
        <div className="flex min-h-screen bg-[#f1efe8]">

            {/* ── Desktop sidebar ── */}
            <aside className="hidden lg:flex w-[220px] shrink-0 bg-[#16572A] flex-col">
                <div className="px-5 py-6 border-b border-[#ffffff18]">
                    <p className="text-[11px] text-[#A9D4B4] uppercase tracking-widest mb-1">Admin Portal</p>
                    <p className="text-[17px] font-bold text-white leading-tight">PHILSAN</p>
                </div>
                <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
                    {NAV.map(({ to, label, icon, end }) => (
                        <NavLink key={to} to={to} end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 rounded-md text-[13.5px] transition-colors ${
                                    isActive ? 'bg-white text-[#16572A] font-medium' : 'text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white'
                                }`}>
                            <span>{icon}</span>{label}
                        </NavLink>
                    ))}
                </nav>
                <div className="px-3 py-4 border-t border-[#ffffff18]">
                    <button onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13.5px] text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white transition-colors">
                        <span>🚪</span>Sign out
                    </button>
                </div>
            </aside>

            {/* ── Mobile top bar ── */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#16572A] flex items-center justify-between px-4 py-3 shadow-md">
                <p className="text-[16px] font-bold text-white">PHILSAN</p>
                <button onClick={() => setDrawerOpen(true)} className="text-white p-1">
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                        <line x1="3" y1="18" x2="21" y2="18"/>
                    </svg>
                </button>
            </div>

            {/* ── Mobile drawer overlay ── */}
            {drawerOpen && (
                <div className="lg:hidden fixed inset-0 z-50 flex">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
                    {/* Drawer */}
                    <div className="relative w-[260px] bg-[#16572A] flex flex-col h-full shadow-xl">
                        <div className="px-5 py-6 border-b border-[#ffffff18] flex items-center justify-between">
                            <div>
                                <p className="text-[11px] text-[#A9D4B4] uppercase tracking-widest mb-1">Admin Portal</p>
                                <p className="text-[17px] font-bold text-white">PHILSAN</p>
                            </div>
                            <button onClick={() => setDrawerOpen(false)} className="text-[#A9D4B4] hover:text-white">
                                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <line x1="4" y1="4" x2="16" y2="16"/>
                                    <line x1="16" y1="4" x2="4" y2="16"/>
                                </svg>
                            </button>
                        </div>
                        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
                            {NAV.map(({ to, label, icon, end }) => (
                                <NavLink key={to} to={to} end={end}
                                    onClick={() => setDrawerOpen(false)}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-3 rounded-md text-[14px] transition-colors ${
                                            isActive ? 'bg-white text-[#16572A] font-medium' : 'text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white'
                                        }`}>
                                    <span>{icon}</span>{label}
                                </NavLink>
                            ))}
                        </nav>
                        <div className="px-3 py-4 border-t border-[#ffffff18]">
                            <button onClick={handleSignOut}
                                className="w-full flex items-center gap-3 px-3 py-3 rounded-md text-[14px] text-[#A9D4B4] hover:bg-[#ffffff18] hover:text-white transition-colors">
                                <span>🚪</span>Sign out
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Main content ── */}
            <main className="flex-1 overflow-auto lg:pt-0 pt-[52px]">
                {children}
            </main>
        </div>
    );
}
