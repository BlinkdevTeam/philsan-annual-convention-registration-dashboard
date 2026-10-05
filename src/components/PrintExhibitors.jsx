// src/components/PrintExhibitors.jsx
// 39th Annual Convention: prints plain "EXHIBITOR" labels in the same 70 x 70 mm
// format as the participant QR labels (same font, cut lines and printer DPI),
// without QR code or company.
import { useState } from 'react';
import {
  LABEL_MM,
  PAD_MM,
  INNER_MM,
  SHEET_W_MM,
  SHEET_H_MM,
  EXT_TOP_MM,
  NAME_MAX_MM,
  CUT_LINE_MM,
  CUT_DASH_MM,
  CUT_GAP_MM,
  MM_TO_PX,
  FONT,
  WEIGHT,
  measureEm,
  loadMontserrat,
} from '../lib/qrLabel';

const TEXT = 'EXHIBITOR';
const MAX_SIZE_MM = Math.max(NAME_MAX_MM, 12); // as large as fits the label width

// Same canvas approach as drawLabelCanvas, with only the word centred on the label
function drawExhibitorCanvas() {
  const px = (mm) => Math.round(mm * MM_TO_PX);
  const canvas = document.createElement('canvas');
  canvas.width = px(SHEET_W_MM);
  canvas.height = px(SHEET_H_MM);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Dashed cut lines at the top and bottom edge of the label (same as participant labels)
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

  // Largest size where the word fits inside the padded width
  const sizeMm = Math.min(MAX_SIZE_MM, INNER_MM / measureEm(TEXT));
  ctx.fillStyle = '#1d1b16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${WEIGHT} ${px(sizeMm)}px ${FONT}`;
  ctx.fillText(TEXT, canvas.width / 2, px(EXT_TOP_MM + LABEL_MM / 2));
  return canvas;
}

export default function PrintExhibitors() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const answer = window.prompt('How many EXHIBITOR labels do you want to print?', '10');
    if (answer === null) return;
    const count = parseInt(answer, 10);
    if (!Number.isFinite(count) || count < 1 || count > 500) {
      window.alert('Please enter a number from 1 to 500.');
      return;
    }

    // Open the print window right away (inside the click) so it isn't blocked as a popup
    const win = window.open('', '_blank');
    if (!win) {
      window.alert('Please allow pop-ups for this site to print the labels.');
      return;
    }
    win.document.write('<p style="font-family:sans-serif;padding:16px">Preparing labels…</p>');

    setBusy(true);
    try {
      await loadMontserrat();
      await document.fonts.ready;
      const png = drawExhibitorCanvas().toDataURL('image/png');
      const pages = Array.from({ length: count }, () => `<div class="page"><img src="${png}" alt="EXHIBITOR"></div>`).join('');

      win.document.open();
      win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Exhibitor labels (${count})</title>
<style>
  @page { size: ${SHEET_W_MM}mm ${SHEET_H_MM}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { width: ${SHEET_W_MM}mm; height: ${SHEET_H_MM}mm; page-break-after: always; break-after: page; overflow: hidden; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page img { display: block; width: ${SHEET_W_MM}mm; height: ${SHEET_H_MM}mm; }
  @media screen { body { background: #eee; padding: 12px; } .page { background: #fff; margin: 0 auto 12px; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
</style></head>
<body>${pages}
<script>
  var imgs = document.images, left = imgs.length;
  function go() { setTimeout(function () { window.focus(); window.print(); }, 200); }
  if (!left) go();
  for (var i = 0; i < imgs.length; i++) {
    if (imgs[i].complete) { if (--left === 0) go(); }
    else imgs[i].onload = imgs[i].onerror = function () { if (--left === 0) go(); };
  }
</script>
</body></html>`);
      win.document.close();
    } catch (err) {
      win.close();
      window.alert('Could not prepare the labels: ' + err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="text-[11.5px] text-[#98a2b3] hover:text-[#16572A] underline disabled:opacity-60"
    >
      {busy ? 'Preparing…' : 'Print exhibitors'}
    </button>
  );
}