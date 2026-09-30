import { useState } from 'react';
import JSZip from 'jszip';
import { supabase } from '../lib/supabaseClient';
import { loadMontserrat, renderQrCanvas, drawLabelCanvas } from '../lib/qrLabel';

// Downloads approved participants' QR labels (same format as
// "Download for Labelife") as PNG files in one ZIP, sorted by last name.
//
//   <DownloadAllQR />                  every approved participant; print counts are NOT changed
//   <DownloadAllQR mode="unprinted" /> only approved participants whose QR was never printed or
//                                      downloaded (print count 0); they are then marked as printed,
//                                      so the next "unprinted" download skips them

async function fetchApproved() {
    const size = 1000; // Supabase returns max 1000 rows per request
    const rows = [];
    for (let from = 0; ; from += size) {
        const { data, error } = await supabase
            .from('participants')
            .select('id, first_name, last_name, company, souvenir, ticket_token, reg_status, qr_print_count')
            .eq('reg_status', 'approved')
            .order('last_name', { ascending: true })
            .order('first_name', { ascending: true })
            .range(from, from + size - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < size) break;
    }
    return rows.filter((p) => p.ticket_token);
}

const clean = (s) =>
    (s ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Ñ -> N, É -> E (file names that open everywhere)
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '') // characters Windows won't allow in file names
        .replace(/\s+/g, ' ')
        .toUpperCase();

const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, 'image/png'));

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Adds 1 to each participant's print count (same RPC the single label page uses),
// 10 at a time. Returns how many could not be marked.
async function markPrinted(ids, onProgress) {
    let failed = 0;
    for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const results = await Promise.all(
            batch.map((id) => supabase.rpc('increment_qr_print_count', { p_id: id }))
        );
        failed += results.filter((r) => r.error).length;
        onProgress(Math.min(i + 10, ids.length));
    }
    return failed;
}

export default function DownloadAllQR({ mode = 'all' }) {
    const unprintedOnly = mode === 'unprinted';
    const [progress, setProgress] = useState(null); // { done, total } while running
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    async function run() {
        setError('');
        setNotice('');
        setProgress({ done: 0, total: 0, stage: 'Loading participants…' });
        try {
            const [approved] = await Promise.all([fetchApproved(), loadMontserrat()]);
            const people = unprintedOnly ? approved.filter((p) => !(p.qr_print_count > 0)) : approved;

            if (!people.length) {
                setProgress(null);
                setNotice(
                    unprintedOnly
                        ? 'Nothing new to print — every approved participant already has a printed QR label.'
                        : 'No approved participants found.'
                );
                return;
            }

            if (
                unprintedOnly &&
                !window.confirm(
                    `Download ${people.length} QR label${people.length === 1 ? '' : 's'} that have not been printed yet?\n\n` +
                        'They will be marked as printed, so they will not be included next time.'
                )
            ) {
                setProgress(null);
                return;
            }

            const zip = new JSZip();
            const folder = zip.folder('QR Labels');
            const index = [['No.', 'Last Name', 'First Name', 'Company', 'Souvenir', 'File']];

            for (let i = 0; i < people.length; i++) {
                const p = people[i];
                const qr = await renderQrCanvas(p);
                const label = drawLabelCanvas(p, qr);
                const blob = await toBlob(label);

                const no = String(i + 1).padStart(4, '0');
                const file = `${no} - ${clean(p.last_name)}, ${clean(p.first_name)}.png`;

                folder.file(file, blob);
                index.push([i + 1, p.last_name, p.first_name, p.company, p.souvenir, file]);

                if (i % 5 === 0 || i === people.length - 1) {
                    setProgress({ done: i + 1, total: people.length, stage: 'Creating labels…' });
                    await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
                }
            }

            zip.file('index.csv', '﻿' + index.map((r) => r.map(csvCell).join(',')).join('\n'));

            setProgress((pr) => ({ ...pr, stage: 'Compressing ZIP…' }));
            const content = await zip.generateAsync({ type: 'blob' }, (meta) =>
                setProgress((pr) => ({ ...pr, stage: `Compressing ZIP… ${Math.round(meta.percent)}%` }))
            );

            const a = document.createElement('a');
            a.href = URL.createObjectURL(content);
            const d = new Date(); // local time, e.g. 2026-09-30_2151
            const pad = (n) => String(n).padStart(2, '0');
            const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
            a.download = unprintedOnly
                ? `PHILSAN-39th-QR-Labels-NEW-${stamp}.zip`
                : `PHILSAN-39th-QR-Labels-ALL-${stamp}.zip`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);

            if (unprintedOnly) {
                const ids = people.map((p) => p.id);
                const failed = await markPrinted(ids, (done) =>
                    setProgress({ done, total: ids.length, stage: 'Marking as printed…' })
                );
                setNotice(
                    failed
                        ? `Downloaded ${people.length} labels, but ${failed} could not be marked as printed. Please check before downloading again.`
                        : `Downloaded ${people.length} new label${people.length === 1 ? '' : 's'} and marked them as printed.`
                );
            } else {
                setNotice(`Downloaded ${people.length} labels. Print counts were not changed.`);
            }
            setProgress(null);
        } catch (err) {
            console.error(err);
            setError(err.message || 'Could not create the ZIP.');
            setProgress(null);
        }
    }

    const busy = !!progress;
    const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <div className="inline-flex flex-col items-start gap-1.5">
            <button
                onClick={run}
                disabled={busy}
                className="px-4 py-2 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md disabled:opacity-60 disabled:hover:bg-[#16572A]"
            >
                {busy
                    ? progress.total
                        ? `${progress.stage === 'Marking as printed…' ? 'Marking' : 'Creating'} ${progress.done} of ${progress.total}…`
                        : progress.stage
                    : unprintedOnly
                        ? 'Download unprinted QR codes (ZIP)'
                        : 'Download all QR codes (ZIP)'}
            </button>
            {busy && progress.total > 0 && (
                <div className="w-full min-w-[220px]">
                    <div className="h-1.5 bg-[#EAF3DE] rounded-full overflow-hidden">
                        <div className="h-full bg-[#16572A] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[11.5px] text-[#5f5e5a] mt-1">{progress.stage} Keep this tab open.</p>
                </div>
            )}
            {notice && !busy && <p className="text-[12.5px] text-[#5f5e5a]">{notice}</p>}
            {error && <p className="text-[12.5px] text-[#A32D2D]">{error}</p>}
        </div>
    );
}