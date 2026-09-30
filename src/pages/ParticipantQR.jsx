import { useEffect, useState, useRef, useMemo  } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';

// ─── Sheet geometry (all in millimetres) ────────────────────────────────
// The sheet is 70 x 80 mm: a 70 x 70 mm label with no blank extension above it
// and a 10 mm blank extension below it. Cut lines mark the label edges.
const LABEL_MM = 70;
const EXT_TOP_MM = 0;                         // blank extension above the label
const EXT_BOTTOM_MM = 10;                     // blank extension below the label
const SHEET_W_MM = LABEL_MM;
const SHEET_H_MM = EXT_TOP_MM + LABEL_MM + EXT_BOTTOM_MM;

const PAD_MM = 4;
const INNER_MM = LABEL_MM - PAD_MM * 2;
const QR_MM = 25;
const GAP_MM = 2;                             // gap above the name
const COMPANY_MT_MM = (15 * 25.4) / 96;       // space above company (was 20px)
const COMPANY_MB_MM = (0 * 25.4) / 96;        // space below company (was 10px)

const NAME_MAX_MM = 10;
const NAME_MIN_MM = 3;
const NAME_LINE_H = 1.1;
const COMPANY_MAX_MM = 3.8;
const COMPANY_MIN_MM = 2;
const COMPANY_LINE_H = 1.15;

// Cut line style (dashed "trace" line)
const CUT_LINE_MM = 0.3;
const CUT_DASH_MM = 2;
const CUT_GAP_MM = 1.2;

// Printer's native resolution — used for the exported PNG.
const PRINT_DPI = 203;
const MM_TO_PX = PRINT_DPI / 25.4;

// Montserrat Bold everywhere (measuring, screen, print, PNG export).
const FONT = "'Montserrat', Arial, Helvetica, sans-serif";
const WEIGHT = 700;            // name: Montserrat Bold
const W_COMPANY = 400;         // company: Montserrat Regular
const COMPANY_MAX_LINES = 2;   // company wraps onto up to 2 lines

// Souvenir badge shown in the center of the QR code
const BADGE_W = 0.12;   // badge width as a fraction of the QR size
const BADGE_H = 0.12;   // square, since it holds a single letter

// Loads Montserrat Bold + Regular from /public/fonts once. Falls back to Arial if missing.
let fontPromise = null;
function loadMontserrat() {
    if (!fontPromise) {
        const faces = [
            new FontFace('Montserrat', 'url(/fonts/Montserrat-Bold.ttf)', { weight: String(WEIGHT) }),
            new FontFace('Montserrat', 'url(/fonts/Montserrat-Regular.ttf)', { weight: String(W_COMPANY) }),
        ];
        fontPromise = Promise.all(
            faces.map((f) =>
                f.load().then((loaded) => {
                    document.fonts.add(loaded);
                    return true;
                })
            )
        ).catch(() => false);
    }
    return fontPromise;
}

// ─── Auto text sizing ───────────────────────────────────────────────────
let measureCtx = null;
function measureEm(text, weight = WEIGHT) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} 100px ${FONT}`;
    return measureCtx.measureText(text).width / 100; // width in "em"
}

function wrapWords(text, sizeMm, maxWidthMm, weight = WEIGHT) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (measureEm(test, weight) * sizeMm <= maxWidthMm || !line) {
            line = test;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// First and last name are separate blocks; each wraps on its own.
// Picks the largest font size where everything fits inside the given box.
function fitName(paragraphs, maxWidthMm, maxHeightMm) {
    const parts = paragraphs.map((p) => (p ?? '').trim().toUpperCase()).filter(Boolean);
    if (parts.length === 0) return { size: NAME_MAX_MM, lines: [] };

    let last = null;
    for (let size = NAME_MAX_MM; size >= NAME_MIN_MM; size -= 0.25) {
        const lines = parts.flatMap((p) => wrapWords(p, size, maxWidthMm));
        last = { size, lines };
        const widest = Math.max(...lines.map((l) => measureEm(l) * size));
        if (widest <= maxWidthMm && lines.length * size * NAME_LINE_H <= maxHeightMm) {
            return last;
        }
    }
    return last;
}

// Full company name (never truncated). Wraps onto up to COMPANY_MAX_LINES lines
// and uses the largest size at which it fits.
function fitCompany(text, maxWidthMm) {
    const clean = (text ?? '').trim().replace(/\s+/g, ' ');
    if (!clean) return { size: 0, lines: [] };
    let last = null;
    for (let size = COMPANY_MAX_MM; size >= COMPANY_MIN_MM; size -= 0.1) {
        const lines = wrapWords(clean, size, maxWidthMm, W_COMPANY);
        last = { size, lines };
        const widest = Math.max(...lines.map((l) => measureEm(l, W_COMPANY) * size));
        if (widest <= maxWidthMm && lines.length <= COMPANY_MAX_LINES) return last;
    }
    return last;
}

// Layout (top to bottom): name, QR, company at the bottom.
function computeLayout(participant) {
    const company = fitCompany(participant.company, INNER_MM);
    const companyH = company.lines.length * company.size * COMPANY_LINE_H;
    const companyBlock = company.lines.length ? COMPANY_MT_MM + companyH + COMPANY_MB_MM : 0;
    const nameMaxH = INNER_MM - GAP_MM - companyBlock - QR_MM - COMPANY_MT_MM;
    const name = fitName([participant.first_name, participant.last_name], INNER_MM, nameMaxH);
    return { name, company, companyH, nameMaxH };
}

function souvenirLabelFor(value) {
    const v = String(value ?? '').trim().toLowerCase();
    if (v.includes('digital')) return 'D';
    if (v.includes('print')) return 'P';
    return ''; // "no" or empty -> nothing
}

// Renders the letter to a small white square PNG so QRCode can excavate the modules behind it
function makeBadge(label) {
    const S = 160; // square canvas
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, S, S);

    const size = Math.min(S * 0.9, (S - 30) / measureEm(label));
    ctx.fillStyle = '#000000';
    ctx.font = `${WEIGHT} ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, S / 2, S / 2 + size * 0.04);
    return c.toDataURL('image/png');
}

