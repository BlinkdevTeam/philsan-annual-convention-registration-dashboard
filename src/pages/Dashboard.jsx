import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipants } from '../lib/useParticipants';

const STATUS_TABS = [
    { value: 'pending',  label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'canceled', label: 'Canceled' },
    { value: 'all',      label: 'All' },
];

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    rejected: 'bg-[#FCEBEB] text-[#A32D2D]',
    canceled: 'bg-[#F0E6FF] text-[#6B21A8]',
};

export default function Dashboard() {
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('pending');
    const [search, setSearch] = useState('');

    const { participants, loading, error } = useParticipants(statusFilter);

    const filtered = useMemo(() => {
        if (!search.trim()) return participants;
        const q = search.trim().toLowerCase();
        return participants.filter((p) =>
            `${p.first_name} ${p.last_name} ${p.email} ${p.company}`.toLowerCase().includes(q)
        );
    }, [participants, search]);

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-8">
            <div className="mb-5">
                <h1 className="text-[20px] lg:text-[22px] font-bold text-[#16572A]">Participants</h1>
                <p className="text-[13px] text-[#5f5e5a] mt-1">Tap a row to view details and take action.</p>
            </div>

            {/* Status tabs — scrollable on mobile */}
            <div className="overflow-x-auto -mx-4 px-4 mb-4">
                <div className="flex gap-1 bg-white border border-[#e5e3da] rounded-md p-1 w-max min-w-full">
                    {STATUS_TABS.map((tab) => (
                        <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
                            className={`px-3 py-1.5 rounded text-[12.5px] font-medium transition-colors whitespace-nowrap ${
                                statusFilter === tab.value ? 'bg-[#16572A] text-white' : 'text-[#5f5e5a] hover:bg-[#f1efe8]'
                            }`}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Search */}
            <input type="search" placeholder="Search name, email, company…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full p-2.5 rounded-md border border-[#339544] text-[13.5px] mb-4" />

            {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>}
            {error   && <p className="text-[13.5px] text-[#A32D2D]">Error: {error}</p>}

            {!loading && !error && filtered.length === 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-8 text-center">
                    <p className="text-[14px] text-[#5f5e5a]">No registrations match this view.</p>
                </div>
            )}

            {/* Desktop table */}
            {!loading && !error && filtered.length > 0 && (
                <>
                    <div className="hidden lg:block bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                        <table className="w-full text-[13.5px]">
                            <thead>
                                <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Company</th>
                                    <th className="px-4 py-3 font-medium">Age</th>
                                    <th className="px-4 py-3 font-medium">Sponsored</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p) => (
                                    <tr key={p.id} onClick={() => navigate(`/participants/${p.id}`)}
                                        className="border-t border-[#e5e3da] hover:bg-[#f7f6f1] cursor-pointer transition-colors">
                                        <td className="px-4 py-3 font-medium text-[#16572A]">{p.first_name} {p.last_name}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.age ?? '—'}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.sponsored === 'yes' ? p.sponsor || 'Yes' : 'No'}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                                {p.reg_status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards */}
                    <div className="lg:hidden flex flex-col gap-3">
                        {filtered.map((p) => (
                            <div key={p.id} onClick={() => navigate(`/participants/${p.id}`)}
                                className="bg-white border border-[#e5e3da] rounded-lg p-4 cursor-pointer active:bg-[#f7f6f1]">
                                <div className="flex items-start justify-between mb-2">
                                    <p className="text-[14px] font-bold text-[#16572A]">{p.first_name} {p.last_name}</p>
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                        {p.reg_status}
                                    </span>
                                </div>
                                <p className="text-[12.5px] text-[#5f5e5a]">{p.email}</p>
                                {p.company && <p className="text-[12.5px] text-[#5f5e5a]">{p.company}</p>}
                                {p.age && <p className="text-[12.5px] text-[#5f5e5a]">Age: {p.age}</p>}
                                {p.sponsored === 'yes' && (
                                    <p className="text-[11.5px] text-[#854F0B] mt-1">Sponsored by {p.sponsor || 'sponsor'}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
