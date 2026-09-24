// Fetches everything the PRC report needs and turns it into chart-ready numbers.
// Pure aggregation (aggregateReport) is kept separate from fetching so it can be tested.

import { SURVEY_QUESTIONS } from '../lib/surveyQuestions.js';

export const EVENT = {
  date: '2026-10-06', // convention day (Asia/Manila) — registrations on this day count as onsite
  dateLabel: 'October 6, 2026',
  name: '39th PHILSAN Annual Convention',
};

const TZ = 'Asia/Manila';

// Supabase returns max 1000 rows per request — page through everything.
export async function fetchAll(supabase, table, columns) {
  const size = 1000;
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < size) break;
    from += size;
  }
  return rows;
}

export async function fetchReportRaw(supabase) {
  const [participants, attendance, survey, quizAttempts, quizQuestions, certificates] = await Promise.all([
    fetchAll(
      supabase,
      'participants',
      'id, company, age, membership, souvenir, certificate_needed, sponsored, sponsor, is_student, reg_status, created_at'
    ),
    fetchAll(supabase, 'attendance_logs', 'participant_id, scanned_at'),
    fetchAll(supabase, 'survey_responses', '*'),
    fetchAll(supabase, 'quiz_attempts', 'participant_id, answers, score, total'),
    fetchAll(supabase, 'quiz_questions', 'id, sort_order, session, speaker, question, correct_option'),
    fetchAll(supabase, 'certificates', 'participant_id'),
  ]);
  return { participants, attendance, survey, quizAttempts, quizQuestions, certificates };
}

// ---------- helpers ----------
const manilaDate = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD

function manilaMinutes(ts) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ts));
  const h = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const m = Number(parts.find((p) => p.type === 'minute').value);
  return h * 60 + m;
}

const countBy = (rows, keyFn) => {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return map;
};

const pct = (n, d) => (d ? (n / d) * 100 : 0);

const MEMBERSHIP = [
  ['non_member', 'Non-member'],
  ['regular', 'Regular'],
  ['Donor', 'Donor'],
  ['associate', 'Associate'],
];
const AGES = [
  ['20_and_below', '20 & below'],
  ['21_30', '21–30'],
  ['31_40', '31–40'],
  ['41_50', '41–50'],
  ['51_60', '51–60'],
  ['61_70', '61–70'],
  ['71_and_above', '71 & above'],
];
const SOUVENIR = [
  ['printed', 'Printed'],
  ['digital', 'Digital'],
  ['no', 'None'],
];

function fmtTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