function badgeSettings(src, qrSize) {
    if (!src) return undefined;
    return { src, width: qrSize * BADGE_W, height: qrSize * BADGE_H, excavate: true };
}

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

        const { name, company, companyH } = computeLayout(participant);
        const px = (mm) => Math.round(mm * MM_TO_PX);

        // Canvas is the full 70 x 80 mm sheet
        const canvas = document.createElement('canvas');
        canvas.width = px(SHEET_W_MM);
        canvas.height = px(SHEET_H_MM);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Dashed cut lines at the top and bottom edge of the 70 x 70 label
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(1, px(CUT_LINE_MM));
        ctx.setLineDash([px(CUT_DASH_MM), px(CUT_GAP_MM)]);
        [EXT_TOP_MM, EXT_TOP_MM + LABEL_MM].forEach((yMm) => {
            ctx.beginPath();
            ctx.moveTo(0, px(yMm));
            ctx.lineTo(canvas.width, px(yMm));
            ctx.stroke();
        });
        ctx.setLineDash([]);

        // Everything below is drawn inside the 70 x 70 label area,
        // so shift the origin down by the top extension.
        ctx.save();
        ctx.translate(0, px(EXT_TOP_MM));

        // Positions mirror the on-screen layout (name, QR, company at the bottom)
        const hasCompany = company.lines.length > 0;
        const companyTop = LABEL_MM - PAD_MM - (hasCompany ? COMPANY_MB_MM : 0) - companyH;
        const qrTop = hasCompany
            ? companyTop - COMPANY_MT_MM - QR_MM
            : LABEL_MM - PAD_MM - QR_MM;
        const nameAreaTop = PAD_MM + GAP_MM;
        const nameAreaBottom = qrTop - COMPANY_MT_MM;
        const nameAreaH = nameAreaBottom - nameAreaTop;

        // QR — centered below the name
        if (hiddenQrRef.current) {
            ctx.drawImage(
                hiddenQrRef.current,
                px((LABEL_MM - QR_MM) / 2),
                px(qrTop),
                px(QR_MM),
                px(QR_MM)
            );
        }

        ctx.fillStyle = '#1d1b16';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Name — vertically centered in its area
        const nameBlockH = name.lines.length * name.size * NAME_LINE_H;
        const nameStart = nameAreaTop + (nameAreaH - nameBlockH) / 2;
        ctx.font = `${WEIGHT} ${px(name.size)}px ${FONT}`;
        name.lines.forEach((line, i) => {
            const y = nameStart + name.size * NAME_LINE_H * (i + 0.5);
            ctx.fillText(line, canvas.width / 2, px(y));
        });

        // Company — regular weight, up to 2 lines, below the QR
        if (hasCompany) {
            ctx.font = `${W_COMPANY} ${px(company.size)}px ${FONT}`;
            company.lines.forEach((line, i) => {
                const y = companyTop + company.size * COMPANY_LINE_H * (i + 0.5);
                ctx.fillText(line, canvas.width / 2, px(y));
            });
        }

        ctx.restore();

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