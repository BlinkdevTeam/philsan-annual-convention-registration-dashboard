import { useEffect, useState, useRef, useMemo  } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';

import {
    SHEET_W_MM, SHEET_H_MM, EXT_TOP_MM, LABEL_MM, PAD_MM, QR_MM, COMPANY_MT_MM, COMPANY_MB_MM,
    NAME_LINE_H, COMPANY_LINE_H, CUT_LINE_MM, FONT, WEIGHT, W_COMPANY,
    loadMontserrat, computeLayout, souvenirLabelFor, makeBadge, badgeSettings, drawLabelCanvas,
} from '../lib/qrLabel';

export default function ParticipantQR() {
    const { id } = useParams();
    const navigate = useNavigate();
    const hiddenQrRef = useRef(null);

    const [participant, setParticipant] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [confirmPrintOpen, setConfirmPrintOpen] = useState(false);
    const [fontReady, setFontReady] = useState(false);

    const souvenirLabel = useMemo(
    () => souvenirLabelFor(participant?.souvenir),
    [participant]
);

// fontReady is a dependency so the badge is redrawn once Montserrat has loaded
const badgeSrc = useMemo(
    () => (souvenirLabel ? makeBadge(souvenirLabel) : null),
    [souvenirLabel, fontReady]
);

    // Load Montserrat, then re-render so the auto-fit re-measures with it.
    useEffect(() => {
        loadMontserrat().then(() => setFontReady(true));
    }, []);

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

    function handlePrint() {
        // `afterprint` fires for both Print and Cancel, so we ask the user
        // to confirm once the dialog closes to keep the count accurate.
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
        await loadMontserrat(); // make sure the font is ready before measuring/drawing

        const { error: countError } = await supabase.rpc('increment_qr_print_count', {
            p_id: participant.id,
        });
        if (!countError) {
            setParticipant((prev) => ({
                ...prev,
                qr_print_count: (prev.qr_print_count ?? 0) + 1,
            }));
        }

        const canvas = drawLabelCanvas(participant, hiddenQrRef.current);

        const link = document.createElement('a');
        const safeName = `${participant.first_name}-${participant.last_name}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-');
        link.href = canvas.toDataURL('image/png');
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

    // fontReady is referenced so the layout is recomputed once Montserrat loads
    void fontReady;
    const { name, company } = computeLayout(participant);

    const cutLineStyle = {
        position: 'absolute',
        left: 0,
        width: '100%',
        height: 0,
        borderTop: `${CUT_LINE_MM}mm dashed #000`,
    };

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

            {/* Hidden high-res QR source used only for the PNG export */}
            <div className="no-print" style={{ position: 'fixed', left: '-9999px', top: 0 }}>
               <QRCodeCanvas
    ref={hiddenQrRef}
    value={participant.ticket_token}
    size={512}
    level={badgeSrc ? 'H' : 'M'}
    includeMargin={false}
    imageSettings={badgeSettings(badgeSrc, 512)}
/>
            </div>

            {participant.reg_status !== 'approved' && (
                <div className="no-print w-full max-w-[420px] bg-[#FAEEDA] text-[#854F0B] text-[12.5px] rounded-md px-4 py-2.5 mb-4">
                    Note: this participant's status is <strong>{participant.reg_status}</strong>,
                    not approved. Their QR code will still scan, but double-check this is intended.
                </div>
            )}

            {/* Printable sheet — 70mm x 80mm (70mm label + 10mm blank below) */}
            <div
                id="qr-print-card"
                className="bg-white shadow-md"
                style={{
                    position: 'relative',
                    width: `${SHEET_W_MM}mm`,
                    height: `${SHEET_H_MM}mm`,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    fontFamily: FONT,
                    color: '#1d1b16',
                }}
            >
                {/* Cut lines at the top and bottom edge of the label */}
                <div style={{ ...cutLineStyle, top: `${EXT_TOP_MM}mm` }} />
                <div style={{ ...cutLineStyle, top: `${EXT_TOP_MM + LABEL_MM}mm` }} />

                {/* The actual 70 x 70 mm label */}
                <div
                    style={{
                        position: 'absolute',
                        top: `${EXT_TOP_MM}mm`,
                        left: 0,
                        width: `${LABEL_MM}mm`,
                        height: `${LABEL_MM}mm`,
                        padding: `${PAD_MM}mm`,
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        overflow: 'hidden',
                    }}
                >
                    {/* Name — font size chosen automatically to fit */}
                    <div
                        style={{
                            flex: 1,
                            minHeight: 0,
                            width: '100%',
                            // marginTop: `${GAP_MM}mm`,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            textAlign: 'center',
                        }}
                    >
                        {name.lines.map((line, i) => (
                            <div
                                key={i}
                                style={{
                                    fontSize: `${name.size}mm`,
                                    lineHeight: NAME_LINE_H,
                                    fontWeight: WEIGHT,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {line}
                            </div>
                        ))}
                    </div>

                    <QRCodeSVG
    value={participant.ticket_token}
    size={128}
    level={badgeSrc ? 'H' : 'M'}
    includeMargin={false}
    imageSettings={badgeSettings(badgeSrc, 128)}
    style={{ width: `${QR_MM}mm`, height: `${QR_MM}mm`, flexShrink: 0, marginTop: `${COMPANY_MT_MM}mm` }}
/>

                    {company.lines.length > 0 && (
                        <div
                            style={{
                                marginTop: `${COMPANY_MT_MM}mm`,
                                marginBottom: `${COMPANY_MB_MM}mm`,
                                width: '100%',
                                textAlign: 'center',
                                flexShrink: 0,
                            }}
                        >
                            {company.lines.map((line, i) => (
                                <div
                                    key={i}
                                    style={{
                                        fontSize: `${company.size}mm`,
                                        lineHeight: COMPANY_LINE_H,
                                        fontWeight: W_COMPANY,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {line}
                                </div>
                            ))}
                        </div>
                    )}

                </div>
            </div>

            <style>{`
                @page {
                    size: ${SHEET_W_MM}mm ${SHEET_H_MM}mm;
                    margin: 0;
                }
                @media print {
                    .no-print { display: none !important; }
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: ${SHEET_W_MM}mm;
                        height: ${SHEET_H_MM}mm;
                    }
                    .qr-page-root {
                        min-height: 0 !important;
                        height: ${SHEET_H_MM}mm !important;
                        width: ${SHEET_W_MM}mm !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        display: block !important;
                        background: white !important;
                        overflow: hidden;
                    }
                    #qr-print-card {
                        box-shadow: none !important;
                        margin: 0 !important;
                        break-inside: avoid;
                    }
                }
            `}</style>

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