// ---------- aggregation ----------
export function aggregateReport(raw, { topSponsors = 10, topCompanies = 10 } = {}) {
  const registered = raw.participants.filter((p) => p.reg_status === 'approved');
  const byId = new Map(raw.participants.map((p) => [p.id, p]));

  // First scan per participant
  const firstScan = new Map();
  for (const a of raw.attendance) {
    const prev = firstScan.get(a.participant_id);
    if (!prev || a.scanned_at < prev) firstScan.set(a.participant_id, a.scanned_at);
  }
  const attendees = [...firstScan.keys()].map((id) => byId.get(id)).filter(Boolean);
  const registeredPresent = registered.filter((p) => firstScan.has(p.id)).length;

  // Pre-registered vs onsite (registered on convention day)
  const onsite = registered.filter((p) => manilaDate(p.created_at) === EVENT.date).length;
  const preRegistered = registered.length - onsite;

  // Attendees per sponsor
  const sponsorCounts = countBy(attendees, (p) =>
    p.sponsored === 'yes' && p.sponsor?.trim() ? p.sponsor.trim() : '__self'
  );
  const selfPaying = sponsorCounts.get('__self') || 0;
  sponsorCounts.delete('__self');
  const sponsorsSorted = [...sponsorCounts.entries()].sort((a, b) => b[1] - a[1]);
  const sponsorItems = sponsorsSorted.slice(0, topSponsors).map(([label, value]) => ({ label, value }));
  const otherSponsors = sponsorsSorted.slice(topSponsors).reduce((s, [, v]) => s + v, 0);
  if (otherSponsors) sponsorItems.push({ label: `Other sponsors (${sponsorsSorted.length - topSponsors})`, value: otherSponsors });
  if (selfPaying) sponsorItems.push({ label: 'Self-paying', value: selfPaying });

  const ordered = (rows, key, defs) => {
    const c = countBy(rows, (r) => r[key]);
    const items = defs.map(([k, label]) => ({ label, value: c.get(k) || 0 }));
    const known = new Set(defs.map(([k]) => k));
    const unknown = [...c.entries()].filter(([k]) => !known.has(k)).reduce((s, [, v]) => s + v, 0);
    if (unknown) items.push({ label: 'Not stated', value: unknown });
    return items;
  };

  // Pre-registration trend (per day, before convention day)
  const regDays = countBy(
    registered.filter((p) => manilaDate(p.created_at) < EVENT.date),
    (p) => manilaDate(p.created_at)
  );
  const dayKeys = [...regDays.keys()].sort();
  const preRegTrend = [];
  if (dayKeys.length) {
    const d = new Date(dayKeys[0] + 'T00:00:00Z');
    const end = new Date(dayKeys[dayKeys.length - 1] + 'T00:00:00Z');
    while (d <= end) {
      const k = d.toISOString().slice(0, 10);
      preRegTrend.push({ label: k, value: regDays.get(k) || 0 });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // Time-in (first scan on convention day), 30-minute slots
  const slot = 30;
  const eventScans = [...firstScan.values()].filter((ts) => manilaDate(ts) === EVENT.date).map(manilaMinutes);
  const timeIn = [];
  if (eventScans.length) {
    const start = Math.floor(Math.min(...eventScans) / slot) * slot;
    const end = Math.floor(Math.max(...eventScans) / slot) * slot;
    const c = countBy(eventScans, (m) => Math.floor(m / slot) * slot);
    for (let m = start; m <= end; m += slot) timeIn.push({ label: fmtTime(m), value: c.get(m) || 0 });
  }
  const peakSlot = timeIn.reduce((best, t) => (!best || t.value > best.value ? t : best), null);

  // Companies
  const compCounts = countBy(
    attendees.filter((p) => p.company?.trim()),
    (p) => p.company.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ')
  );
  const companyNames = new Map();
  for (const p of attendees) {
    if (!p.company?.trim()) continue;
    const k = p.company.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');
    if (!companyNames.has(k)) companyNames.set(k, p.company.trim());
  }
  const topCompanyItems = [...compCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topCompanies)
    .map(([k, value]) => {
      return { label: companyNames.get(k), value };
    });

  // ---------- Survey ----------
  const survey = raw.survey;
  const ratingKeys = ['overall_experience', 'content_quality', 'venue', 'registration_process', 'time_management'];
  const ratingShort = {
    overall_experience: 'Overall experience',
    content_quality: 'Quality & relevance of topics',
    venue: 'Venue',
    registration_process: 'Registration process',
    time_management: 'Time management',
  };
  const ratingScale = ['excellent', 'good', 'fair', 'poor'];
  const ratings = ratingKeys.map((key) => {
    const c = countBy(survey, (r) => r[key]);
    const counts = ratingScale.map((v) => c.get(v) || 0);
    const n = counts.reduce((a, b) => a + b, 0);
    return { label: ratingShort[key], counts, n, positive: pct(counts[0] + counts[1], n) };
  });
  const helpfulYes = survey.filter((r) => r.content_helpful === 'yes').length;
  const recommendQ = SURVEY_QUESTIONS.find((q) => q.key === 'recommend');
  const recC = countBy(survey, (r) => r.recommend);
  const recommend = recommendQ.options.map((o) => ({ label: o.label, value: recC.get(o.value) || 0 }));

  const textKeys = SURVEY_QUESTIONS.filter((q) => q.type === 'text');
  const comments = textKeys.map((q) => ({
    title: q.section,
    question: q.label,
    items: survey
      .map((r) => (r[q.key] || '').trim().replace(/\s+/g, ' '))
      .filter((t) => t.length >= 15 && t.length <= 260 && !/^(n\/?a|none|nothing|no)\.?$/i.test(t))
      .filter((t, i, arr) => arr.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i) // no duplicates
      .sort((a, b) => b.length - a.length)
      .slice(0, 6),
  }));

  // ---------- Quiz ----------
  const attempts = raw.quizAttempts;
  const scorePcts = attempts.map((a) => pct(a.score, a.total));
  const avgScore = scorePcts.length ? scorePcts.reduce((a, b) => a + b, 0) / scorePcts.length : 0;
  const bins = ['0–19%', '20–39%', '40–59%', '60–79%', '80–100%'].map((label) => ({ label, value: 0 }));
  for (const s of scorePcts) bins[Math.min(4, Math.floor(s / 20))].value += 1;

  const speakerStats = new Map();
  for (const q of [...raw.quizQuestions].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!speakerStats.has(q.speaker)) speakerStats.set(q.speaker, { correct: 0, answered: 0, session: q.session });
    const s = speakerStats.get(q.speaker);
    for (const a of attempts) {
      const ans = a.answers?.[q.id] ?? a.answers?.[String(q.id)];
      if (!ans) continue;
      s.answered += 1;
      if (ans === q.correct_option) s.correct += 1;
    }
  }
  const bySpeaker = [...speakerStats.entries()].map(([label, s]) => ({
    label,
    value: Math.round(pct(s.correct, s.answered)),
  }));

  // ---------- Funnel ----------
  const attendeeIds = new Set(firstScan.keys());
  const surveyIds = new Set(survey.map((r) => r.participant_id));
  const quizIds = new Set(attempts.map((a) => a.participant_id));
  const funnel = [
    { label: 'Registered', value: registered.length },
    { label: 'Attended', value: attendeeIds.size },
    { label: 'Answered the survey', value: surveyIds.size },
    { label: 'Took the quiz', value: quizIds.size },
    { label: 'Received a certificate', value: raw.certificates.length },
  ];

  return {
    generatedAt: new Date(),
    attendance: {
      registered: registered.length,
      attendees: attendeeIds.size,
      present: registeredPresent,
      absent: registered.length - registeredPresent,
      preRegistered,
      onsite,
      sponsorItems,
      sponsorCount: sponsorsSorted.length,
      membership: ordered(attendees, 'membership', MEMBERSHIP),
    },
    registration: { preRegTrend, timeIn, peakSlot, firstDay: dayKeys[0], lastDay: dayKeys[dayKeys.length - 1] },
    profile: {
      age: ordered(attendees, 'age', AGES),
      students: attendees.filter((p) => p.is_student === 'yes').length,
      professionals: attendees.filter((p) => p.is_student !== 'yes').length,
      souvenir: ordered(attendees, 'souvenir', SOUVENIR),
      certYes: attendees.filter((p) => p.certificate_needed === 'yes').length,
      certNo: attendees.filter((p) => p.certificate_needed !== 'yes').length,
      topCompanies: topCompanyItems,
      companyCount: compCounts.size,
    },
    survey: {
      responses: survey.length,
      rate: pct(survey.length, attendeeIds.size),
      ratings,
      helpfulYes,
      helpfulNo: survey.length - helpfulYes,
      recommend,
      recommendPct: pct((recC.get('very_likely') || 0) + (recC.get('likely') || 0), survey.length),
      comments,
    },
    quiz: {
      attempts: attempts.length,
      rate: pct(attempts.length, attendeeIds.size),
      avgScore,
      highest: scorePcts.length ? Math.max(...scorePcts) : 0,
      perfect: attempts.filter((a) => a.score === a.total).length,
      bins,
      bySpeaker,
      questionCount: raw.quizQuestions.length,
    },
    funnel,
  };
}
