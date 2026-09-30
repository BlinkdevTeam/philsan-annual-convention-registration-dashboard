// Shared QR label format — used by ParticipantQR (single label) and
// DownloadAllQR (ZIP of every label). Change the layout HERE and both follow.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { QRCodeCanvas } from 'qrcode.react';

// ─── Sheet geometry (all in millimetres) ────────────────────────────────
// The sheet is 70 x 80 mm: a 70 x 70 mm label with no blank extension above it
// and a 10 mm blank extension below it. Cut lines mark the label edges.
export const LABEL_MM = 70;
export const EXT_TOP_MM = 0;                         // blank extension above the label
export const EXT_BOTTOM_MM = 0;                      // blank extension below the label
export const SHEET_W_MM = LABEL_MM;
export const SHEET_H_MM = EXT_TOP_MM + LABEL_MM + EXT_BOTTOM_MM;

export const PAD_MM = 4;
export const INNER_MM = LABEL_MM - PAD_MM * 2;
export const QR_MM = 25;
export const GAP_MM = 2;                             // gap above the name
export const COMPANY_MT_MM = (15 * 25.4) / 96;       // space above company (was 20px)
export const COMPANY_MB_MM = (0 * 25.4) / 96;        // space below company (was 10px)

export const NAME_MAX_MM = 10;
export const NAME_MIN_MM = 3;
export const NAME_LINE_H = 1.1;
export const COMPANY_MAX_MM = 3.8;
export const COMPANY_MIN_MM = 2;
export const COMPANY_LINE_H = 1.15;

// Cut line style (dashed "trace" line)
export const CUT_LINE_MM = 0.3;
export const CUT_DASH_MM = 2;
export const CUT_GAP_MM = 1.2;

// Printer's native resolution — used for the exported PNG.
export const PRINT_DPI = 203;
export const MM_TO_PX = PRINT_DPI / 25.4;

// Montserrat Bold everywhere (measuring, screen, print, PNG export).
export const FONT = "'Montserrat', Arial, Helvetica, sans-serif";
export const WEIGHT = 700;            // name: Montserrat Bold
export const W_COMPANY = 400;         // company: Montserrat Regular
export const COMPANY_MAX_LINES = 2;   // company wraps onto up to 2 lines

// Souvenir badge shown in the center of the QR code
export const BADGE_W = 0.12;   // badge width as a fraction of the QR size
export const BADGE_H = 0.12;   // square, since it holds a single letter

// Loads Montserrat Bold + Regular from /public/fonts once. Falls back to Arial if missing.
let fontPromise = null;
export function loadMontserrat() {
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
export function measureEm(text, weight = WEIGHT) {
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
    const clean = (text ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
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
export function computeLayout(participant) {
    const company = fitCompany(participant.company, INNER_MM);
    const companyH = company.lines.length * company.size * COMPANY_LINE_H;
    const companyBlock = company.lines.length ? COMPANY_MT_MM + companyH + COMPANY_MB_MM : 0;
    const nameMaxH = INNER_MM - GAP_MM - companyBlock - QR_MM - COMPANY_MT_MM;
    const name = fitName([participant.first_name, participant.last_name], INNER_MM, nameMaxH);
    return { name, company, companyH, nameMaxH };
}

export function souvenirLabelFor(value) {
    const v = String(value ?? '').trim().toLowerCase();
    if (v.includes('digital')) return 'D';
    if (v.includes('print')) return 'P';
    return ''; // "no" or empty -> nothing
}

// Renders the letter to a small white square PNG so QRCode can excavate the modules behind it
export function makeBadge(label) {
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

export function badgeSettings(src, qrSize) {
    if (!src) return undefined;
    return { src, width: qrSize * BADGE_W, height: qrSize * BADGE_H, excavate: true };
}

// ─── PNG export ─────────────────────────────────────────────────────────
// Draws the full label onto a canvas at 203 dpi. `qrCanvas` is a 512px
// QRCodeCanvas (the hidden one on the single page, or one from renderQrCanvas).
export function drawLabelCanvas(participant, qrCanvas) {
    const { name, company, companyH } = computeLayout(participant);
    const px = (mm) => Math.round(mm * MM_TO_PX);

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

    ctx.save();
    ctx.translate(0, px(EXT_TOP_MM));

    const hasCompany = company.lines.length > 0;
    const companyTop = LABEL_MM - PAD_MM - (hasCompany ? COMPANY_MB_MM : 0) - companyH;
    const qrTop = hasCompany ? companyTop - COMPANY_MT_MM - QR_MM : LABEL_MM - PAD_MM - QR_MM;
    const nameAreaTop = PAD_MM + GAP_MM;
    const nameAreaBottom = qrTop - COMPANY_MT_MM;
    const nameAreaH = nameAreaBottom - nameAreaTop;

    // QR — centered below the name
    if (qrCanvas) {
        ctx.drawImage(qrCanvas, px((LABEL_MM - QR_MM) / 2), px(qrTop), px(QR_MM), px(QR_MM));
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
    return canvas;
}

// Renders the exact same QRCodeCanvas the single page uses (same size, level,
// badge) off-screen and returns a copy of it. Used for bulk export.
export async function renderQrCanvas(participant) {
    const label = souvenirLabelFor(participant.souvenir);
    const badgeSrc = label ? makeBadge(label) : null;

    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-99999px;top:0;';
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
        let el = null;
        flushSync(() => {
            root.render(
                <QRCodeCanvas
                    ref={(node) => { el = node; }}
                    value={participant.ticket_token}
                    size={512}
                    level={badgeSrc ? 'H' : 'M'}
                    includeMargin={false}
                    imageSettings={badgeSettings(badgeSrc, 512)}
                />
            );
        });

        if (badgeSrc) {
            // wait for the badge image to load and be painted into the QR
            const img = host.querySelector('img');
            if (img && !img.complete) {
                await new Promise((res) => {
                    img.addEventListener('load', res, { once: true });
                    img.addEventListener('error', res, { once: true });
                });
            }
            for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
        }

        const copy = document.createElement('canvas');
        copy.width = el.width;
        copy.height = el.height;
        copy.getContext('2d').drawImage(el, 0, 0);
        return copy;
    } finally {
        root.unmount();
        host.remove();
    }
}
