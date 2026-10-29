// 2nd Pet Symposium reports (PDF), kept separate from the 39th Convention:
//   - Symposium Report: registrations, sponsors, profile, survey, quiz, completion
//   - Quiz and Survey Summary (one PDF): survey ratings, speaker evaluation and every
//     written answer, then quiz scores, results by speaker and every question
// Reads only the symposium_* tables. Uses the same drawing pieces, fonts and colors
// as the convention's PRC report (reports/prcReportPdf.js) so the reports look alike.
// Note: the symposium used manual (paper) attendance, so there is no attendance data here.

import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {
  Painter, C, W, H, M, CW, num, pct0, pct1, shortDate,
  pageHeader, card, statCard, hBarChart, columnChart, lineChart, ratingBars, donutCard,
} from '../reports/prcReportPdf.js';
import { SURVEY_QUESTIONS } from './surveyQuestions.js';

const EVENT = {
  name: '2nd PHILSAN Pet Symposium',
  date: '2026-10-05', // symposium day (Asia/Manila)
  dateLabel: 'October 5, 2026',
};
const TZ = 'Asia/Manila';
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const BOTTOM = H - 50; // keep clear of the footer
const pctOf = (n, d) => (d ? (n / d) * 100 : 0);
const manilaDate = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
const today = () => new Date().toISOString().slice(0, 10);

// ======================================================================
// Data
// ======================================================================

async function fetchAll(supabase, table, columns) {
  const size = 1000; // Supabase returns max 1000 rows per request
  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return rows;
}

export async function fetchSymposiumReportData(supabase) {
  const [registrations, survey, attempts, questions, certificates] = await Promise.all([
    fetchAll(supabase, 'symposium_registrations', 'id, company, agri_license, certificate_needed, sponsored, sponsor, created_at'),
    fetchAll(supabase, 'symposium_survey_responses', 'registration_id, answers'),
    fetchAll(supabase, 'symposium_quiz_attempts', 'registration_id, answers, score, total'),
    fetchAll(supabase, 'symposium_quiz_questions', 'id, sort_order, section, speaker, question, options, correct_option'),
    fetchAll(supabase, 'symposium_certificates', 'registration_id'),
  ]);
  return { registrations, survey, attempts, questions, certificates };
}

// A license is counted when it has digits and isn't all zeros ("N/A", "-", "0000" are not)
const hasLicense = (v) => /\d/.test(v || '') && !/^0+$/.test(String(v).replace(/\D/g, ''));

