import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATUS_COLORS = {
    approved: 'text-[#3B6D11] bg-[#EAF3DE]',
    pending:  'text-[#854F0B] bg-[#FAEEDA]',
    rejected: 'text-[#A32D2D] bg-[#FCEBEB]',
    canceled: 'text-[#6B21A8] bg-[#F0E6FF]',
};

function StatCard({ label, value, sub }) {
    return (
        <div className="bg-white border border-[#e5e3da] rounded-lg px-4 py-4">
            <p className="text-[12px] text-[#5f5e5a] mb-1">{label}</p>
            <p className="text-[28px] font-bold text-[#16572A] leading-none">{value}</p>
            {sub && <p className="text-[11px] text-[#888780] mt-1">{sub}</p>}
        </div>
    );
}

function Bar({ label, value, max, color }) {
    const pct = max > 0 ? Math.round((value / max) * 100) : 0;
    return (
        <div className="flex items-center gap-3 text-[13px]">
            <span className="w-[130px] shrink-0 text-[#344054] truncate text-[12px]">{label}</span>
            <div className="flex-1 bg-[#f1efe8] rounded-full h-[8px] overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color || '#16572A' }} />
            </div>
            <span className="w-[24px] text-right text-[#5f5e5a] font-medium text-[12px]">{value}</span>
        </div>
    );
}

function BreakdownCard({ title, rows, max, color }) {
    return (
        <div className="bg-white border border-[#e5e3da] rounded-lg p-4">
            <h2 className="text-[13.5px] font-bold text-[#344054] mb-3">{title}</h2>
            <div className="flex flex-col gap-3">
                {rows.length === 0
                    ? <p className="text-[13px] text-[#5f5e5a]">No data yet.</p>
                    : rows.map(({ label, count }) => (
                        <Bar key={label} label={label} value={count} max={max} color={color} />
                    ))
                }
            </div>
        </div>
    );
}

