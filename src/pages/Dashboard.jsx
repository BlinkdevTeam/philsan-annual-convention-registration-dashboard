import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipants } from '../lib/useParticipants';

const STATUS_TABS = [
    { value: 'pending',   label: 'Pending' },
    { value: 'approved',  label: 'Approved' },
    { value: 'rejected',  label: 'Rejected' },
    { value: 'canceled',  label: 'Canceled' },
    { value: 'all',       label: 'All' },
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
            `${p.first_name} ${p.last_name} ${p.email} ${p.company}`
                .toLowerCase()
                .includes(q)
        );
    }, [participants, search]);

    return (
        <div className="px-8 py-8">
            <div className="mb-6">
                <h1 className="text-[22px] font-bold text-[#16572A]">Participants</h1>
                <p className="text-[13.5px] text-[#5f5e5a] mt-1">
                    Click a row to view details, proof of payment, and take action.
                </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <div className="flex gap-1 bg-white border border-[#e5e3da] rounded-md p-1">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab.value}
                            onClick={() => setStatusFilter(tab.value)}
                            className={`px-3.5 py-1.5 rounded text-[13px] font-medium transition-colors ${
                                statusFilter === tab.value
                                    ? 'bg-[#16572A] text-white'
                                    : 'text-[#5f5e5a] hover:bg-[#f1efe8]'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <input
                    type="search"
                    placeholder="Search name, email, company…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-[280px] p-2 rounded-md border border-[#339544] text-[13.5px]"
                />
            </div>

            {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading registrations…</p>}
            {error   && <p className="text-[13.5px] text-[#A32D2D]">Couldn't load registrations: {error}</p>}

            {!loading && !error && filtered.length === 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                    <p className="text-[14px] text-[#5f5e5a]">No registrations match this view yet.</p>
                </div>
            )}

            {!loading && !error && filtered.length > 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                    <table className="w-full text-[13.5px]">
                        <thead>
                            <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                <th className="px-4 py-3 font-medium">Name</th>
                                <th className="px-4 py-3 font-medium">Email</th>
                                <th className="px-4 py-3 font-medium">Company</th>
                                <th className="px-4 py-3 font-medium">Sponsored</th>
                                <th className="px-4 py-3 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((p) => (
                                <tr
                                    key={p.id}
                                    onClick={() => navigate(`/participants/${p.id}`)}
                                    className="border-t border-[#e5e3da] hover:bg-[#f7f6f1] cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 font-medium text-[#16572A]">
                                        {p.first_name} {p.last_name}
                                    </td>
                                    <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                    <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                    <td className="px-4 py-3 text-[#5f5e5a]">
                                        {p.sponsored === 'yes' ? p.sponsor || 'Yes' : 'No'}
                                    </td>
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
            )}
        </div>
    );
}
