// Builds the PRC "Registration Overview" PDF: your designed cover page +
// generated analytics pages + the Summary Report notes.
//
// Everything is drawn as vector graphics with pdf-lib, so the charts stay sharp
// when printed.

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { EVENT } from './reportData.js';

// ---------------- page + palette ----------------
const W = 595.28;
const H = 841.89;
const M = 40; // side margin
const CW = W - M * 2;

const hex = (h) => {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const C = {
  green: hex('#1D773A'),
  heading: hex('#4F7F5E'),
  ink: hex('#2E2E2E'),
  muted: hex('#666666'),
  faint: hex('#9A9A9A'),
  border: hex('#CBD5E0'),
  grid: hex('#E7EBEF'),
  headerFill: hex('#EEF2F6'),
  gray: hex('#CBD5E0'), // de-emphasis segment (absent, onsite, no …)
  white: rgb(1, 1, 1),
  // ordinal ramp for Excellent → Poor (validated: monotone, light end >= 2:1)
  ramp: [hex('#14532B'), hex('#1D773A'), hex('#4E9C5F'), hex('#8BBF95')],
};

// ---------------- formatting ----------------
const num = (n) => Math.round(n).toLocaleString('en-US');
const pct1 = (n) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;
const pct0 = (n) => `${Math.round(n)}%`;
const shortDate = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// ---------------- drawing primitives (top-based y) ----------------
class Painter {
  constructor(doc, fonts) {
    this.doc = doc;
    this.f = fonts;
    this.page = null;
  }

  addPage() {
    this.page = this.doc.addPage([W, H]);
    return this.page;
  }

  w(text, font, size) {
    return font.widthOfTextAtSize(text, size);
  }

  text(str, x, top, { font = this.f.regular, size = 10, color = C.ink, align = 'left', maxW } = {}) {
    let s = String(str ?? '');
    if (maxW) s = this.truncate(s, font, size, maxW);
    let dx = x;
    const tw = this.w(s, font, size);
    if (align === 'center') dx = x - tw / 2;
    if (align === 'right') dx = x - tw;
    this.page.drawText(s, { x: dx, y: H - top - size * 0.8, size, font, color });
    return tw;
  }

  truncate(s, font, size, maxW) {
    if (this.w(s, font, size) <= maxW) return s;
    let t = s;
    while (t.length > 1 && this.w(t + '…', font, size) > maxW) t = t.slice(0, -1);
    return t.trimEnd() + '…';
  }

  wrap(str, font, size, maxW) {
    const words = String(str ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (this.w(test, font, size) <= maxW) line = test;
      else {
        if (line) lines.push(line);
        line = this.w(word, font, size) > maxW ? this.truncate(word, font, size, maxW) : word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  paragraph(str, x, top, maxW, { font = this.f.regular, size = 10, color = C.ink, lineGap = 1.45 } = {}) {
    const lines = this.wrap(str, font, size, maxW);
    lines.forEach((l, i) => this.text(l, x, top + i * size * lineGap, { font, size, color }));
    return lines.length * size * lineGap;
  }

  path(d, opts) {
    this.page.drawSvgPath(d, { x: 0, y: H, ...opts });
  }

  roundRect(x, top, w, h, r, { fill, border, borderWidth = 0.8 } = {}) {
    const b = top + h;
    const d = `M ${x + r} ${top} L ${x + w - r} ${top} Q ${x + w} ${top} ${x + w} ${top + r} L ${x + w} ${b - r} Q ${x + w} ${b} ${x + w - r} ${b} L ${x + r} ${b} Q ${x} ${b} ${x} ${b - r} L ${x} ${top + r} Q ${x} ${top} ${x + r} ${top} Z`;
    this.path(d, { color: fill, borderColor: border, borderWidth: border ? borderWidth : 0 });
  }

  // Horizontal bar: square at baseline (left), rounded data-end (right)
  hbar(x, top, w, h, color) {
    if (w <= 0) return;
    const r = Math.min(2.5, h / 2, w);
    const b = top + h;
    this.path(
      `M ${x} ${top} L ${x + w - r} ${top} Q ${x + w} ${top} ${x + w} ${top + r} L ${x + w} ${b - r} Q ${x + w} ${b} ${x + w - r} ${b} L ${x} ${b} Z`,
      { color }
    );
  }

  // Column: square at baseline (bottom), rounded top
  column(x, baseTop, w, h, color) {
    if (h <= 0) return;
    const r = Math.min(2.5, w / 2, h);
    const t = baseTop - h;
    this.path(
      `M ${x} ${baseTop} L ${x} ${t + r} Q ${x} ${t} ${x + r} ${t} L ${x + w - r} ${t} Q ${x + w} ${t} ${x + w} ${t + r} L ${x + w} ${baseTop} Z`,
      { color }
    );
  }

  hline(x1, x2, top, color = C.grid, thickness = 0.6) {
    this.page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color });
  }

  swatch(x, top, color, size = 7) {
    this.roundRect(x, top, size, size, 1.5, { fill: color });
  }
}

// ---------------- layout pieces ----------------
function pageHeader(p, title, subtitle) {
  p.text(title, M, 42, { font: p.f.semibold, size: 20, color: C.heading });
  const h = subtitle ? p.paragraph(subtitle, M, 70, CW, { size: 10.5, color: C.muted, lineGap: 1.4 }) : 0;
  return 70 + h + 16; // first content top
}

function footer(p, pageNo, generatedAt) {
  const top = H - 28;
  p.hline(M, W - M, top - 8, C.grid, 0.6);
  const date = generatedAt.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
  p.text(`${EVENT.name} · Registration Overview · Generated ${date}`, M, top, { size: 7.5, color: C.faint });
  p.text(`Page ${pageNo}`, W - M, top, { size: 7.5, color: C.faint, align: 'right' });
}

function card(p, x, top, w, h, title, note) {
  p.roundRect(x, top, w, h, 6, { fill: C.white, border: C.border });
  let y = top + 14;
  if (title) {
    const lines = p.wrap(title, p.f.semibold, 11, w - 28);
    lines.forEach((l, i) => p.text(l, x + 14, y + i * 14, { font: p.f.semibold, size: 11, color: C.ink }));
    y += lines.length * 14;
  }
  if (note) {
    p.text(note, x + 14, y + 2, { size: 8, color: C.muted, maxW: w - 28 });
    y += 13;
  }
  return { x: x + 14, top: y + 10, w: w - 28, h: top + h - (y + 10) - 12 };
}

function statCard(p, x, top, w, h, label, value, sub) {
  p.roundRect(x, top, w, h, 6, { fill: C.white, border: C.border });
  const lines = p.wrap(label, p.f.regular, 9, w - 16);
  const valueSize = h >= 76 ? 24 : 20;
  const block = lines.length * 12 + 6 + valueSize + (sub ? 12 : 0);
  let y = top + (h - block) / 2;
  lines.forEach((l, i) => p.text(l, x + w / 2, y + i * 12, { size: 9, color: C.ink, align: 'center' }));
  y += lines.length * 12 + 6;
  p.text(value, x + w / 2, y, { font: p.f.bold, size: valueSize, color: C.green, align: 'center' });
  if (sub) p.text(sub, x + w / 2, y + valueSize + 3, { size: 7.5, color: C.muted, align: 'center', maxW: w - 12 });
}

function noData(p, box, msg = 'No data yet') {
  p.text(msg, box.x + box.w / 2, box.top + box.h / 2 - 5, { size: 9, color: C.faint, align: 'center' });
}

// ---------------- charts ----------------
function hBarChart(p, box, items, { labelW = 110, fmt = num, max, color = C.green, maxBar = 11 } = {}) {
  if (!items.length || items.every((i) => !i.value)) return noData(p, box);
  const rowH = Math.min(22, box.h / items.length);
  const barH = Math.min(maxBar, rowH * 0.6);
  const valueW = Math.max(...items.map((i) => p.w(fmt(i.value), p.f.medium, 8.5))) + 6;
  const x0 = box.x + labelW;
  const span = box.w - labelW - valueW;
  const top0 = box.top + (box.h - rowH * items.length) / 2;
  const mx = max ?? Math.max(...items.map((i) => i.value));
  items.forEach((it, i) => {
    const rowTop = top0 + i * rowH;
    const mid = rowTop + rowH / 2;
    p.text(it.label, box.x, mid - 4.5, { size: 8.5, color: C.ink, maxW: labelW - 8 });
    const bw = mx ? (it.value / mx) * span : 0;
    p.hbar(x0, mid - barH / 2, bw, barH, it.color || color);
    p.text(fmt(it.value), x0 + bw + 4, mid - 4.5, { font: p.f.medium, size: 8.5, color: C.ink });
  });
  // baseline
  p.page.drawLine({
    start: { x: x0, y: H - top0 + 2 },
    end: { x: x0, y: H - (top0 + rowH * items.length) - 2 },
    thickness: 0.6,
    color: C.border,
  });
}

function columnChart(p, box, items, { fmt = num, color = C.green } = {}) {
  if (!items.length || items.every((i) => !i.value)) return noData(p, box);
  const labelH = 26;
  const valueH = 14;
  const base = box.top + box.h - labelH;
  const plotH = box.h - labelH - valueH;
  const slot = box.w / items.length;
  const colW = Math.min(34, slot * 0.6);
  const mx = Math.max(...items.map((i) => i.value));
  items.forEach((it, i) => {
    const cx = box.x + slot * i + slot / 2;
    const h = mx ? (it.value / mx) * plotH : 0;
    p.column(cx - colW / 2, base, colW, h, it.color || color);
    p.text(fmt(it.value), cx, base - h - 12, { font: p.f.medium, size: 8.5, color: C.ink, align: 'center' });
    const lines = p.wrap(it.label, p.f.regular, 8, slot - 4).slice(0, 2);
    lines.forEach((l, j) => p.text(l, cx, base + 6 + j * 10, { size: 8, color: C.muted, align: 'center' }));
  });
  p.hline(box.x, box.x + box.w, base, C.border, 0.6);
}

function arcPath(cx, cy, r0, r1, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const pt = (r, a) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
}

// Donut with a 2pt surface gap between segments; centre shows the first segment's share.
function donut(p, cx, cy, r, thickness, segments, centerLabel) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r0 = r - thickness;
  const ring = (color) =>
    p.page.drawCircle({ x: cx, y: H - cy, size: r - thickness / 2, borderColor: color, borderWidth: thickness, opacity: 0 });
  if (!total) {
    ring(C.grid);
    p.text('No data', cx, cy - 4, { size: 8, color: C.faint, align: 'center' });
    return;
  }
  const nonzero = segments.filter((s) => s.value > 0);
  if (nonzero.length === 1) {
    ring(nonzero[0].color);
  } else {
    const gap = 2 / (r - thickness / 2); // radians for a 2pt gap
    let a = -Math.PI / 2;
    for (const s of segments) {
      if (!s.value) continue;
      const sweep = (s.value / total) * Math.PI * 2;
      const a0 = a + gap / 2;
      const a1 = a + sweep - gap / 2;
      if (a1 > a0) p.path(arcPath(cx, cy, r0, r, a0, a1), { color: s.color });
      a += sweep;
    }
  }
  const main = centerLabel ?? pct1((segments[0].value / total) * 100);
  let size = 12.5;
  while (size > 7 && p.w(main, p.f.bold, size) > r0 * 2 - 8) size -= 0.5;
  p.text(main, cx, cy - size * 0.55, { font: p.f.bold, size, color: C.ink, align: 'center' });
}

function legend(p, x, top, items, { total, colW = 0 } = {}) {
  items.forEach((it, i) => {
    const y = top + i * 14;
    p.swatch(x, y + 1.5, it.color);
    p.text(it.label, x + 11, y, { size: 8.5, color: C.ink });
    if (total !== undefined) {
      const v = `${num(it.value)} · ${pct1(total ? (it.value / total) * 100 : 0)}`;
      p.text(v, x + (colW || 150), y, { size: 8.5, color: C.muted, align: 'right' });
    }
  });
}

function donutCard(p, x, top, w, h, title, segments, centerLabel) {
  const box = card(p, x, top, w, h, title);
  const total = segments.reduce((s, x2) => s + x2.value, 0);
  const legendH = segments.length * 14;
  const r = Math.max(26, Math.min(44, (box.h - legendH - 14) / 2, box.w / 2 - 6));
  const cy = box.top + r + 2;
  donut(p, box.x + box.w / 2, cy, r, Math.max(9, r * 0.3), segments, centerLabel);
  legend(p, box.x, cy + r + 12, segments, { total, colW: box.w });
}

function niceStep(max, ticks = 4) {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

function lineChart(p, box, points, { yTitle = 'Participants', maxXLabels = 8, labelFmt = (l) => l } = {}) {
  if (!points.length) return noData(p, box);
  const axisW = 30;
  const xLabH = 18;
  const plot = { x: box.x + axisW, top: box.top + 6, w: box.w - axisW - 6, h: box.h - xLabH - 10 };
  const mx = Math.max(1, ...points.map((pt) => pt.value));
  const step = niceStep(mx);
  const yMax = Math.ceil(mx / step) * step;
  const Y = (v) => plot.top + plot.h - (v / yMax) * plot.h;
  const X = (i) => plot.x + (points.length === 1 ? plot.w / 2 : (i / (points.length - 1)) * plot.w);

  for (let v = 0; v <= yMax + 1e-9; v += step) {
    p.hline(plot.x, plot.x + plot.w, Y(v), v === 0 ? C.border : C.grid, 0.6);
    p.text(num(v), plot.x - 5, Y(v) - 3.5, { size: 7.5, color: C.faint, align: 'right' });
  }

  // area wash + 2pt line
  const pts = points.map((pt, i) => [X(i), Y(pt.value)]);
  if (pts.length > 1) {
    const area = `M ${pts[0][0]} ${Y(0)} ` + pts.map(([x, y]) => `L ${x} ${y}`).join(' ') + ` L ${pts[pts.length - 1][0]} ${Y(0)} Z`;
    p.path(area, { color: C.green, opacity: 0.1 });
    const line = `M ${pts[0][0]} ${pts[0][1]} ` + pts.slice(1).map(([x, y]) => `L ${x} ${y}`).join(' ');
    p.path(line, { borderColor: C.green, borderWidth: 1.6, borderLineCap: 1 });
  }

  // markers only when sparse; always mark the peak and last point
  const peakI = points.reduce((b, pt, i) => (pt.value > points[b].value ? i : b), 0);
  const marks = new Set([peakI, points.length - 1]);
  if (points.length <= 16) points.forEach((_, i) => marks.add(i));
  for (const i of marks) {
    const [x, y] = pts[i];
    p.page.drawCircle({ x, y: H - y, size: 3.4, color: C.green, borderColor: C.white, borderWidth: 1.4 });
  }
  const [px, py] = pts[peakI];
  const peakTxt = num(points[peakI].value);
  const tw = p.w(peakTxt, p.f.semibold, 8.5);
  const lx = Math.min(Math.max(px, plot.x + tw / 2), plot.x + plot.w - tw / 2);
  p.text(peakTxt, lx, py - 15, { font: p.f.semibold, size: 8.5, color: C.ink, align: 'center' });

  // x labels
  const every = Math.max(1, Math.ceil(points.length / maxXLabels));
  points.forEach((pt, i) => {
    if (i % every !== 0 && i !== points.length - 1) return;
    if (i !== points.length - 1 && points.length - 1 - i < every * 0.6) return;
    p.text(labelFmt(pt.label), X(i), plot.top + plot.h + 6, { size: 7.5, color: C.muted, align: 'center' });
  });

  // y title (rotated)
  p.page.drawText(yTitle, {
    x: box.x + 6,
    y: H - (plot.top + plot.h / 2) - p.w(yTitle, p.f.regular, 7.5) / 2,
    size: 7.5,
    font: p.f.regular,
    color: C.faint,
    rotate: { type: 'degrees', angle: 90 },
  });
}

// 100% stacked bars for Excellent → Poor
function ratingBars(p, box, ratings) {
  const labels = ['Excellent', 'Good', 'Fair', 'Poor'];
  // legend row
  let lx = box.x;
  labels.forEach((l, i) => {
    p.swatch(lx, box.top + 1.5, C.ramp[i]);
    lx += 11 + p.text(l, lx + 11, box.top, { size: 8.5, color: C.ink }) + 14;
  });
  if (!ratings.some((r) => r.n)) return noData(p, { ...box, top: box.top + 20, h: box.h - 20 });

  const top0 = box.top + 26;
  const rowH = (box.h - 26) / ratings.length;
  const barH = 13;
  const barW = box.w;
  ratings.forEach((r, i) => {
    const t = top0 + i * rowH;
    p.text(r.label, box.x, t, { font: p.f.medium, size: 9, color: C.ink });
    p.text(`${pct0(r.positive)} Excellent or Good`, box.x + box.w, t + 1, { size: 8, color: C.muted, align: 'right' });
    const barTop = t + 14;
    let x = box.x;
    const segs = r.counts.map((c, j) => ({ c, j })).filter((s) => s.c > 0);
    segs.forEach(({ c, j }, k) => {
      const full = (c / r.n) * barW;
      const w = k < segs.length - 1 ? Math.max(0, full - 1.5) : full; // 1.5pt surface gap
      if (k === 0 && segs.length === 1) p.roundRect(x, barTop, w, barH, 2.5, { fill: C.ramp[j] });
      else p.page.drawRectangle({ x, y: H - barTop - barH, width: w, height: barH, color: C.ramp[j] });
      const label = pct0((c / r.n) * 100);
      const lw = p.w(label, p.f.semibold, 7.5);
      if (lw + 8 <= w) {
        p.text(label, x + w / 2, barTop + 3, {
          font: p.f.semibold,
          size: 7.5,
          color: j <= 2 ? C.white : C.ink,
          align: 'center',
        });
      }
      x += full;
    });
  });
}

// ---------------- pages ----------------
function attendancePage(p, d) {
  const a = d.attendance;
  let top = pageHeader(p, 'Attendance Overview', 'Shows total registered participants and actual attendees to measure overall turnout.');
  const leftW = 330;
  const rx = M + leftW + 12;
  const rw = CW - leftW - 12;

  // Row 1
  const h1 = 320;
  const box = card(p, M, top, leftW, h1, 'Attendees per sponsor', `${a.sponsorCount} sponsors · top ${Math.min(10, a.sponsorCount)} shown`);
  hBarChart(p, box, a.sponsorItems, { labelW: 118 });
  statCard(p, rx, top, rw, 70, 'Total Registered Participants', num(a.registered));
  statCard(p, rx, top + 80, rw, 70, 'Total Attendees', num(a.attendees));
  donutCard(p, rx, top + 160, rw, h1 - 160, 'Turnout', [
    { label: 'Present', value: a.present, color: C.green },
    { label: 'Absent', value: a.absent, color: C.gray },
  ]);

  // Row 2
  top += h1 + 12;
  const h2 = 300;
  const box2 = card(p, M, top, leftW, h2, 'Attendees by membership');
  columnChart(p, box2, a.membership);
  statCard(p, rx, top, rw, 80, 'Pre-Registered Participants', num(a.preRegistered));
  donutCard(p, rx, top + 90, rw, h2 - 90, 'Registration type', [
    { label: 'Pre-registered', value: a.preRegistered, color: C.green },
    { label: 'Onsite', value: a.onsite, color: C.gray },
  ]);
}

function registrationPage(p, d) {
  const r = d.registration;
  const range = r.firstDay ? `${shortDate(r.firstDay)} – ${shortDate(r.lastDay)}` : '';
  let top = pageHeader(
    p,
    'Pre-Registration and Onsite Overview',
    `This chart provides an overview of participant registration, showing pre-registrations by date${
      range ? ` (${range})` : ''
    } and attendee time-in by 30-minute slot on ${EVENT.dateLabel}.`
  );

  const busiest = r.preRegTrend.reduce((b, x) => (!b || x.value > b.value ? x : b), null);
  const box = card(
    p,
    M,
    top,
    CW,
    300,
    'Pre-registration trend by date',
    busiest ? `Busiest day: ${shortDate(busiest.label)} with ${num(busiest.value)} registrations` : undefined
  );
  lineChart(p, box, r.preRegTrend, { labelFmt: shortDate, maxXLabels: 9 });

  top += 312;
  const box2 = card(
    p,
    M,
    top,
    CW,
    300,
    'Time-in overview',
    r.peakSlot ? `Busiest check-in slot: ${r.peakSlot.label} (${num(r.peakSlot.value)} attendees)` : undefined
  );
  lineChart(p, box2, r.timeIn, { maxXLabels: 9 });
}

function profilePage(p, d) {
  const pr = d.profile;
  let top = pageHeader(p, 'Attendee Profile', 'Who attended the convention, based on the registration details of participants who checked in.');
  const leftW = 330;
  const rx = M + leftW + 12;
  const rw = CW - leftW - 12;

  const box = card(p, M, top, leftW, 230, 'Attendees by age group');
  columnChart(p, box, pr.age);
  donutCard(p, rx, top, rw, 230, 'Students vs professionals', [
    { label: 'Professionals', value: pr.professionals, color: C.green },
    { label: 'Students', value: pr.students, color: C.gray },
  ]);

  top += 242;
  const box2 = card(p, M, top, leftW, 250, 'Top companies represented', `${num(pr.companyCount)} companies in total`);
  hBarChart(p, box2, pr.topCompanies, { labelW: 150 });
  donutCard(p, rx, top, rw, 250, 'Requested a certificate', [
    { label: 'Yes', value: pr.certYes, color: C.green },
    { label: 'No', value: pr.certNo, color: C.gray },
  ]);

  top += 262;
  const box3 = card(p, M, top, CW, 118, 'Souvenir program preference');
  hBarChart(p, box3, pr.souvenir, { labelW: 118 });
}

function surveyPage(p, d) {
  const s = d.survey;
  let top = pageHeader(
    p,
    'Evaluation Survey Results',
    `${num(s.responses)} of ${num(d.attendance.attendees)} attendees (${pct1(s.rate)}) answered the post-convention evaluation.`
  );
  const gw = (CW - 30) / 4;
  const overall = s.ratings[0];
  [
    ['Survey responses', num(s.responses)],
    ['Response rate', pct1(s.rate)],
    ['Overall experience rated Excellent or Good', pct0(overall.positive)],
    ['Would recommend (Very likely + Likely)', pct0(s.recommendPct)],
  ].forEach(([label, value], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value));

  top += 88;
  const box = card(p, M, top, CW, 280, 'How attendees rated the convention');
  ratingBars(p, box, s.ratings);

  top += 292;
  donutCard(p, M, top, 200, 230, 'Was the content helpful and applicable?', [
    { label: 'Yes', value: s.helpfulYes, color: C.green },
    { label: 'No', value: s.helpfulNo, color: C.gray },
  ]);
  const box2 = card(p, M + 212, top, CW - 212, 230, 'Likelihood to recommend the convention');
  hBarChart(p, box2, s.recommend, { labelW: 80 });
}

function feedbackPage(p, d) {
  const groups = d.survey.comments.filter((g) => g.items.length);
  if (!groups.length) return false;
  let top = pageHeader(p, 'Participant Feedback', 'Selected written responses from the evaluation survey.');
  const bottom = H - 50;
  for (const g of groups) {
    const innerW = CW - 28;
    const heights = g.items.map((t) => p.wrap(`“${t}”`, p.f.regular, 9, innerW - 12).length * 13 + 8);
    // fit as many as the remaining space allows
    let used = 44;
    let count = 0;
    for (const h of heights) {
      if (top + used + h + 10 > bottom) break;
      used += h;
      count++;
    }
    if (!count) break;
    const boxH = used + 8;
    p.roundRect(M, top, CW, boxH, 6, { fill: C.white, border: C.border });
    p.text(g.title, M + 14, top + 12, { font: p.f.semibold, size: 11 });
    p.text(g.question, M + 14, top + 27, { size: 8, color: C.muted, maxW: innerW });
    let y = top + 44;
    g.items.slice(0, count).forEach((t, i) => {
      p.page.drawRectangle({ x: M + 14, y: H - y - 1 - (heights[i] - 10), width: 2, height: heights[i] - 10, color: C.ramp[3] });
      p.paragraph(`“${t}”`, M + 24, y, innerW - 12, { size: 9, color: C.ink, lineGap: 1.44 });
      y += heights[i];
    });
    top += boxH + 12;
  }
  return true;
}

function quizPage(p, d) {
  const q = d.quiz;
  let top = pageHeader(
    p,
    'Post-Convention Quiz',
    `${num(q.attempts)} attendees took the ${q.questionCount}-question quiz covering the convention presentations.`
  );
  const gw = (CW - 30) / 4;
  [
    ['Took the quiz', num(q.attempts)],
    ['Participation rate', pct1(q.rate)],
    ['Average score', pct1(q.avgScore)],
    ['Perfect scores', num(q.perfect)],
  ].forEach(([label, value], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value));

  top += 88;
  const box = card(p, M, top, CW, 200, 'Score distribution', 'Number of participants per score range');
  columnChart(p, box, q.bins);

  top += 212;
  const h = Math.min(H - 60 - top, 60 + q.bySpeaker.length * 19);
  const box2 = card(p, M, top, CW, h, 'Average correct answers by speaker', 'Share of answers that were correct for each presentation');
  hBarChart(p, box2, q.bySpeaker, { labelW: 140, fmt: (v) => `${v}%`, max: 100 });
}

function completionPage(p, d) {
  const f = d.funnel;
  let top = pageHeader(p, 'Post-Convention Completion', 'How participants progressed from registration to receiving a certificate.');
  const reg = f[0].value;
  const gw = (CW - 20) / 3;
  const certs = f[4].value;
  [
    ['Certificates issued', num(certs)],
    ['Of attendees certified', pct1(d.attendance.attendees ? (certs / d.attendance.attendees) * 100 : 0)],
    ['Of registered certified', pct1(reg ? (certs / reg) * 100 : 0)],
  ].forEach(([label, value], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value));
  top += 88;
  const box = card(p, M, top, CW, 70 + f.length * 26, 'Completion funnel', 'Certificates require attendance, the survey and the quiz');
  hBarChart(p, box, f, {
    labelW: 140,
    maxBar: 14,
    max: Math.max(1, reg),
    fmt: (v) => `${num(v)}  (${pct0(reg ? (v / reg) * 100 : 0)})`,
  });
}

function summaryPage(p, d, notes) {
  const sections = (notes?.sections || [])
    .map((s) => ({ title: s.title?.trim(), points: (s.points || []).map((x) => x.trim()).filter(Boolean) }))
    .filter((s) => s.title && s.points.length);
  const intro = notes?.intro?.trim();
  if (!sections.length && !intro) return false;

  const top0 = pageHeader(p, 'Summary Report', intro);
  const colW = (CW - 16) / 2;
  const cols = [top0, top0];
  const bottom = H - 50;
  for (const s of sections) {
    const titleLines = p.wrap(s.title, p.f.semibold, 10, colW - 20);
    const pointLines = s.points.map((pt) => p.wrap(pt, p.f.regular, 8.8, colW - 20));
    const headH = titleLines.length * 13 + 14;
    const h = headH + pointLines.reduce((sum, l) => sum + l.length * 12.5 + 12, 0);
    const ci = cols[0] <= cols[1] ? 0 : 1;
    if (cols[ci] + h > bottom) continue; // doesn't fit — skipped
    const x = M + ci * (colW + 16);
    let y = cols[ci];
    p.roundRect(x, y, colW, h, 3, { fill: C.white, border: C.border });
    p.page.drawRectangle({ x: x + 0.5, y: H - y - headH + 0.5, width: colW - 1, height: headH - 1, color: C.headerFill });
    titleLines.forEach((l, i) => p.text(l, x + 10, y + 8 + i * 13, { font: p.f.semibold, size: 10 }));
    y += headH;
    pointLines.forEach((lines, i) => {
      p.hline(x, x + colW, y, C.border, 0.6);
      lines.forEach((l, j) => p.text(l, x + 10, y + 7 + j * 12.5, { size: 8.8, color: C.ink }));
      y += lines.length * 12.5 + 12;
    });
    cols[ci] += h + 14;
  }
  return true;
}

// ---------------- entry point ----------------
/**
 * @param report  output of aggregateReport()
 * @param assets  { cover: ArrayBuffer (PDF), fonts: { regular, medium, semibold, bold } ArrayBuffers }
 * @param options { includeFeedback: boolean, notes: { intro, sections:[{title, points[]}] } }
 */
export async function buildPrcReportPdf(report, assets, options = {}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${EVENT.name} — Registration Overview`);
  doc.setAuthor('Philippine Society of Animal Nutritionists');
  doc.setCreator('PHILSAN Convention System');

  const fonts = {
    regular: await doc.embedFont(assets.fonts.regular, { subset: true }),
    medium: await doc.embedFont(assets.fonts.medium, { subset: true }),
    semibold: await doc.embedFont(assets.fonts.semibold, { subset: true }),
    bold: await doc.embedFont(assets.fonts.bold, { subset: true }),
  };

  if (assets.cover) {
    const cover = await PDFDocument.load(assets.cover);
    const [page] = await doc.copyPages(cover, [0]);
    doc.addPage(page);
  }

  const p = new Painter(doc, fonts);
  const pages = [
    (pp) => attendancePage(pp, report),
    (pp) => registrationPage(pp, report),
    (pp) => profilePage(pp, report),
    (pp) => surveyPage(pp, report),
    (pp) => (options.includeFeedback === false ? false : feedbackPage(pp, report)),
    (pp) => quizPage(pp, report),
    (pp) => completionPage(pp, report),
    (pp) => summaryPage(pp, report, options.notes),
  ];

  for (const draw of pages) {
    p.addPage();
    const result = draw(p);
    if (result === false) doc.removePage(doc.getPageCount() - 1);
    else footer(p, doc.getPageCount(), report.generatedAt);
  }

  return doc.save();
}
