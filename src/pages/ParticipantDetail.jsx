import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

export default function ParticipantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [participant, setParticipant] = useState(null);
    const [proofUrl, setProofUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Reject modal
    const [showReject, setShowReject] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [actioning, setActioning] = useState(false);

    useEffect(() => { fetchData(); }, [id]);

    async function fetchData() {
        setLoading(true);
        setError('');
        try {
            const { data, error: err } = await supabase
                .from('participants')
                .select('*')
                .eq('id', id)
                .single();

            if (err || !data) { setError('Participant not found.'); return; }

            setParticipant(data);

            // Generate signed URL for payment proof if it exists
            if (data.payment_proof) {
                const { data: signed, error: signedErr } = await supabase
                    .storage
                    .from('payment_proof')
                    .createSignedUrl(data.payment_proof, 3600);
                if (signedErr) { console.error("Signed URL error:", signedErr); } else if (signed?.signedUrl) { setProofUrl(signed.signedUrl); }
            }
        } catch (err) {
            setError('Failed to load participant.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function handleApprove() {
        setActioning(true);
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'approved' })
            .eq('id', id);
        if (!error) setParticipant(p => ({ ...p, reg_status: 'approved' }));
        setActioning(false);
    }

    async function handleReject() {
        if (!rejectReason.trim()) return;
        setActioning(true);
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'canceled', rejection_reason: rejectReason.trim() })
            .eq('id', id);
        if (!error) {
            setParticipant(p => ({ ...p, reg_status: 'canceled', rejection_reason: rejectReason.trim() }));
            setShowReject(false);
            setRejectReason('');
        }
        setActioning(false);
    }

    if (loading) return <div className="px-8 py-8 text-[13.5px] text-[#5f5e5a]">Loading…</div>;
    if (error)   return <div className="px-8 py-8 text-[13.5px] text-[#A32D2D]">{error}</div>;

    const isPending  = participant.reg_status === 'pending';
    const isApproved = participant.reg_status === 'approved';
    const isCanceled = participant.reg_status === 'canceled';

    return (
        <div className="px-8 py-8 max-w-[860px]">
            {/* Back */}
            <button
                onClick={() => navigate('/')}
                className="text-[13px] text-[#16572A] hover:underline mb-5 inline-flex items-center gap-1"
            >
                ← Back to participants
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-[22px] font-bold text-[#16572A]">
                        {participant.first_name} {participant.last_name}
                    </h1>
                    <p className="text-[13px] text-[#5f5e5a] mt-1">{participant.email}</p>
                </div>
                <span className={`mt-1 inline-block px-3 py-1 rounded-full text-[12.5px] font-medium ${STATUS_BADGE[participant.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                    {participant.reg_status}
                </span>
            </div>

            {/* Details + Proof side by side */}
            <div className="grid grid-cols-[1fr_1fr] gap-6 mb-6">

                {/* Participant info */}
                <div className="bg-white border border-[#e5e3da] rounded-lg p-5">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-4">Registration details</h2>
                    <dl className="flex flex-col gap-3 text-[13px]">
                        {[
                            { label: 'Full name',   value: `${participant.first_name} ${participant.last_name}` },
                            { label: 'Email',        value: participant.email },
                            { label: 'Mobile',       value: participant.mobile ?? '—' },
                            { label: 'Company',      value: participant.company ?? '—' },
                            { label: 'Sponsored',    value: participant.is_sponsored ? 'Yes' : 'No' },
                            { label: 'Sponsor',      value: participant.sponsor ?? '—' },
                            { label: 'Registered',   value: new Date(participant.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex gap-3">
                                <dt className="w-[110px] shrink-0 text-[#5f5e5a]">{label}</dt>
                                <dd className="text-[#344054] font-medium break-all">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {/* Rejection reason if canceled */}
                    {isCanceled && participant.rejection_reason && (
                        <div className="mt-4 p-3 bg-[#FCEBEB] rounded-md">
                            <p className="text-[12px] text-[#A32D2D] font-medium mb-1">Rejection reason</p>
                            <p className="text-[13px] text-[#791F1F]">{participant.rejection_reason}</p>
                        </div>
                    )}
                </div>

                {/* Payment proof */}
                <div className="bg-white border border-[#e5e3da] rounded-lg p-5">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-4">Proof of payment</h2>

                    {participant.is_sponsored ? (
                        <div className="flex items-center justify-center h-[200px] bg-[#f7f6f1] rounded-md">
                            <p className="text-[13px] text-[#5f5e5a] text-center px-4">
                                Sponsored participant — no proof of payment required.
                            </p>
                        </div>
                    ) : proofUrl ? (
                        <div className="flex flex-col gap-3">
                            {/* Preview — works for images; PDF gets a fallback */}
                            <div className="border border-[#e5e3da] rounded-md overflow-hidden bg-[#f7f6f1]">
                                <img
                                    src={proofUrl}
                                    alt="Proof of payment"
                                    className="w-full object-contain max-h-[280px]"
                                    onError={(e) => {
                                        // Not an image — show PDF embed instead
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                                <iframe
                                    src={proofUrl}
                                    title="Proof of payment"
                                    className="w-full h-[280px]"
                                    style={{ display: 'none' }}
                                />
                            </div>
                            <a
                                href={proofUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[12.5px] text-[#16572A] hover:underline text-center"
                            >
                                Open full file ↗
                            </a>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-[200px] bg-[#f7f6f1] rounded-md">
                            <p className="text-[13px] text-[#5f5e5a]">No file uploaded.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Actions — only show for pending */}
            {isPending && (
                <div className="flex gap-3">
                    <button
                        onClick={handleApprove}
                        disabled={actioning}
                        className="px-5 py-2.5 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-tl-[16px] rounded-br-[16px] transition-colors disabled:opacity-60"
                    >
                        {actioning ? 'Saving…' : '✓ Approve registration'}
                    </button>
                    <button
                        onClick={() => setShowReject(true)}
                        disabled={actioning}
                        className="px-5 py-2.5 border border-[#A32D2D] text-[#A32D2D] hover:bg-[#FCEBEB] text-[13.5px] font-medium rounded-md transition-colors disabled:opacity-60"
                    >
                        ✕ Reject registration
                    </button>
                </div>
            )}

            {isApproved && (
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#EAF3DE] rounded-md text-[13px] text-[#3B6D11]">
                    ✓ This registration has been approved.
                </div>
            )}

            {isCanceled && (
                <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FCEBEB] rounded-md text-[13px] text-[#A32D2D]">
                    ✕ This registration has been rejected.
                </div>
            )}

            {/* Reject modal */}
            {showReject && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowReject(false); }}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] p-6">
                        <h2 className="text-[17px] font-bold text-[#344054] mb-1">Reject registration</h2>
                        <p className="text-[13px] text-[#5f5e5a] mb-4">
                            Provide a reason — this will be sent to the participant.
                        </p>
                        <textarea
                            rows={4}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="e.g. Payment proof is unclear. Please resubmit with a clearer screenshot."
                            className="w-full p-2.5 border border-[#d0cec6] rounded-md text-[13.5px] focus:outline-none focus:border-[#A32D2D] resize-none"
                        />
                        {!rejectReason.trim() && (
                            <p className="text-[12px] text-[#A32D2D] mt-1">Reason is required.</p>
                        )}
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => { setShowReject(false); setRejectReason(''); }}
                                className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReject}
                                disabled={actioning || !rejectReason.trim()}
                                className="flex-1 py-2.5 bg-[#A32D2D] hover:bg-[#791F1F] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60"
                            >
                                {actioning ? 'Rejecting…' : 'Confirm rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
