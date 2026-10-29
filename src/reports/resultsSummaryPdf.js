// Summary PDFs for the Quiz Results and Survey Results pages (39th Convention).
// Uses the same drawing pieces, fonts and colors as the PRC Registration Overview
// (prcReportPdf.js), so all the reports look alike.

import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { EVENT } from './reportData.js';
import {
  Painter, C, W, H, M, CW, num, pct0, pct1,
  pageHeader, card, statCard, hBarChart, columnChart, ratingBars, donutCard,
} from './prcReportPdf.js';
import { SURVEY_QUESTIONS, SPEAKER_QUESTIONS } from '../lib/surveyQuestions.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const BOTTOM = H - 50; // keep clear of the footer
const pctOf = (n, d) => (d ? (n / d) * 100 : 0);

// ---------------- shared ----------------
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

async function newDoc(title, fontFiles) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${EVENT.name} — ${title}`);
  doc.setAuthor('Philippine Society of Animal Nutritionists');
  doc.setCreator('PHILSAN Convention System');
  const fonts = {
    regular: await doc.embedFont(fontFiles.regular, { subset: true }),
    medium: await doc.embedFont(fontFiles.medium, { subset: true }),
    semibold: await doc.embedFont(fontFiles.semibold, { subset: true }),
    bold: await doc.embedFont(fontFiles.bold, { subset: true }),
  };
  return { doc, p: new Painter(doc, fonts) };
}

// Page numbers + "Generated" line on every page, added once all pages exist
function footers(p, doc, title, generatedAt) {
  const date = generatedAt.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'Asia/Manila' });
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    p.page = page;
    const top = H - 28;
    p.hline(M, W - M, top - 8, C.grid, 0.6);
    p.text(`${EVENT.name} · ${title} · Generated ${date}`, M, top, { size: 7.5, color: C.faint });
    p.text(`Page ${i + 1} of ${pages.length}`, W - M, top, { size: 7.5, color: C.faint, align: 'right' });
  });
}

// Content that runs over several pages: starts a "(continued)" page when the next block won't fit
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

// Section heading inside a flowing page
function sectionHeading(p, f, title, note) {
  f.need(40 + 60); // keep the heading with at least one item
  p.text(title, M, f.top, { font: p.f.semibold, size: 12, color: C.green, maxW: CW });
  f.top += 17;
  if (note) {
    p.text(note, M, f.top, { size: 8.5, color: C.muted, maxW: CW });
    f.top += 14;
  }
  p.hline(M, W - M, f.top + 2, C.border, 0.6);
  f.top += 10;
}

function download(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

const today = () => new Date().toISOString().slice(0, 10);

// Drops characters the report font can't draw (emoji and the like) so they don't print as boxes
function fontSafe(p) {
  const ok = new Set(p.f.regular.getCharacterSet());
  return (str) =>
    Array.from(String(str ?? ''))
      .filter((ch) => ok.has(ch.codePointAt(0)) || /\s/.test(ch))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
}

// ======================================================================
// QUIZ
// ======================================================================

export function quizSummary(questions, attempts, approvedCount) {
  const qs = [...questions].sort((a, b) => a.sort_order - b.sort_order);
  const ans = (a, q) => a.answers?.[q.id] ?? a.answers?.[String(q.id)];
  const scorePct = (a) => pctOf(a.score, a.total);
  const pcts = attempts.map(scorePct);

  // Score ranges
  const ranges = [
    ['Below 50%', 0, 50],
    ['50–59%', 50, 60],
    ['60–69%', 60, 70],
    ['70–79%', 70, 80],
    ['80–89%', 80, 90],
    ['90–100%', 90, 101],
  ].map(([label, lo, hi]) => ({ label, value: pcts.filter((s) => s >= lo && s < hi).length }));

  // The Learning Session each person chose = the non-Plenary session they answered
  const sessionsOrder = [...new Set(qs.map((q) => q.session))];
  const learning = sessionsOrder.filter((s) => !/plenary/i.test(s));
  const chosen = attempts.map((a) => {
    const answered = learning.filter((s) => qs.some((q) => q.session === s && ans(a, q)));
    return answered.length === 1 ? answered[0] : answered.length ? 'Answered more than one session' : 'Plenary only';
  });
  const sessionGroups = [...learning, 'Answered more than one session', 'Plenary only']
    .map((s) => {
      const idx = chosen.map((c, i) => (c === s ? i : -1)).filter((i) => i >= 0);
      const avg = idx.length ? idx.reduce((sum, i) => sum + pcts[i], 0) / idx.length : 0;
      return { label: s, count: idx.length, avg };
    })
    .filter((g) => g.count || learning.includes(g.label));

  // Per question
  const questionStats = qs.map((q, i) => {
    const picks = (q.options || []).map((_, k) => attempts.filter((a) => ans(a, q) === LETTERS[k]).length);
    const answered = picks.reduce((s, n) => s + n, 0);
    const correct = attempts.filter((a) => ans(a, q) === q.correct_option).length;
    return { no: i + 1, q, picks, answered, correct, pct: pctOf(correct, answered) };
  });

  // Per speaker (in quiz order)
  const speakers = [];
  for (const s of questionStats) {
    let row = speakers.find((x) => x.label === s.q.speaker && x.session === s.q.session);
    if (!row) speakers.push((row = { label: s.q.speaker, session: s.q.session, correct: 0, answered: 0 }));
    row.correct += s.correct;
    row.answered += s.answered;
  }

  return {
    generatedAt: new Date(),
    attempts: attempts.length,
    approvedCount,
    participation: pctOf(attempts.length, approvedCount),
    avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
    highest: pcts.length ? Math.max(...pcts) : 0,
    lowest: pcts.length ? Math.min(...pcts) : 0,
    perfect: attempts.filter((a) => a.total && a.score === a.total).length,
    ranges,
    sessionGroups,
    sessionsOrder,
    questionStats,
    speakers: speakers.map((s) => ({ label: s.label, session: s.session, value: Math.round(pctOf(s.correct, s.answered)) })),
    questionCount: qs.length,
  };
}

function quizOverviewPage(p, d) {
  p.addPage();
  let top = pageHeader(
    p,
    'Quiz Results Summary',
    `${num(d.attempts)} participants took the ${d.questionCount}-question post-convention quiz (Plenary questions plus one Learning Session).`
  );
  const gw = (CW - 30) / 4;
  [
    ['Took the quiz', num(d.attempts), `${pct1(d.participation)} of ${num(d.approvedCount)} approved`],
    ['Average score', pct1(d.avg)],
    ['Highest score', pct0(d.highest), `Lowest: ${pct0(d.lowest)}`],
    ['Perfect scores', num(d.perfect)],
  ].forEach(([label, value, sub], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value, sub));

  top += 88;
  const box = card(p, M, top, CW, 210, 'Score distribution', 'Number of participants per score range');
  columnChart(p, box, d.ranges);

  top += 222;
  const rows = d.sessionGroups.length;
  const h = 64 + rows * 24;
  const b1 = card(p, M, top, CW, h, 'Learning Session chosen', 'Participants per session, with their average score for the whole quiz (Plenary included)');
  const avgOf = new Map(d.sessionGroups.map((g) => [g.label, g.avg]));
  hBarChart(p, { ...b1, w: b1.w - 60 }, d.sessionGroups.map((g) => ({ label: g.label, value: g.count })), { labelW: 210 });
  // average score at the right edge of each row
  {
    const rowH = Math.min(22, b1.h / rows);
    const top0 = b1.top + (b1.h - rowH * rows) / 2;
    d.sessionGroups.forEach((g, i) => {
      p.text(`avg ${pct0(avgOf.get(g.label))}`, b1.x + b1.w, top0 + i * rowH + rowH / 2 - 4.5, {
        font: p.f.medium, size: 8.5, color: C.muted, align: 'right',
      });
    });
  }

  top += h + 12;
  // Hardest questions, if they fit on this page
  const hardest = [...d.questionStats].filter((s) => s.answered).sort((a, b) => a.pct - b.pct).slice(0, 5);
  if (hardest.length && top + 60 + hardest.length * 24 <= BOTTOM) {
    const hb = card(p, M, top, CW, 60 + hardest.length * 24, 'Hardest questions', 'Lowest share of correct answers');
    hBarChart(
      p,
      hb,
      hardest.map((s) => ({ label: `Q${s.no} · ${s.q.speaker}`, value: Math.round(s.pct), color: s.pct < 50 ? C.ramp[3] : C.green })),
      { labelW: 170, fmt: (v) => `${v}% correct`, max: 100 }
    );
  }
}

function quizSpeakerPage(p, d) {
  if (!d.speakers.length) return;
  const f = flow(p, 'Correct Answers by Speaker', 'Share of answers that were correct for each presentation.');
  for (const session of d.sessionsOrder) {
    const items = d.speakers.filter((s) => s.session === session);
    if (!items.length) continue;
    const h = 52 + items.length * 20;
    f.need(h + 12);
    const box = card(p, M, f.top, CW, h, session);
    hBarChart(p, box, items, { labelW: 170, fmt: (v) => `${v}%`, max: 100 });
    f.top += h + 12;
  }
}

function quizQuestionsPages(p, d) {
  const f = flow(
    p,
    'Question-by-Question Results',
    'Share of participants who chose the correct answer, among those who answered the question. Questions below 50% are marked.'
  );
  const textW = CW - 150;
  const safe = fontSafe(p);
  let session = null;
  for (const s of d.questionStats) {
    if (s.q.session !== session) {
      session = s.q.session;
      const inSession = d.questionStats.filter((x) => x.q.session === session);
      const avg = inSession.reduce((sum, x) => sum + x.pct, 0) / (inSession.length || 1);
      sectionHeading(p, f, session, `${inSession.length} questions · average ${pct0(avg)} correct`);
    }
    const qLines = p.wrap(safe(s.q.question), p.f.regular, 9, textW);
    const correctText = safe(`Answer: ${s.q.correct_option}. ${(s.q.options || [])[LETTERS.indexOf(s.q.correct_option)] ?? ''}`);
    const aLines = p.wrap(correctText, p.f.medium, 8, textW);
    const h = 14 + qLines.length * 12.5 + aLines.length * 11 + 12;
    f.need(h);

    const t = f.top;
    p.text(`Q${s.no} · ${s.q.speaker}`, M, t, { font: p.f.semibold, size: 8, color: C.muted, maxW: textW });
    qLines.forEach((l, i) => p.text(l, M, t + 13 + i * 12.5, { size: 9, color: C.ink }));
    const at = t + 13 + qLines.length * 12.5 + 2;
    aLines.forEach((l, i) => p.text(l, M, at + i * 11, { font: p.f.medium, size: 8, color: C.green }));

    // result column
    const rx = M + textW + 20;
    const bw = W - M - rx;
    const low = s.answered && s.pct < 50;
    p.text(s.answered ? pct0(s.pct) : '—', W - M, t, {
      font: p.f.bold,
      size: 14,
      color: low ? C.ink : C.green,
      align: 'right',
    });
    p.text(low ? 'correct · below 50%' : 'correct', W - M, t + 17, { size: 7.5, color: C.muted, align: 'right' });
    p.roundRect(rx, t + 30, bw, 6, 3, { fill: C.grid });
    if (s.answered) p.hbar(rx, t + 30, (s.pct / 100) * bw, 6, low ? C.ramp[3] : C.green);
    p.text(`${num(s.correct)} of ${num(s.answered)} answered`, W - M, t + 40, { size: 7.5, color: C.faint, align: 'right' });

    f.top += Math.max(h, 58);
    p.hline(M, W - M, f.top - 6, C.grid, 0.6);
  }
}

export async function downloadQuizSummaryPdf(questions, attempts, approvedCount) {
  const d = quizSummary(questions, attempts, approvedCount);
  const { doc, p } = await newDoc('Quiz Results Summary', await loadFonts());
  quizOverviewPage(p, d);
  quizSpeakerPage(p, d);
  quizQuestionsPages(p, d);
  footers(p, doc, 'Quiz Results Summary', d.generatedAt);
  download(await doc.save(), `PHILSAN-39th-Quiz-Summary-${today()}.pdf`);
}

// ======================================================================
// SURVEY
// ======================================================================

const TRIVIAL = /^(n\/?a|none|nothing|no|wala|-+|\.+|ok|okay)\.?$/i;

export function surveySummary(rows, approvedCount) {
  const total = rows.length;
  const extra = (r) => r.extra_answers || {};

  // Excellent → Poor ratings
  const ratingQs = SURVEY_QUESTIONS.filter((q) => q.type === 'choice' && q.options?.[0]?.value === 'excellent');
  const shortLabel = (q) => q.label.replace(/^[a-z]\.\s*/i, '').replace(/^How would you rate (your )?/i, '').replace(/\?$/, '');
  const ratings = ratingQs.map((q) => {
    const counts = q.options.map((o) => rows.filter((r) => r[q.key] === o.value).length);
    const n = counts.reduce((a, b) => a + b, 0);
    const label = { overall_experience: 'Overall experience', content_quality: 'Quality & relevance of topics' }[q.key] ||
      shortLabel(q).replace(/^./, (c) => c.toUpperCase());
    return { label, counts, n, positive: pctOf(counts[0] + counts[1], n) };
  });

  const helpfulYes = rows.filter((r) => r.content_helpful === 'yes').length;
  const helpfulNo = rows.filter((r) => r.content_helpful === 'no').length;
  const recQ = SURVEY_QUESTIONS.find((q) => q.key === 'recommend');
  const recommend = recQ.options.map((o) => ({ label: o.label, value: rows.filter((r) => r.recommend === o.value).length }));
  const recommendPct = pctOf(rows.filter((r) => ['very_likely', 'likely'].includes(r.recommend)).length, total);
  const overallPositive = ratings.find((r) => r.label === 'Overall experience')?.positive ?? 0;

  // Learning Session attended
  const lsQ = SPEAKER_QUESTIONS.find((q) => q.key === 'learning_session');
  const sessions = (lsQ?.options || []).map((o) => ({
    label: o.label,
    value: rows.filter((r) => extra(r).learning_session === o.value).length,
  }));

  // Speaker ratings (1–5): knowledge + delivery
  const speakerKeys = SPEAKER_QUESTIONS.filter((q) => q.key.endsWith('_knowledge'));
  const groups = [];
  for (const q of speakerKeys) {
    const base = q.key.replace(/_knowledge$/, '');
    const title = q.section.replace(/^Speaker Evaluation - /, '');
    const m = title.match(/^(Learning Session \d+):\s*(.+)$/);
    const group = m ? m[1] : 'Plenary speakers';
    const name = m ? m[2] : title;
    // Lemmen moved from Session 2 to 3: older answers saved as ls2_lemmen count too
    const keys = base === 'ls3_lemmen' ? [base, 'ls2_lemmen'] : [base];
    const vals = (suffix) =>
      rows.flatMap((r) => keys.map((k) => Number(extra(r)[`${k}_${suffix}`]))).filter((v) => v >= 1 && v <= 5);
    const k = vals('knowledge');
    const dl = vals('delivery');
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const both = [...k, ...dl];
    let g = groups.find((x) => x.title === group);
    if (!g) groups.push((g = { title: group, speakers: [] }));
    g.speakers.push({ name, knowledge: avg(k), delivery: avg(dl), overall: avg(both), n: Math.max(k.length, dl.length) });
  }

  // Written answers, in full (blank and "N/A"-type answers left out)
  const comments = SURVEY_QUESTIONS.filter((q) => q.type === 'text').map((q) => ({
    title: q.section,
    question: q.label,
    items: rows
      .map((r) => (r[q.key] || '').trim().replace(/\s+/g, ' '))
      .filter((t) => t && !TRIVIAL.test(t)),
  }));

  return {
    generatedAt: new Date(),
    total,
    approvedCount,
    rate: pctOf(total, approvedCount),
    ratings,
    overallPositive,
    helpfulYes,
    helpfulNo,
    recommend,
    recommendPct,
    sessions,
    groups,
    comments,
  };
}

function surveyOverviewPage(p, d) {
  p.addPage();
  let top = pageHeader(
    p,
    'Survey Results Summary',
    `${num(d.total)} participants answered the post-convention evaluation (${pct1(d.rate)} of ${num(d.approvedCount)} approved participants).`
  );
  const gw = (CW - 30) / 4;
  [
    ['Responses', num(d.total)],
    ['Response rate', pct1(d.rate), `of ${num(d.approvedCount)} approved`],
    ['Overall experience rated Excellent or Good', pct0(d.overallPositive)],
    ['Would recommend (Very likely + Likely)', pct0(d.recommendPct)],
  ].forEach(([label, value, sub], i) => statCard(p, M + i * (gw + 10), top, gw, 76, label, value, sub));

  top += 88;
  const box = card(p, M, top, CW, 280, 'How participants rated the convention');
  ratingBars(p, box, d.ratings);

  top += 292;
  donutCard(p, M, top, 200, 230, 'Was the content helpful and applicable?', [
    { label: 'Yes', value: d.helpfulYes, color: C.green },
    { label: 'No', value: d.helpfulNo, color: C.gray },
  ]);
  const box2 = card(p, M + 212, top, CW - 212, 230, 'Likelihood to recommend the convention');
  hBarChart(p, box2, d.recommend, { labelW: 80 });
}

function surveySpeakerPages(p, d) {
  if (!d.groups.length) return;
  const f = flow(
    p,
    'Speaker Evaluation',
    'Average ratings on a scale of 1 (lowest) to 5 (highest). Learning Session speakers were rated only by participants who attended that session.'
  );

  if (d.sessions.some((s) => s.value)) {
    const h = 52 + d.sessions.length * 20;
    const box = card(p, M, f.top, CW, h, 'Learning Session attended', 'As answered in the survey');
    hBarChart(p, box, d.sessions, { labelW: 130 });
    f.top += h + 14;
  }

  const nameW = 200;
  const colX = [M + nameW + 10, M + nameW + 80, M + nameW + 150]; // knowledge, delivery, overall
  const barX = M + nameW + 200;
  const barW = W - M - barX - 34;

  for (const g of d.groups) {
    const respondents = d.sessions.find((s) => s.label === g.title)?.value;
    sectionHeading(p, f, g.title, respondents ? `${num(respondents)} participants attended this session` : undefined);
    // column titles
    f.need(16 + 26);
    p.text('Speaker', M, f.top, { font: p.f.semibold, size: 8, color: C.muted });
    p.text('Knowledge', colX[0] + 30, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
    p.text('Delivery', colX[1] + 30, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
    p.text('Average', colX[2] + 22, f.top, { font: p.f.semibold, size: 8, color: C.muted, align: 'center' });
    f.top += 16;
    for (const s of g.speakers) {
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
    f.top += 8;
  }
}

function surveyCommentPages(p, d) {
  const groups = d.comments.filter((g) => g.items.length);
  if (!groups.length) return;
  const f = flow(p, 'Written Answers', 'Every written answer from the survey. Blank and "N/A"-type answers are left out.');
  const innerW = CW - 14;
  const safe = fontSafe(p);
  for (const g of groups) {
    sectionHeading(p, f, g.title, `${g.question} · ${num(g.items.length)} answers`);
    for (const raw of g.items) {
      const t = safe(raw);
      if (!t) continue;
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

export async function downloadSurveySummaryPdf(rows, approvedCount) {
  const d = surveySummary(rows, approvedCount);
  const { doc, p } = await newDoc('Survey Results Summary', await loadFonts());
  surveyOverviewPage(p, d);
  surveySpeakerPages(p, d);
  surveyCommentPages(p, d);
  footers(p, doc, 'Survey Results Summary', d.generatedAt);
  download(await doc.save(), `PHILSAN-39th-Survey-Summary-${today()}.pdf`);
}
