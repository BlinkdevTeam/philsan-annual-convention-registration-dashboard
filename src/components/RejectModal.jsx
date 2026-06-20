import { useState } from 'react';

export default function RejectModal({ participant, onCancel, onConfirm }) {
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function handleConfirm() {
        if (!reason.trim()) return;
        setSubmitting(true);
        await onConfirm(reason.trim());
        setSubmitting(false);
    }

    return (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-[420px] p-6">
                <p className="text-[16px] font-bold text-[#16572A] mb-1">
                    Reject registration
                </p>
                <p className="text-[13px] text-[#5f5e5a] mb-4">
                    {participant.first_name} {participant.last_name} will receive an
                    email with this reason and a link to try again.
                </p>

                <label htmlFor="reason" className="text-[12.5px] text-[#344054] block mb-1">
                    Reason for rejection
                </label>
                <textarea
                    id="reason"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Proof of payment image is unreadable"
                    className="w-full p-2.5 rounded-md border border-[#339544] text-[14px] mb-4 resize-none"
                />

                <div className="flex gap-3 justify-end">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={submitting}
                        className="px-4 py-2 rounded-md text-[13.5px] text-[#344054] border border-[#e5e3da]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!reason.trim() || submitting}
                        className="px-4 py-2 rounded-md text-[13.5px] font-medium text-white bg-[#A32D2D] disabled:opacity-50"
                    >
                        {submitting ? 'Rejecting…' : 'Confirm rejection'}
                    </button>
                </div>
            </div>
        </div>
    );
}