function registrationNumbers(raw, topSponsors = 12, topCompanies = 10) {
  const regs = raw.registrations;
  const sponsored = regs.filter((r) => r.sponsored === 'yes');

  const bySponsor = new Map();
  for (const r of sponsored) {
    const k = (r.sponsor || '').trim() || 'Sponsor not named';
    bySponsor.set(k, (bySponsor.get(k) || 0) + 1);
  }
  const sorted = [...bySponsor.entries()].sort((a, b) => b[1] - a[1]);
  const sponsorItems = sorted.slice(0, topSponsors).map(([label, value]) => ({ label, value }));
  const others = sorted.slice(topSponsors).reduce((s, [, v]) => s + v, 0);
  if (others) sponsorItems.push({ label: `Other sponsors (${sorted.length - topSponsors})`, value: others });
  const self = regs.length - sponsored.length;
  if (self) sponsorItems.push({ label: 'Self-paying', value: self });

  // Registrations per day, up to the day before the symposium; the symposium day counts as onsite
  const days = new Map();
  for (const r of regs) {
    const d = manilaDate(r.created_at);
    if (d < EVENT.date) days.set(d, (days.get(d) || 0) + 1);
  }
  const keys = [...days.keys()].sort();
  const trend = [];
  if (keys.length) {
    const d = new Date(keys[0] + 'T00:00:00Z');
    const end = new Date(keys[keys.length - 1] + 'T00:00:00Z');
    while (d <= end) {
      const k = d.toISOString().slice(0, 10);
      trend.push({ label: k, value: days.get(k) || 0 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  const onsite = regs.filter((r) => manilaDate(r.created_at) === EVENT.date).length;

  const norm = (c) => c.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
  const comp = new Map();
  const compName = new Map();
  for (const r of regs) {
    if (!r.company?.trim() || /^(n\/?a|none|-+)$/i.test(r.company.trim())) continue;
    const k = norm(r.company);
    comp.set(k, (comp.get(k) || 0) + 1);
    if (!compName.has(k)) compName.set(k, r.company.trim());
  }
  const companies = [...comp.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCompanies)
    .map(([k, value]) => ({ label: compName.get(k), value }));

  return {
    total: regs.length,
    sponsored: sponsored.length,
    self,
    sponsorCount: sorted.length,
    sponsorItems,
    licensed: regs.filter((r) => hasLicense(r.agri_license)).length,
    certYes: regs.filter((r) => r.certificate_needed === 'yes').length,
    trend,
    firstDay: keys[0],
    lastDay: keys[keys.length - 1],
    preRegistered: regs.length - onsite,
    onsite,
    companies,
    companyCount: comp.size,
  };
}

const TRIVIAL = /^(n\/?a|none|nothing|no|wala|-+|\.+|ok|okay)\.?$/i;

function surveyNumbers(raw) {
  const rows = raw.survey.map((r) => r.answers || {});
  const total = rows.length;

  const ratingQs = SURVEY_QUESTIONS.filter((q) => q.type === 'choice' && q.options?.[0]?.value === 'Excellent');
  const ratings = ratingQs.map((q) => {
    const counts = q.options.map((o) => rows.filter((a) => a[q.key] === o.value).length);
    const n = counts.reduce((a, b) => a + b, 0);
    const label =
      { overall_experience: 'Overall experience', content_quality: 'Quality & relevance of topics' }[q.key] ||
      q.label.replace(/^[a-z]\.\s*/i, '');
    return { label, counts, n, positive: pctOf(counts[0] + counts[1], n) };
  });

  const recQ = SURVEY_QUESTIONS.find((q) => q.key === 'recommend');
  const recommend = (recQ?.options || []).map((o) => ({ label: o.label, value: rows.filter((a) => a.recommend === o.value).length }));
  const recTop = (recQ?.options || []).slice(0, 2).map((o) => o.value); // Very Likely + Likely

  // Speaker ratings (1–5)
  const speakers = SURVEY_QUESTIONS.filter((q) => q.key.endsWith('_knowledge')).map((q) => {
    const base = q.key.replace(/_knowledge$/, '');
    const vals = (suffix) => rows.map((a) => Number(a[`${base}_${suffix}`])).filter((v) => v >= 1 && v <= 5);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const k = vals('knowledge');
    const d = vals('delivery');
    return {
      name: q.section.replace(/^Speaker Evaluation - /, ''),
      knowledge: avg(k),
      delivery: avg(d),
      overall: avg([...k, ...d]),
      n: Math.max(k.length, d.length),
    };
  });

  const comments = SURVEY_QUESTIONS.filter((q) => q.type === 'text').map((q) => ({
    title: q.section,
    question: q.label,
    items: rows.map((a) => String(a[q.key] || '').trim().replace(/\s+/g, ' ')).filter((t) => t && !TRIVIAL.test(t)),
  }));

  return {
    total,
    ratings,
    overallPositive: ratings.find((r) => r.label === 'Overall experience')?.positive ?? 0,
    helpfulYes: rows.filter((a) => a.content_helpful === 'Yes').length,
    helpfulNo: rows.filter((a) => a.content_helpful === 'No').length,
    recommend,
    recommendPct: pctOf(rows.filter((a) => recTop.includes(a.recommend)).length, total),
    speakers,
    comments,
  };
}

function quizNumbers(raw) {
  const qs = [...raw.questions].sort((a, b) => a.sort_order - b.sort_order);
  const attempts = raw.attempts;
  const ans = (a, q) => a.answers?.[q.id] ?? a.answers?.[String(q.id)];
  const pcts = attempts.map((a) => pctOf(a.score, a.total));

  const ranges = [
    ['Below 50%', 0, 50],
    ['50–59%', 50, 60],
    ['60–69%', 60, 70],
    ['70–79%', 70, 80],
    ['80–89%', 80, 90],
    ['90–100%', 90, 101],
  ].map(([label, lo, hi]) => ({ label, value: pcts.filter((s) => s >= lo && s < hi).length }));

  const questionStats = qs.map((q, i) => {
    const answered = attempts.filter((a) => ans(a, q)).length;
    const correct = attempts.filter((a) => ans(a, q) === q.correct_option).length;
    return { no: i + 1, q, answered, correct, pct: pctOf(correct, answered) };
  });

  const speakers = [];
  for (const s of questionStats) {
    const label = s.q.speaker || s.q.section || 'General';
    let row = speakers.find((x) => x.label === label);
    if (!row) speakers.push((row = { label, correct: 0, answered: 0 }));
    row.correct += s.correct;
    row.answered += s.answered;
  }

  return {
    attempts: attempts.length,
    avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
    highest: pcts.length ? Math.max(...pcts) : 0,
    lowest: pcts.length ? Math.min(...pcts) : 0,
    perfect: attempts.filter((a) => a.total && a.score === a.total).length,
    ranges,
    questionStats,
    speakers: speakers.map((s) => ({ label: s.label, value: Math.round(pctOf(s.correct, s.answered)) })),
    questionCount: qs.length,
  };
}

// ======================================================================
// Shared PDF pieces
// ======================================================================

async function loadFonts() {
  const get = async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Missing file: ${url}`);
    return res.arrayBuffer();
  };
  const [regular, medium, semibold, bold] = await Promise.all([
    get('/fonts/Montserrat-Regular.ttf'),
    get('/fonts/Montserrat-Medium.ttf'),
    get('/fonts/Montserrat-SemiBold.ttf'),
    get('/fonts/Montserrat-Bold.ttf'),
  ]);
  return { regular, medium, semibold, bold };
}

async function newDoc(title) {
  const files = await loadFonts();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${EVENT.name} — ${title}`);
  doc.setAuthor('Philippine Society of Animal Nutritionists');
  doc.setCreator('PHILSAN Convention System');
  const fonts = {
    regular: await doc.embedFont(files.regular, { subset: true }),
    medium: await doc.embedFont(files.medium, { subset: true }),
    semibold: await doc.embedFont(files.semibold, { subset: true }),
    bold: await doc.embedFont(files.bold, { subset: true }),
  };
  return { doc, p: new Painter(doc, fonts) };
}

function footers(p, doc, title) {
  const date = new Date().toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: TZ });
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    p.page = page;
    const top = H - 28;
    p.hline(M, W - M, top - 8, C.grid, 0.6);
    p.text(`${EVENT.name} · ${title} · Generated ${date}`, M, top, { size: 7.5, color: C.faint });
    p.text(`Page ${i + 1} of ${pages.length}`, W - M, top, { size: 7.5, color: C.faint, align: 'right' });
  });
}

