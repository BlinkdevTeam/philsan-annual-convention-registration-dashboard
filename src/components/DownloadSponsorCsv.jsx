// src/components/DownloadSponsorCsv.jsx
// 39th Annual Convention (admin): downloads every participant under one sponsor as CSV.
// Usage: <DownloadSponsorCsv sponsorName={sponsor.name} />
import { useState } from 'react';
import { downloadParticipantsCsv } from '../lib/participantsCsv';

export default function DownloadSponsorCsv({ sponsorName }) {
    const [busy, setBusy] = useState(false);

    async function handleClick() {
        if (!sponsorName) return;
        setBusy(true);
        try {
            const today = new Date().toISOString().slice(0, 10);
            const safe = sponsorName.replace(/[\\/:*?"<>|]/g, ' ').trim();
            const n = await downloadParticipantsCsv({
                filters: { sponsor: sponsorName },
                filename: `${safe} participants ${today}.csv`,
            });
            if (n === 0) window.alert('This sponsor has no participants yet.');
        } catch (err) {
            window.alert('Could not download the file: ' + (err.message || err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={busy || !sponsorName}
            className="bg-[#16572A] text-white text-[13px] font-medium rounded-md px-4 py-2 hover:opacity-90 disabled:opacity-60"
        >
            {busy ? 'Preparing…' : 'Download participants (CSV)'}
        </button>
    );
}