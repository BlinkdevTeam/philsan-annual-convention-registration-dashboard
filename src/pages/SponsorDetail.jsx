import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATUS_BADGE = {
    pending: 'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

export default function SponsorDetail() {
    const { slug } = useParams();
    const navigate = useNavigate();

    const [sponsor, setSponsor] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => { fetchData(); }, [slug]);

    async function fetchData() {
        setLoading(true);
        setError('');
        try {
            // Get sponsor by slug
            const { data: sponsorData, error: sponsorErr } = await supabase
                .from('sponsors')
                .select('id, name, slug, created_at')
                .eq('slug', slug)
                .single();

            if (sponsorErr || !sponsorData) {
                setError('Sponsor not found.');
                setLoading(false);
                return;
            }

            setSponsor(sponsorData);

            // Get participants under this sponsor
            const { data: participantData, error: partErr } = await supabase
                .from('participants')
                .select('first_name, last_name, email, company, reg_status, created_at')
                .eq('sponsor', sponsorData.name.trim())
                .order('created_at', { ascending: false });

            if (partErr) throw partErr;

            setParticipants(participantData ?? []);
        } catch (err) {
            setError('Failed to load sponsor details.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    // Compute stats
    const stats = participants.reduce(
        (acc, p) => {
            acc.total++;
            if (p.reg_status === 'approved') acc.approved++;
            else if (p.reg_status === 'pending') acc.pending++;
            else if (p.reg_status === 'canceled') acc.canceled++;
            return acc;
        },
        { total: 0, approved: 0, pending: 0, canceled: 0 }
    );

    if (loading) return (
        <div className="px-8 py-8 text-[13.5px] text-[#5f5e5a]">Loading…</div>
    );

    if (error) return (
        <div className="px-8 py-8 text-[13.5px] text-[#A32D2D]">{error}</div>
    );

    return (
        <div className="px-8 py-8">
            {/* Back */}
            <button
                onClick={() => navigate('/sponsors')}
                className="text-[13px] text-[#16572A] hover:underline mb-5 inline-flex items-center gap-1"
            >
                ← Back to sponsors
            </button>

            {/* Header */}
            <div className="mb-6">
                <h1 className="text-[22px] font-bold text-[#16572A]">{sponsor.name}</h1>
                <p className="text-[13px] text-[#5f5e5a] mt-1 font-mono">
                    /sponsor/{sponsor.slug}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
                {[
                    { label: 'Total', value: stats.total, bg: 'bg-white', text: 'text-[#344054]' },
                    { label: 'Approved', value: stats.approved, bg: 'bg-[#EAF3DE]', text: 'text-[#3B6D11]' },
                    { label: 'Pending', value: stats.pending, bg: 'bg-[#FAEEDA]', text: 'text-[#854F0B]' },
                    { label: 'Rejected', value: stats.canceled, bg: 'bg-[#FCEBEB]', text: 'text-[#A32D2D]' },
                ].map(({ label, value, bg, text }) => (
                    <div key={label} className={`${bg} border border-[#e5e3da] rounded-lg px-5 py-4`}>
                        <p className="text-[12px] text-[#5f5e5a] mb-1">{label}</p>
                        <p className={`text-[28px] font-bold ${text}`}>{value}</p>
                    </div>
                ))}
            </div>

            {/* Participants table */}
            <h2 className="text-[15px] font-bold text-[#344054] mb-3">Participants</h2>

            {participants.length === 0 ? (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                    <p className="text-[14px] text-[#5f5e5a]">
                        No participants registered under this sponsor yet.
                    </p>
                </div>
            ) : (
                <div className="bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                    <table className="w-full text-[13.5px]">
                        <thead>
                            <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                <th className="px-5 py-3 font-medium">Name</th>
                                <th className="px-5 py-3 font-medium">Email</th>
                                <th className="px-5 py-3 font-medium">Company</th>
                                <th className="px-5 py-3 font-medium">Status</th>
                                <th className="px-5 py-3 font-medium">Registered</th>
                            </tr>
                        </thead>
                        <tbody>
                            {participants.map((p, i) => (
                                <tr key={i} className="border-t border-[#e5e3da] hover:bg-[#fafaf7]">
                                    <td className="px-5 py-3 text-[#344054]">
                                        {p.first_name} {p.last_name}
                                    </td>
                                    <td className="px-5 py-3 text-[#5f5e5a]">{p.email}</td>
                                    <td className="px-5 py-3 text-[#5f5e5a]">{p.company ?? '—'}</td>
                                    <td className="px-5 py-3">
                                        <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                            {p.reg_status}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-[#5f5e5a]">
                                        {new Date(p.created_at).toLocaleDateString('en-PH', {
                                            year: 'numeric', month: 'short', day: 'numeric'
                                        })}
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
