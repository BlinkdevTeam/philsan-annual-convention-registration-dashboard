import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';

// Printer's native resolution — used to size the exported PNG so it prints
// at the exact physical dimensions on the Phomemo label printer.
const PRINT_DPI = 203;
const CM_TO_PX = PRINT_DPI / 2.54;
const PX96_TO_PX = PRINT_DPI / 96; // converts a CSS px (96dpi) value to print-DPI px

export default function ParticipantQR() {
    const { id } = useParams();
    const navigate = useNavigate();
    const hiddenQrRef = useRef(null);

    const [participant, setParticipant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        async function fetchParticipant() {
            setLoading(true);
            setError('');

            const { data, error } = await supabase
                .from('participants')
                .select('*')
                .eq('id', id)
                .single();

            if (error || !data) {
                setError('Participant not found.');
            } else {
                setParticipant(data);
            }
            setLoading(false);
        }

        fetchParticipant();
    }, [id]);

    const [confirmPrintOpen, setConfirmPrintOpen] = useState(false);

    function handlePrint() {
        // Browsers do not expose whether the user clicked "Print" or
        // "Cancel" in the native dialog — `afterprint` fires for both,
        // indistinguishably, in every browser. The only accurate way to
        // count actual prints is to ask the person directly once the
        // dialog has closed.
        function askToConfirm() {
            window.removeEventListener('afterprint', askToConfirm);
            setConfirmPrintOpen(true);
        }

        window.addEventListener('afterprint', askToConfirm);
        window.print();
    }

    async function confirmPrintSucceeded() {
        setConfirmPrintOpen(false);

        const { error } = await supabase.rpc('increment_qr_print_count', {
            p_id: participant.id,
        });

        if (!error) {
            setParticipant((prev) => ({
                ...prev,
                qr_print_count: (prev.qr_print_count ?? 0) + 1,
            }));
        } else {
            console.error('Failed to record print count:', error);
        }
    }

    async function handleDownloadForLabelife() {
        setDownloading(true);

        // Count this as a print attempt too, same as the browser Print button.
        const { error: countError } = await supabase.rpc('increment_qr_print_count', {
            p_id: participant.id,
        });
        if (!countError) {
            setParticipant((prev) => ({
                ...prev,
                qr_print_count: (prev.qr_print_count ?? 0) + 1,
            }));
        }

        // Card geometry — mirrors the on-screen layout exactly: QR + name
        // sit in a horizontal row, company name centered underneath.
        const cardW = Math.round(7 * CM_TO_PX);
        const cardH = Math.round(4 * CM_TO_PX);
        const qrSize = Math.round(1.8 * CM_TO_PX);
        const rowGap = Math.round(0.2 * CM_TO_PX); // gap between QR and names
        const columnGap = Math.round(8 * PX96_TO_PX); // gap between row and company (CSS gap-[8px])
        const nameFontPx = Math.round(1 * CM_TO_PX);
        const companyFontPx = Math.round(0.32 * CM_TO_PX);
        const companyMarginTop = Math.round(0.12 * CM_TO_PX);

        const canvas = document.createElement('canvas');
        canvas.width = cardW;
        canvas.height = cardH;
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cardW, cardH);

        const nameFont = `800 ${nameFontPx}px Arial, sans-serif`;
        const companyFont = `700 ${companyFontPx}px Arial, sans-serif`;

        // Measure text
        ctx.font = nameFont;
        const firstNameWidth = ctx.measureText(participant.first_name ?? '').width;
        const lastNameWidth = ctx.measureText(participant.last_name ?? '').width;
        const namesBlockWidth = Math.max(firstNameWidth, lastNameWidth);

        ctx.font = companyFont;
        const companyWidth = displayCompany ? ctx.measureText(displayCompany).width : 0;

        const nameLineHeight = Math.round(nameFontPx * 1.05);
        const namesBlockHeight = nameLineHeight * 2;
        const rowHeight = Math.max(qrSize, namesBlockHeight);
        const rowWidth = qrSize + rowGap + namesBlockWidth;

        const companyLineHeight = Math.round(companyFontPx * 1.15);

        // Column = row + company, centered as one block within the card
        const colWidth = Math.max(rowWidth, companyWidth);
        const colHeight =
            rowHeight + (displayCompany ? columnGap + companyMarginTop + companyLineHeight : 0);

        const colStartX = Math.round((cardW - colWidth) / 2);
        const colStartY = Math.round((cardH - colHeight) / 2);

        // Row (QR + names), centered horizontally within the column width
        const rowX = colStartX + Math.round((colWidth - rowWidth) / 2);
        const rowY = colStartY;

        // QR — vertically centered within the row's height
        const qrX = rowX;
        const qrY = rowY + Math.round((rowHeight - qrSize) / 2);
        if (hiddenQrRef.current) {
            ctx.drawImage(hiddenQrRef.current, qrX, qrY, qrSize, qrSize);
        }

        // Names — vertically centered within the row's height, right after the QR
        const textX = qrX + qrSize + rowGap;
        const namesY = rowY + Math.round((rowHeight - namesBlockHeight) / 2);

        ctx.fillStyle = '#1d1b16';
        ctx.textBaseline = 'top';
        ctx.font = nameFont;
        ctx.fillText(participant.first_name ?? '', textX, namesY);
        ctx.fillText(participant.last_name ?? '', textX, namesY + nameLineHeight);

        // Company — centered horizontally within the column, below the row
        if (displayCompany) {
            const companyX = colStartX + Math.round((colWidth - companyWidth) / 2);
            const companyY = rowY + rowHeight + columnGap + companyMarginTop;
            ctx.font = companyFont;
            ctx.fillText(displayCompany, companyX, companyY);
        }

        // Trigger download
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        const safeName = `${participant.first_name}-${participant.last_name}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
        link.href = dataUrl;
        link.download = `${safeName}-qr.png`;
        link.click();

        setDownloading(false);
    }

    if (loading) {
        return <div className="px-8 py-8 text-[13.5px] text-[#5f5e5a]">Loading…</div>;
    }

    if (error) {
        return <div className="px-8 py-8 text-[13.5px] text-[#A32D2D]">{error}</div>;
    }

    // Company name is capped at 30 characters (including spaces); anything
    // longer gets truncated with an ellipsis, matching the sticker design.
    function truncateCompany(company) {
        if (!company) return '';
        if (company.length <= 30) return company;
        return company.slice(0, 30).trimEnd() + '...';
    }

    const displayCompany = truncateCompany(participant.company);

    return (
        <div className="qr-page-root min-h-screen bg-[#f1efe8] flex flex-col items-center py-10 px-4">
            {/* Controls — hidden when printing */}
            <div className="no-print w-full max-w-[420px] flex items-center justify-between mb-6">
                <button
                    onClick={() => navigate(`/participants/${id}`)}
                    className="text-[13px] text-[#16572A] hover:underline"
                >
                    ← Back
                </button>
                <div className="flex items-center gap-3">
                    <span className="text-[12px] text-[#5f5e5a]">
                        Printed {participant.qr_print_count ?? 0} time
                        {(participant.qr_print_count ?? 0) === 1 ? '' : 's'}
                    </span>
                    <button
                        onClick={handleDownloadForLabelife}
                        disabled={downloading}
                        className="px-4 py-2 border border-[#16572A] text-[#16572A] hover:bg-[#EAF3DE] text-[13.5px] font-medium rounded-md disabled:opacity-60"
                    >
                        {downloading ? 'Preparing…' : 'Download for Labelife'}
                    </button>
                    <button
                        onClick={handlePrint}
                        className="px-4 py-2 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md"
                    >
                        Print
                    </button>
                </div>
            </div>

            {/* Hidden high-res QR source used only for the PNG export — excluded from print
                so it can't be counted as a second page's content by the print engine. */}
            <div className="no-print" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
                <QRCodeCanvas
                    ref={hiddenQrRef}
                    value={participant.ticket_token}
                    size={512}
                    level="M"
                    includeMargin={false}
                />
            </div>

            {participant.reg_status !== 'approved' && (
                <div className="no-print w-full max-w-[420px] bg-[#FAEEDA] text-[#854F0B] text-[12.5px] rounded-md px-4 py-2.5 mb-4">
                    Note: this participant's status is <strong>{participant.reg_status}</strong>,
                    not approved. Their QR code will still scan, but double-check this is intended.
                </div>
            )}

            {/* Printable sticker card — sized to the loaded label stock (1.6in x 2.8in) */}
            <div
                id="qr-print-card"
                className="bg-white shadow-md flex items-center justify-center"
                style={{
                    width: '2.8in',
                    height: '1.6in',
                    padding: '0.12in',
                    boxSizing: 'border-box',
                    gap: '0.16in',
                }}
            >
                <div className="flex flex-col items-center gap-[8px]">
                    <div className="flex" style={{ gap: '0.2cm' }}>
                        <div style={{ flexShrink: 0, paddingTop: '8px' }}>
                            <QRCodeSVG
                                value={participant.ticket_token}
                                size={128}
                                level="M"
                                includeMargin={false}
                                style={{ width: '1.8cm', height: '1.8cm' }}
                            />
                        </div>

                        <div className="flex flex-col justify-center min-w-0">
                            <p
                                className="font-extrabold text-[#1d1b16] leading-[1.05]"
                                style={{ fontSize: '1cm' }}
                            >
                                {participant.first_name}
                            </p>
                            <p
                                className="font-extrabold text-[#1d1b16] leading-[1.05]"
                                style={{ fontSize: '1cm' }}
                            >
                                {participant.last_name}
                            </p>
                        </div>
                    </div>

                    <div>
                        {displayCompany && (
                            <p
                                className="font-bold text-[#1d1b16] leading-[1.15]"
                                style={{ fontSize: '0.32cm', marginTop: '0.12cm' }}
                            >
                                {displayCompany}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @page {
                    size: 2.8in 1.6in;
                    margin: 0;
                }
                @media print {
                    .no-print { display: none !important; }
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 2.8in;
                        height: 1.6in;
                    }
                    .qr-page-root {
                        min-height: 0 !important;
                        height: 1.6in !important;
                        width: 2.8in !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: hidden;
                    }
                    #qr-print-card {
                        box-shadow: none !important;
                        margin: 0 !important;
                    }
                }
            `}</style>

            {/* Confirm the label actually printed — browsers give no way to
                detect this automatically, so we ask directly. */}
            {confirmPrintOpen && (
                <div
                    className="no-print fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setConfirmPrintOpen(false); }}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[380px] p-6">
                        <h2 className="text-[16px] font-bold text-[#16572A] mb-2">
                            Did the label print?
                        </h2>
                        <p className="text-[13px] text-[#5f5e5a] mb-5 leading-[1.6]">
                            Confirm only if the sticker actually came out of the printer.
                            This is how we keep the print count accurate.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmPrintOpen(false)}
                                className="flex-1 py-2.5 border border-[#d0cec6] rounded-md text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]"
                            >
                                No, it didn't print
                            </button>
                            <button
                                onClick={confirmPrintSucceeded}
                                className="flex-1 py-2.5 bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium rounded-md"
                            >
                                Yes, it printed
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}