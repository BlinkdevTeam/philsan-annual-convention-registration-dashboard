import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function TransferModal({ participant, onCancel, onConfirm }) {
    const [sponsors, setSponsors] = useState([]);
    const [selected, setSelected] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        supabase.from('sponsors').select('name').order('name').then(({ data }) => {
            setSponsors(data ?? []);
        });
    }, []);

    async function handleConfirm() {
        if (!selected) return;
        setSubmitting(true);
        await onConfirm(selected);
        setSubmitting(false);
    }

    return (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-lg shadow-lg w-full max-w-[380px] p-6">
                <p className="text-[16px] font-bold text-[#16572A] mb-1">Transfer participant</p>
                <p className="text-[13px] text-[#5f5e5a] mb-4">
                    Move <strong>{participant.first_name} {participant.last_name}</strong> to a different sponsor.
                </p>

                <label className="text-[12.5px] text-[#344054] block mb-1">Select sponsor</label>
                <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="w-full p-2.5 rounded-md border border-[#339544] text-[14px] mb-4"
                >
                    <option value="">— choose a sponsor —</option>
                    {sponsors.map(s => (
                        <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                </select>

                <div className="flex gap-3 justify-end">
                    <button onClick={onCancel} disabled={submitting}
                        className="px-4 py-2 rounded-md text-[13.5px] text-[#344054] border border-[#e5e3da]">
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={!selected || submitting}
                        className="px-4 py-2 rounded-md text-[13.5px] font-medium text-white bg-[#16572A] disabled:opacity-50">
                        {submitting ? 'Transferring…' : 'Confirm transfer'}
                    </button>
                </div>
            </div>
        </div>
    );
}