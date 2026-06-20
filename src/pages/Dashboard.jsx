import { useMemo, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useParticipants } from '../lib/useParticipants';
import RejectModal from '../components/RejectModal';

const STATUS_TABS = [
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'canceled', label: 'Rejected' },
    { value: 'all', label: 'All' },
];

const STATUS_BADGE = {
    pending: 'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

export default function Dashboard() {
    const { user, signOut } = useAuth();
    const [statusFilter, setStatusFilter] = useState('pending');
    const [search, setSearch] = useState('');
    const [rejectTarget, setRejectTarget] = useState(null);
    const [actionError, setActionError] = useState('');

    const {
        participants,
        loading,
        error,
        approveParticipant,
        rejectParticipant,
    } = useParticipants(statusFilter);

    const filtered = useMemo(() => {
        if (!search.trim()) return participants;
        const q = search.trim().toLowerCase();
        return participants.filter((p) =>
            `${p.first_name} ${p.last_name} ${p.email} ${p.company}`
                .toLowerCase()
                .includes(q)
        );
    }, [participants, search]);

    async function handleApprove(id) {
        setActionError('');
        const { error } = await approveParticipant(id);
        if (error) setActionError(error.message);
    }

    async function handleReject(reason) {
        setActionError('');
        const { error } = await rejectParticipant(rejectTarget.id, reason);
        if (error) {
            setActionError(error.message);
        } else {
            setRejectTarget(null);
        }
    }

    return (
        <div className="min-h-screen bg-[#f1efe8]">
            <header className="bg-white border-b border-[#e5e3da] px-6 py-4 flex items-center justify-between">
                <div>
                    <p className="text-[12px] text-[#A9D4B4] bg-[#16572A] inline-block px-3 py-1 rounded-full mb-1">
                        PHILSAN admin
                    </p>
                    <h1 className="text-[19px] font-bold text-[#16572A]">
                        Registration review
                    </h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-[13px] text-[#5f5e5a]">{user?.email}</span>
                    <button
                        onClick={signOut}
                        className="text-[13px] text-[#16572A] border border-[#339544] rounded-md px-3 py-1.5"
                    >
                        Sign out
                    </button>
                </div>
            </header>

            <main className="max-w-[1100px] mx-auto px-6 py-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                    <div className="flex gap-1 bg-white border border-[#e5e3da] rounded-md p-1">
                        {STATUS_TABS.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => setStatusFilter(tab.value)}
                                className={`px-3.5 py-1.5 rounded text-[13px] font-medium transition-colors ${
                                    statusFilter === tab.value
                                        ? 'bg-[#16572A] text-white'
                                        : 'text-[#5f5e5a]'
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

                {actionError && (
                    <p className="text-[13px] text-[#A32D2D] mb-4">{actionError}</p>
                )}

                {loading && (
                    <p className="text-[13.5px] text-[#5f5e5a]">Loading registrations…</p>
                )}

                {error && (
                    <p className="text-[13.5px] text-[#A32D2D]">
                        Couldn't load registrations: {error}
                    </p>
                )}

                {!loading && !error && filtered.length === 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                        <p className="text-[14px] text-[#5f5e5a]">
                            No registrations match this view yet.
                        </p>
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
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p) => (
                                    <tr key={p.id} className="border-t border-[#e5e3da]">
                                        <td className="px-4 py-3 text-[#344054]">
                                            {p.first_name} {p.last_name}
                                        </td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">
                                            {p.sponsored === 'yes' ? p.sponsor || 'Yes' : 'No'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span
                                                className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${
                                                    STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'
                                                }`}
                                            >
                                                {p.reg_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            {p.reg_status === 'pending' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button
                                                        onClick={() => handleApprove(p.id)}
                                                        className="px-3 py-1.5 rounded-md text-[12.5px] font-medium text-white bg-[#16572A]"
                                                    >
                                                        Approve
                                                    </button>
                                                    <button
                                                        onClick={() => setRejectTarget(p)}
                                                        className="px-3 py-1.5 rounded-md text-[12.5px] font-medium text-[#A32D2D] border border-[#A32D2D]"
                                                    >
                                                        Reject
                                                    </button>
                                                </div>
                                            ) : (
                                                <p className="text-right text-[12px] text-[#888780]">
                                                    {p.reg_status === 'canceled' && p.rejection_reason
                                                        ? p.rejection_reason
                                                        : '—'}
                                                </p>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {rejectTarget && (
                <RejectModal
                    participant={rejectTarget}
                    onCancel={() => setRejectTarget(null)}
                    onConfirm={handleReject}
                />
            )}
        </div>
    );
}
