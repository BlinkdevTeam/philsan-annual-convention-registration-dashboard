// src/components/PrintExhibitors.jsx
// 39th Annual Convention: prints "EXHIBITOR" strips one after another on
// continuous paper (Phomemo), with dashed cut lines between them.
// Same font, cut lines and printer DPI as the participant QR labels.
import { useState } from 'react';
import {
  LABEL_MM,
  INNER_MM,
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
const STRIP_W_MM = LABEL_MM;   // 70 mm paper width
const STRIP_H_MM = 17.5;       // height of one EXHIBITOR strip
// Width the word may take up across the 70 mm paper. Lower = smaller word, more side margin.
const TEXT_WIDTH_MM = 52;
const MAX_COUNT = 200;

// One strip: the word centred, a dashed cut line along the top,
// and also along the bottom when it is the last strip.
function drawStripCanvas(isLast) {
  const px = (mm) => Math.round(mm * MM_TO_PX);
  const canvas = document.createElement('canvas');
  canvas.width = px(STRIP_W_MM);
  canvas.height = px(STRIP_H_MM);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const lw = Math.max(1, px(CUT_LINE_MM));
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = lw;
  ctx.setLineDash([px(CUT_DASH_MM), px(CUT_GAP_MM)]);
  const lines = isLast ? [lw / 2, canvas.height - lw / 2] : [lw / 2];
  lines.forEach((y) => {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Largest size where the word fits inside TEXT_WIDTH_MM and the strip height
  const sizeMm = Math.min(STRIP_H_MM * 0.75, Math.min(TEXT_WIDTH_MM, INNER_MM) / measureEm(TEXT));
  ctx.fillStyle = '#1d1b16';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${WEIGHT} ${px(sizeMm)}px ${FONT}`;
  ctx.fillText(TEXT, canvas.width / 2, canvas.height / 2);
  return canvas;
}

export default function PrintExhibitors() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    const answer = window.prompt('How many EXHIBITOR strips do you want to print?', '20');
    if (answer === null) return;
    const count = parseInt(answer, 10);
    if (!Number.isFinite(count) || count < 1 || count > MAX_COUNT) {
      window.alert(`Please enter a number from 1 to ${MAX_COUNT}.`);
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
      const stripPng = drawStripCanvas(false).toDataURL('image/png');
      const lastPng = drawStripCanvas(true).toDataURL('image/png');
      const strips = Array.from({ length: count }, (_, i) =>
        `<img src="${i === count - 1 ? lastPng : stripPng}" alt="EXHIBITOR">`
      ).join('');
      const totalH = +(count * STRIP_H_MM).toFixed(2);

      win.document.open();
      win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Exhibitor strips (${count})</title>
<style>
  /* One continuous page as long as all the strips together */
  @page { size: ${STRIP_W_MM}mm ${totalH}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .roll { width: ${STRIP_W_MM}mm; height: ${totalH}mm; overflow: hidden; }
  .roll img { display: block; width: ${STRIP_W_MM}mm; height: ${STRIP_H_MM}mm; }
  @media screen { body { background: #eee; padding: 12px; } .roll { background: #fff; margin: 0 auto; box-shadow: 0 1px 4px rgba(0,0,0,.2); } }
</style></head>
<body><div class="roll">${strips}</div>
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