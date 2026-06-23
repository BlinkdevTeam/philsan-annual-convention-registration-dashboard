import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = 'https://pskballrwzdbovtylgjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    rejected: 'bg-[#FCEBEB] text-[#A32D2D]',
    canceled: 'bg-[#F0E6FF] text-[#6B21A8]',
};

async function callFunction(name, body) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res;
}

export default function ParticipantDetail() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [participant, setParticipant] = useState(null);
    const [proofUrl, setProofUrl] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actioning, setActioning] = useState(false);

    // Modal state: null | 'approve' | 'reject' | 'cancel'
    const [modal, setModal] = useState(null);
    const [reason, setReason] = useState('');

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

            if (data.payment_proof) {
                const { data: signed, error: signedErr } = await supabase
                    .storage.from('payment_proof')
                    .createSignedUrl(data.payment_proof, 3600);
                if (signedErr) console.error('Signed URL error:', signedErr);
                else if (signed?.signedUrl) setProofUrl(signed.signedUrl);
            }
        } catch (err) {
            setError('Failed to load participant.');
        } finally {
            setLoading(false);
        }
    }

    function closeModal() { setModal(null); setReason(''); }

    async function handleApprove() {
        setActioning(true);
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'approved', status_reason: null })
            .eq('id', id);

        if (!error) {
            setParticipant(p => ({ ...p, reg_status: 'approved', status_reason: null }));
            try {
                await callFunction('send-confirmation-email', {
                    email: participant.email,
                    first_name: participant.first_name,
                });
            } catch (e) { console.error('Approval email error:', e); }
        }
        closeModal();
        setActioning(false);
    }

    async function handleReject() {
        if (!reason.trim()) return;
        setActioning(true);
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'rejected', status_reason: reason.trim() })
            .eq('id', id);

        if (!error) {
            setParticipant(p => ({ ...p, reg_status: 'rejected', status_reason: reason.trim() }));
            try {
                await callFunction('send-rejection-email', {
                    email: participant.email,
                    first_name: participant.first_name,
                    rejection_reason: reason.trim(),
                });
            } catch (e) { console.error('Rejection email error:', e); }
        }
        closeModal();
        setActioning(false);
    }

    async function handleCancel() {
        if (!reason.trim()) return;
        setActioning(true);
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'canceled', status_reason: reason.trim() })
            .eq('id', id);

        if (!error) {
            setParticipant(p => ({ ...p, reg_status: 'canceled', status_reason: reason.trim() }));
            try {
                await callFunction('send-cancellation-email', {
                    email: participant.email,
                    first_name: participant.first_name,
                    status_reason: reason.trim(),
                });
            } catch (e) { console.error('Cancellation email error:', e); }
        }
        closeModal();
        setActioning(false);
    }

    if (loading) return <div className="px-8 py-8 text-[13.5px] text-[#5f5e5a]">Loading…</div>;
    if (error)   return <div className="px-8 py-8 text-[13.5px] text-[#A32D2D]">{error}</div>;

    const status = participant.reg_status;

    return (
        <div className="px-8 py-8 max-w-[860px]">
            {/* Back */}
            <button onClick={() => navigate('/')} className="text-[13px] text-[#16572A] hover:underline mb-5 inline-flex items-center gap-1">
                ← Back to participants
            </button>

            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div>
                    <h1 className="text-[22px] font-bold text-[#16572A]">{participant.first_name} {participant.last_name}</h1>
                    <p className="text-[13px] text-[#5f5e5a] mt-1">{participant.email}</p>
                </div>
                <span className={`mt-1 inline-block px-3 py-1 rounded-full text-[12.5px] font-medium ${STATUS_BADGE[status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                    {status}
                </span>
            </div>

            {/* Details + Proof */}
            <div className="grid grid-cols-[1fr_1fr] gap-6 mb-6">
                <div className="bg-white border border-[#e5e3da] rounded-lg p-5">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-4">Registration details</h2>
                    <dl className="flex flex-col gap-3 text-[13px]">
                        {[
                            { label: 'Full name',  value: `${participant.first_name} ${participant.last_name}` },
                            { label: 'Email',       value: participant.email },
                            { label: 'Mobile',      value: participant.mobile ?? '—' },
                            { label: 'Company',     value: participant.company ?? '—' },
                            { label: 'Sponsored',   value: participant.is_sponsored ? 'Yes' : 'No' },
                            { label: 'Sponsor',     value: participant.sponsor ?? '—' },
                            { label: 'Registered',  value: new Date(participant.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }) },
                        ].map(({ label, value }) => (
                            <div key={label} className="flex gap-3">
                                <dt className="w-[110px] shrink-0 text-[#5f5e5a]">{label}</dt>
                                <dd className="text-[#344054] font-medium break-all">{value}</dd>
                            </div>
                        ))}
                    </dl>

                    {/* Status reason */}
                    {participant.status_reason && (status === 'rejected' || status === 'canceled') && (
                        <div className={`mt-4 p-3 rounded-md ${status === 'rejected' ? 'bg-[#FCEBEB]' : 'bg-[#F0E6FF]'}`}>
                            <p className={`text-[12px] font-medium mb-1 ${status === 'rejected' ? 'text-[#A32D2D]' : 'text-[#6B21A8]'}`}>
                                {status === 'rejected' ? 'Rejection reason' : 'Cancellation reason'}
                            </p>
                            <p className={`text-[13px] ${status === 'rejected' ? 'text-[#791F1F]' : 'text-[#4C1D95]'}`}>
                                {participant.status_reason}
                            </p>
                        </div>
                    )}
                </div>

                <div className="bg-white border border-[#e5e3da] rounded-lg p-5">
                    <h2 className="text-[13.5px] font-bold text-[#344054] mb-4">Proof of payment</h2>
                    {participant.is_sponsored ? (
                        <div className="flex items-center justify-center h-[200px] bg-[#f7f6f1] rounded-md">
                            <p className="text-[13px] text-[#5f5e5a] text-center px-4">Sponsored — no proof required.</p>
                        </div>
                    ) : proofUrl ? (
                        <div className="flex flex-col gap-3">
                            <div className="border border-[#e5e3da] rounded-md overflow-hidden bg-[#f7f6f1]">
                                <img src={proofUrl} alt="Proof of payment" className="w-full object-contain max-h-[280px]"
                                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'block'; }} />
                                <iframe src={proofUrl} title="Proof of payment" className="w-full h-[280px]" style={{ display: 'none' }} />
                            </div>
                            <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-[#16572A] hover:underline text-center">
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

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
                {status === 'pending' && <>
                    <button onClick={() => setModal('approve')}
                        className="px-5 py-2.5 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-tl-[16px] rounded-br-[16px] transition-colors">
                        ✓ Approve
                    </button>
                    <button onClick={() => setModal('reject')}
                        className="px-5 py-2.5 border border-[#A32D2D] text-[#A32D2D] hover:bg-[#FCEBEB] text-[13.5px] font-medium rounded-md transition-colors">
                        ✕ Reject
                    </button>
                </>}

                {status === 'approved' && <>
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#EAF3DE] rounded-md text-[13px] text-[#3B6D11]">
                        ✓ Approved
                    </div>
                    <button onClick={() => setModal('cancel')}
                        className="px-5 py-2.5 border border-[#6B21A8] text-[#6B21A8] hover:bg-[#F0E6FF] text-[13.5px] font-medium rounded-md transition-colors">
                        Cancel registration
                    </button>
                </>}

                {status === 'rejected' && (
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#FCEBEB] rounded-md text-[13px] text-[#A32D2D]">
                        ✕ Rejected
                    </div>
                )}

                {status === 'canceled' && (
                    <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#F0E6FF] rounded-md text-[13px] text-[#6B21A8]">
                        Registration canceled
                    </div>
                )}
            </div>

            {/* Approve modal */}
            {modal === 'approve' && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[400px] p-6">
                        <h2 className="text-[17px] font-bold text-[#16572A] mb-2">Approve registration?</h2>
                        <p className="text-[13.5px] text-[#5f5e5a] mb-6 leading-[1.6]">
                            This will approve <strong>{participant.first_name} {participant.last_name}</strong>'s registration and send them an approval email with their QR code.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={closeModal} className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">Cancel</button>
                            <button onClick={handleApprove} disabled={actioning}
                                className="flex-1 py-2.5 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-tl-[16px] rounded-br-[16px] disabled:opacity-60">
                                {actioning ? 'Approving…' : 'Yes, approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reject modal */}
            {modal === 'reject' && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] p-6">
                        <h2 className="text-[17px] font-bold text-[#344054] mb-1">Reject registration?</h2>
                        <p className="text-[13px] text-[#5f5e5a] mb-4">Provide a reason — this will be sent to <strong>{participant.first_name}</strong>.</p>
                        <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Payment proof is unclear. Please resubmit with a clearer screenshot."
                            className="w-full p-2.5 border border-[#d0cec6] rounded-md text-[13.5px] focus:outline-none focus:border-[#A32D2D] resize-none" />
                        {!reason.trim() && <p className="text-[12px] text-[#A32D2D] mt-1">Reason is required.</p>}
                        <div className="flex gap-3 mt-4">
                            <button onClick={closeModal} className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">Cancel</button>
                            <button onClick={handleReject} disabled={actioning || !reason.trim()}
                                className="flex-1 py-2.5 bg-[#A32D2D] hover:bg-[#791F1F] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60">
                                {actioning ? 'Rejecting…' : 'Yes, reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel modal */}
            {modal === 'cancel' && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] p-6">
                        <h2 className="text-[17px] font-bold text-[#344054] mb-1">Cancel registration?</h2>
                        <p className="text-[13px] text-[#5f5e5a] mb-4">Provide a reason — this will be sent to <strong>{participant.first_name}</strong>.</p>
                        <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g. Registration has been canceled due to duplicate submission."
                            className="w-full p-2.5 border border-[#d0cec6] rounded-md text-[13.5px] focus:outline-none focus:border-[#6B21A8] resize-none" />
                        {!reason.trim() && <p className="text-[12px] text-[#6B21A8] mt-1">Reason is required.</p>}
                        <div className="flex gap-3 mt-4">
                            <button onClick={closeModal} className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">Cancel</button>
                            <button onClick={handleCancel} disabled={actioning || !reason.trim()}
                                className="flex-1 py-2.5 bg-[#6B21A8] hover:bg-[#4C1D95] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60">
                                {actioning ? 'Canceling…' : 'Yes, cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