// Content that runs over several pages
function flow(p, title, subtitle) {
  p.addPage();
  const state = { top: pageHeader(p, title, subtitle) };
  state.need = (h) => {
    if (state.top + h <= BOTTOM) return;
    p.addPage();
    p.text(`${title} (continued)`, M, 42, { font: p.f.semibold, size: 14, color: C.heading });
    state.top = 72;
  };
  return state;
}

function sectionHeading(p, f, title, note) {
  f.need(40 + 60);
  p.text(title, M, f.top, { font: p.f.semibold, size: 12, color: C.green, maxW: CW });
  f.top += 17;
  if (note) {
    p.text(note, M, f.top, { size: 8.5, color: C.muted, maxW: CW });
    f.top += 14;
  }
  p.hline(M, W - M, f.top + 2, C.border, 0.6);
  f.top += 10;
}

// Drops characters the report font can't draw (emoji and the like)
function fontSafe(p) {
  const ok = new Set(p.f.regular.getCharacterSet());
  return (str) =>
    Array.from(String(str ?? ''))
      .filter((ch) => ok.has(ch.codePointAt(0)) || /\s/.test(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ======================================================================
// Pages
// ======================================================================

function registrationPage(p, r) {
  p.addPage();
  let top = pageHeader(
    p,
    'Registration Overview',
    `Registrations for the ${EVENT.name} on ${EVENT.dateLabel}. Attendance was recorded on paper, so it is not part of this report.`
  );
  const gw = (CW - 30) / 4;
  [
    ['Total registered', num(r.total)],
    ['Sponsored', num(r.sponsored), `${pct1(pctOf(r.sponsored, r.total))} of registrations`],
    ['Self-paying', num(r.self), `${pct1(pctOf(r.self, r.total))} of registrations`],
    ['With PRC license', num(r.licensed)],
  ].forEach(([label, value, sub], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value, sub));

  top += 88;
  const leftW = 330;
  const rx = M + leftW + 12;
  const rw = CW - leftW - 12;
  const h = 560;
  const box = card(p, M, top, leftW, h, 'Registrations per sponsor', `${r.sponsorCount} sponsors · top ${Math.min(12, r.sponsorCount)} shown`);
  hBarChart(p, box, r.sponsorItems, { labelW: 130 });
  donutCard(p, rx, top, rw, (h - 12) / 3, 'Sponsored vs self-paying', [
    { label: 'Sponsored', value: r.sponsored, color: C.green },
    { label: 'Self-paying', value: r.self, color: C.gray },
  ]);
  donutCard(p, rx, top + (h - 12) / 3 + 6, rw, (h - 12) / 3, 'Requested a certificate', [
    { label: 'Yes', value: r.certYes, color: C.green },
    { label: 'No', value: r.total - r.certYes, color: C.gray },
  ]);
  donutCard(p, rx, top + ((h - 12) / 3 + 6) * 2, rw, (h - 12) / 3, 'Registration type', [
    { label: 'Pre-registered', value: r.preRegistered, color: C.green },
    { label: 'On symposium day', value: r.onsite, color: C.gray },
  ]);
}

function trendPage(p, r) {
  p.addPage();
  const range = r.firstDay ? ` (${shortDate(r.firstDay)} – ${shortDate(r.lastDay)})` : '';
  let top = pageHeader(
    p,
    'Pre-Registration and Profile',
    `Pre-registrations by date${range}, and the companies registrants came from.`
  );
  const busiest = r.trend.reduce((b, x) => (!b || x.value > b.value ? x : b), null);
  const box = card(
    p,
    M,
    top,
    CW,
    300,
    'Pre-registration trend by date',
    busiest ? `Busiest day: ${shortDate(busiest.label)} with ${num(busiest.value)} registrations` : undefined
  );
  lineChart(p, box, r.trend, { yTitle: 'Registrations', labelFmt: shortDate, maxXLabels: 9 });

  top += 312;
  const h = Math.min(BOTTOM - top, 70 + Math.max(1, r.companies.length) * 26);
  const box2 = card(p, M, top, CW, h, 'Top companies represented', `${num(r.companyCount)} companies in total`);
  hBarChart(p, box2, r.companies, { labelW: 220 });
}

function surveyOverviewPage(p, s, registered, title = 'Evaluation Survey Results') {
  p.addPage();
  let top = pageHeader(
    p,
    title,
    `${num(s.total)} of ${num(registered)} registrants (${pct1(pctOf(s.total, registered))}) answered the post-symposium evaluation.`
  );
  const gw = (CW - 30) / 4;
  [
    ['Survey responses', num(s.total)],
    ['Response rate', pct1(pctOf(s.total, registered)), `of ${num(registered)} registered`],
    ['Overall experience rated Excellent or Good', pct0(s.overallPositive)],
    ['Would recommend (Very likely + Likely)', pct0(s.recommendPct)],
  ].forEach(([label, value, sub], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value, sub));

  top += 88;
  const box = card(p, M, top, CW, 280, 'How participants rated the symposium');
  ratingBars(p, box, s.ratings);

  top += 292;
  donutCard(p, M, top, 200, 230, 'Was the content helpful and applicable?', [
    { label: 'Yes', value: s.helpfulYes, color: C.green },
    { label: 'No', value: s.helpfulNo, color: C.gray },
  ]);
  const box2 = card(p, M + 212, top, CW - 212, 230, 'Likelihood to recommend the symposium');
  hBarChart(p, box2, s.recommend, { labelW: 80 });
}

function speakerTable(p, f, speakers) {
  const nameW = 200;
  const colX = [M + nameW + 10, M + nameW + 80, M + nameW + 150];
  const barX = M + nameW + 200;
  const barW = W - M - barX - 34;
  f.need(16 + 26);
  p.text('Speaker', M, f.top, { font: p.f.semibold, size: 8, color: C.muted });
  p.text('Knowledge', colX[0] + 30, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
  p.text('Delivery', colX[1] + 30, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
  p.text('Average', colX[2] + 22, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
  f.top += 16;
  for (const s of speakers) {
    const lines = p.wrap(s.name, p.f.medium, 9, nameW).slice(0, 2);
    const h = Math.max(26, lines.length * 12 + 14);
    f.need(h);
    const t = f.top;
    lines.forEach((l, i) => p.text(l, M, t + i * 12, { font: p.f.medium, size: 9, color: C.ink }));
    p.text(`${num(s.n)} ratings`, M, t + lines.length * 12, { size: 7, color: C.faint });
    const fmt = (v) => (v ? v.toFixed(2) : '—');
    p.text(fmt(s.knowledge), colX[0] + 30, t + 2, { size: 9.5, color: C.ink, align: 'center' });
    p.text(fmt(s.delivery), colX[1] + 30, t + 2, { size: 9.5, color: C.ink, align: 'center' });
    p.text(fmt(s.overall), colX[2] + 22, t + 2, { font: p.f.bold, size: 9.5, color: C.green, align: 'center' });
    p.roundRect(barX, t + 4, barW, 6, 3, { fill: C.grid });
    if (s.overall) p.hbar(barX, t + 4, (s.overall / 5) * barW, 6, C.green);
    p.text('/ 5', W - M, t + 2, { size: 8, color: C.faint, align: 'right' });
    f.top += h;
    p.hline(M, W - M, f.top - 6, C.grid, 0.6);
  }
}

function comments(p, f, groups, { limit } = {}) {
  const safe = fontSafe(p);
  const innerW = CW - 14;
  for (const g of groups.filter((x) => x.items.length)) {
    let items = g.items.map(safe).filter(Boolean);
    if (limit) {
      // a selection for the report: mid-length, no repeats
      items = items
        .filter((t) => t.length >= 15 && t.length <= 260)
        .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i)
        .sort((a, b) => b.length - a.length)
        .slice(0, limit);
      if (!items.length) continue;
    }
    sectionHeading(p, f, g.title, limit ? g.question : `${g.question} · ${num(items.length)} answers`);
    for (const t of items) {
      const lines = p.wrap(`“${t}”`, p.f.regular, 9, innerW);
      const h = lines.length * 13 + 8;
      f.need(h);
      p.page.drawRectangle({ x: M, y: H - f.top - lines.length * 13 + 2, width: 2, height: lines.length * 13 - 2, color: C.ramp[3] });
      lines.forEach((l, i) => p.text(l, M + 12, f.top + i * 13, { size: 9, color: C.ink }));
      f.top += h;
    }
    f.top += 10;
  }
}

function quizOverviewPage(p, q, registered, title = 'Post-Symposium Quiz') {
  p.addPage();
  let top = pageHeader(
    p,
    title,
    `${num(q.attempts)} participants took the ${q.questionCount}-question quiz covering the symposium presentations.`
  );
  const gw = (CW - 30) / 4;
  [
    ['Took the quiz', num(q.attempts), `${pct1(pctOf(q.attempts, registered))} of ${num(registered)} registered`],
    ['Average score', pct1(q.avg)],
    ['Highest score', pct0(q.highest), `Lowest: ${pct0(q.lowest)}`],
    ['Perfect scores', num(q.perfect)],
  ].forEach(([label, value, sub], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value, sub));

  top += 88;
  const box = card(p, M, top, CW, 210, 'Score distribution', 'Number of participants per score range');
  columnChart(p, box, q.ranges);

  top += 222;
  const h = Math.min(BOTTOM - top, 60 + Math.max(1, q.speakers.length) * 22);
  const box2 = card(p, M, top, CW, h, 'Average correct answers by speaker', 'Share of answers that were correct for each presentation');
  hBarChart(p, box2, q.speakers, { labelW: 170, fmt: (v) => `${v}%`, max: 100 });
}

function quizQuestionsPages(p, q) {
  const f = flow(
    p,
    'Question-by-Question Results',
    'Share of participants who chose the correct answer. Questions below 50% are marked.'
  );
  const safe = fontSafe(p);
  const textW = CW - 150;
  let section = null;
  for (const s of q.questionStats) {
    const sec = s.q.section || s.q.speaker || '';
    if (sec !== section) {
      section = sec;
      const inSec = q.questionStats.filter((x) => (x.q.section || x.q.speaker || '') === sec);
      const avg = inSec.reduce((sum, x) => sum + x.pct, 0) / (inSec.length || 1);
      if (sec) sectionHeading(p, f, sec, `${inSec.length} questions · average ${pct0(avg)} correct`);
    }
    const qLines = p.wrap(safe(s.q.question), p.f.regular, 9, textW);
    const correctText = safe(`Answer: ${s.q.correct_option}. ${(s.q.options || [])[LETTERS.indexOf(s.q.correct_option)] ?? ''}`);
    const aLines = p.wrap(correctText, p.f.medium, 8, textW);
    const h = 14 + qLines.length * 12.5 + aLines.length * 11 + 12;
    f.need(Math.max(h, 58));

    const t = f.top;
    p.text(`Q${s.no}${s.q.speaker ? ` · ${s.q.speaker}` : ''}`, M, t, { font: p.f.semibold, size: 8, color: C.muted, maxW: textW });
    qLines.forEach((l, i) => p.text(l, M, t + 13 + i * 12.5, { size: 9, color: C.ink }));
    const at = t + 13 + qLines.length * 12.5 + 2;
    aLines.forEach((l, i) => p.text(l, M, at + i * 11, { font: p.f.medium, size: 8, color: C.green }));

    const rx = M + textW + 20;
    const bw = W - M - rx;
    const low = s.answered && s.pct < 50;
    p.text(s.answered ? pct0(s.pct) : '—', W - M, t, { font: p.f.bold, size: 14, color: low ? C.ink : C.green, align: 'right' });
    p.text(low ? 'correct · below 50%' : 'correct', W - M, t + 17, { size: 7.5, color: C.muted, align: 'right' });
    p.roundRect(rx, t + 30, bw, 6, 3, { fill: C.grid });
    if (s.answered) p.hbar(rx, t + 30, (s.pct / 100) * bw, 6, low ? C.ramp[3] : C.green);
    p.text(`${num(s.correct)} of ${num(s.answered)} answered`, W - M, t + 40, { size: 7.5, color: C.faint, align: 'right' });

    f.top += Math.max(h, 58);
    p.hline(M, W - M, f.top - 6, C.grid, 0.6);
  }
}

function completionPage(p, reg, survey, quiz, certs) {
  p.addPage();
  let top = pageHeader(p, 'Post-Symposium Completion', 'How registrants progressed from registration to receiving a certificate.');
  const gw = (CW - 20) / 3;
  [
    ['Certificates issued', num(certs)],
    ['Of registrants certified', pct1(pctOf(certs, reg))],
    ['Answered the survey', num(survey)],
  ].forEach(([label, value], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value));
  top += 88;
  const funnel = [
    { label: 'Registered', value: reg },
    { label: 'Answered the survey', value: survey },
    { label: 'Took the quiz', value: quiz },
    { label: 'Received a certificate', value: certs },
  ];
  const box = card(p, M, top, CW, 70 + funnel.length * 26, 'Completion funnel', 'Certificates require the survey and the quiz');
  hBarChart(p, box, funnel, {
    labelW: 140,
    maxBar: 14,
    max: Math.max(1, reg),
    fmt: (v) => `${num(v)}  (${pct0(pctOf(v, reg))})`,
  });
}

// ======================================================================
// Downloads
// ======================================================================

export async function downloadSymposiumReport(raw) {
  const r = registrationNumbers(raw);
  const s = surveyNumbers(raw);
  const q = quizNumbers(raw);
  const { doc, p } = await newDoc('Symposium Report');

  registrationPage(p, r);
  trendPage(p, r);
  surveyOverviewPage(p, s, r.total);
  if (s.speakers.length || s.comments.some((g) => g.items.length)) {
    const f = flow(p, 'Speakers and Feedback', 'Speaker ratings on a scale of 1 (lowest) to 5 (highest), and selected written answers.');
    if (s.speakers.length) speakerTable(p, f, s.speakers);
    f.top += 14;
    comments(p, f, s.comments, { limit: 5 });
  }
  quizOverviewPage(p, q, r.total);
  completionPage(p, r.total, raw.survey.length, raw.attempts.length, raw.certificates.length);

  footers(p, doc, 'Symposium Report');
  download(await doc.save(), `PHILSAN-Pet-Symposium-Report-${today()}.pdf`);
}

// Quiz and survey in one PDF: survey results first, then quiz results
export async function downloadSymposiumQuizSurveySummary(raw) {
  const s = surveyNumbers(raw);
  const q = quizNumbers(raw);
  const title = 'Quiz and Survey Summary';
  const { doc, p } = await newDoc(title);

  // Survey
  surveyOverviewPage(p, s, raw.registrations.length, 'Survey Results Summary');
  if (s.speakers.length || s.comments.some((g) => g.items.length)) {
    const f = flow(
      p,
      'Speakers and Written Answers',
      'Speaker ratings on a scale of 1 (lowest) to 5 (highest), then every written answer. Blank and "N/A"-type answers are left out.'
    );
    if (s.speakers.length) {
      sectionHeading(p, f, 'Speaker Evaluation');
      speakerTable(p, f, s.speakers);
      f.top += 14;
    }
    comments(p, f, s.comments);
  }

  // Quiz
  quizOverviewPage(p, q, raw.registrations.length, 'Quiz Results Summary');
  if (q.questionStats.length) quizQuestionsPages(p, q);

  footers(p, doc, title);
  download(await doc.save(), `PHILSAN-Pet-Symposium-Quiz-and-Survey-Summary-${today()}.pdf`);
}