export default function Overview() {
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => { fetchStats(); }, []);

    async function fetchStats() {
        setLoading(true);
        setError('');
        try {
            const [{ data: participants, error: pErr }, { data: sponsors, error: sErr }] = await Promise.all([
                supabase.from('participants').select('reg_status, sponsored, sponsor, membership, souvenir, certificate_needed, age'),
                supabase.from('sponsors').select('id'),
            ]);

            if (pErr) throw pErr;
            if (sErr) throw sErr;

            const total      = participants.length;
            const approved   = participants.filter(p => p.reg_status === 'approved').length;
            const pending    = participants.filter(p => p.reg_status === 'pending').length;
            const rejected   = participants.filter(p => p.reg_status === 'rejected').length;
            const canceled   = participants.filter(p => p.reg_status === 'canceled').length;
            const sponsored  = participants.filter(p => p.sponsored === 'yes').length;
            const selfPaying = participants.filter(p => p.sponsored !== 'yes').length;

            // Membership
            const membershipMap = {};
            for (const p of participants) {
                const key = p.membership || 'Unknown';
                membershipMap[key] = (membershipMap[key] || 0) + 1;
            }
            const membershipLabels = { regular: 'Regular member', associate: 'Associate member', Donor: 'Donor', non_member: 'Non-member', Unknown: 'Unknown' };
            const membership = Object.entries(membershipMap).map(([key, count]) => ({ label: membershipLabels[key] || key, count })).sort((a, b) => b.count - a.count);

            // Souvenir
            const souvenirMap = {};
            for (const p of participants) {
                const key = p.souvenir || 'no';
                souvenirMap[key] = (souvenirMap[key] || 0) + 1;
            }
            const souvenirLabels = { no: 'No souvenir', digital: 'Digital copy (USB)' };
            const souvenir = Object.entries(souvenirMap).map(([key, count]) => ({ label: souvenirLabels[key] || key, count })).sort((a, b) => b.count - a.count);

            // Certificate
            const certMap = {};
            for (const p of participants) {
                const key = p.certificate_needed || 'no';
                certMap[key] = (certMap[key] || 0) + 1;
            }
            const certLabels = { yes: 'Needs certificate', no: 'No certificate needed' };
            const certificate = Object.entries(certMap).map(([key, count]) => ({ label: certLabels[key] || key, count })).sort((a, b) => b.count - a.count);

            // Age groups — ordered by age range, not by count
            const ageMap = {};
            for (const p of participants) {
                const key = p.age || 'Unknown';
                ageMap[key] = (ageMap[key] || 0) + 1;
            }
            const ageOrder = ['20_and_below', '21_30', '31_40', '41_50', '51_60', '61_70', '71_and_above', 'Unknown'];
            const ageLabels = {
                '20_and_below': '20 and below',
                '21_30':        '21 – 30',
                '31_40':        '31 – 40',
                '41_50':        '41 – 50',
                '51_60':        '51 – 60',
                '61_70':        '61 – 70',
                '71_and_above': '71 and above',
                'Unknown':      'Unknown',
            };
            const ageGroups = ageOrder
                .filter(key => ageMap[key])
                .map(key => ({ label: ageLabels[key], count: ageMap[key] }));

            // Top sponsors
            const sponsorMap = {};
            for (const p of participants) {
                if (p.sponsored === 'yes' && p.sponsor) {
                    sponsorMap[p.sponsor] = (sponsorMap[p.sponsor] || 0) + 1;
                }
            }
            const topSponsors = Object.entries(sponsorMap).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 8);

            setData({ total, approved, pending, rejected, canceled, sponsored, selfPaying, totalSponsors: sponsors.length, membership, souvenir, certificate, ageGroups, topSponsors });
        } catch (err) {
            setError('Failed to load stats.');
        } finally {
            setLoading(false);
        }
    }

    if (loading) return <div className="px-4 py-6 text-[13.5px] text-[#5f5e5a]">Loading…</div>;
    if (error)   return <div className="px-4 py-6 text-[13.5px] text-[#A32D2D]">{error}</div>;

    const maxMembership = Math.max(...data.membership.map(m => m.count), 1);
    const maxSouvenir   = Math.max(...data.souvenir.map(s => s.count), 1);
    const maxCert       = Math.max(...data.certificate.map(c => c.count), 1);
    const maxAge        = Math.max(...data.ageGroups.map(a => a.count), 1);
    const maxSponsor    = Math.max(...data.topSponsors.map(s => s.count), 1);

    return (
        <div className="px-4 lg:px-8 py-6 lg:py-8">
            <div className="mb-5">
                <h1 className="text-[20px] lg:text-[22px] font-bold text-[#16572A]">Overview</h1>
                <p className="text-[13px] text-[#5f5e5a] mt-1">Registration statistics at a glance.</p>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                <StatCard label="Total registrations" value={data.total} />
                <StatCard label="Total sponsors" value={data.totalSponsors} sub={`${data.sponsored} sponsored participants`} />
                <StatCard label="Self-paying" value={data.selfPaying} sub={`${data.total > 0 ? Math.round((data.selfPaying / data.total) * 100) : 0}% of total`} />
            </div>

            {/* Status cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                {[
                    { label: 'Approved', value: data.approved, key: 'approved' },
                    { label: 'Pending',  value: data.pending,  key: 'pending' },
                    { label: 'Rejected', value: data.rejected, key: 'rejected' },
                    { label: 'Canceled', value: data.canceled, key: 'canceled' },
                ].map(({ label, value, key }) => (
                    <button key={key} onClick={() => navigate('/participants')}
                        className={`rounded-lg px-4 py-3 text-left border border-[#e5e3da] hover:opacity-80 transition-opacity ${STATUS_COLORS[key]}`}>
                        <p className="text-[11px] mb-1 opacity-80">{label}</p>
                        <p className="text-[24px] font-bold leading-none">{value}</p>
                        <p className="text-[11px] mt-1 opacity-70">{data.total > 0 ? Math.round((value / data.total) * 100) : 0}%</p>
                    </button>
                ))}
            </div>

            {/* Sponsored vs self-paying + membership */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-white border border-[#e5e3da] rounded-lg p-4">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-3">Sponsored vs self-paying</h2>
                    <div className="flex flex-col gap-3">
                        <Bar label="Self-paying" value={data.selfPaying} max={data.total} color="#16572A" />
                        <Bar label="Sponsored"   value={data.sponsored}  max={data.total} color="#EDB221" />
                    </div>
                    <div className="flex gap-4 mt-4 text-[11px] text-[#5f5e5a]">
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-[#16572A]"></span> Self-paying ({data.selfPaying})</span>
                        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-[#EDB221]"></span> Sponsored ({data.sponsored})</span>
                    </div>
                </div>
                <BreakdownCard title="Membership type" rows={data.membership} max={maxMembership} color="#16572A" />
            </div>

            {/* Souvenir + certificate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <BreakdownCard title="Souvenir program" rows={data.souvenir} max={maxSouvenir} color="#339544" />
                <BreakdownCard title="Certificate of attendance" rows={data.certificate} max={maxCert} color="#339544" />
            </div>

            {/* Age groups */}
            <div className="mb-4">
                <BreakdownCard title="Age groups" rows={data.ageGroups} max={maxAge} color="#0F4D91" />
            </div>

            {/* Top sponsors */}
            {data.topSponsors.length > 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-4">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-3">Top sponsors by participant count</h2>
                    <div className="flex flex-col gap-3">
                        {data.topSponsors.map(({ name, count }) => (
                            <Bar key={name} label={name} value={count} max={maxSponsor} color="#EDB221" />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
