// PRC CPD forms: CPDD-12-A (Registration Sheet) and CPDD-12-B (Attendance Sheet).
// Fills the official .docx templates (public/reports/cpdd-12-*-template.docx)
// with live participant data, keeping PRC's layout, logo and footer exactly.

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { fetchAll, EVENT } from './reportData.js';

export const CPD_DEFAULTS = {
  program_title: 'Fueling Progress: Shaping Animal Nutrition for a Competitive and Sustainable Future',
  date: EVENT.dateLabel,
  venue: '',
  topics: 'Gut Microbiome Revolution\nNext Generation Precision Nutrition\nNutrition Feed Solutions\nBreak-out Sessions',
  time: '',
  room: '',
  monitor_name: '',
  representative_name: '',
  signed_date: '',
};

const BLANK_LICENSE = /^(n\/?a|none|nil|-+|0+|\.+)$/i;

export const cleanLicense = (v) => {
  const s = String(v ?? '').trim();
  return !s || BLANK_LICENSE.test(s) ? '' : s;
};

// Worth a second look before submitting to PRC
export function licenseWarning(lic) {
  if (!/^\d+$/.test(lic)) return 'contains letters or symbols';
  if (/^(\d)\1{2,}$/.test(lic)) return 'looks like a placeholder';
  return '';
}

const fullName = (p) =>
  [p.first_name, p.middle_name, p.last_name]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();

export async function fetchCpdPeople(supabase) {
  const [participants, attendance] = await Promise.all([
    fetchAll(supabase, 'participants', 'id, first_name, middle_name, last_name, mobile, email, agri_license, reg_status'),
    fetchAll(supabase, 'attendance_logs', 'participant_id'),
  ]);
  const attended = new Set(attendance.map((a) => a.participant_id));

  const licensed = participants
    .filter((p) => p.reg_status === 'approved')
    .map((p) => ({ ...p, license: cleanLicense(p.agri_license), attended: attended.has(p.id) }))
    .filter((p) => p.license)
    .sort(
      (a, b) =>
        (a.last_name || '').localeCompare(b.last_name || '', 'en', { sensitivity: 'base' }) ||
        (a.first_name || '').localeCompare(b.first_name || '', 'en', { sensitivity: 'base' })
    );

  return {
    registered: licensed, // CPDD-12-A: approved participants with a PRC license
    attended: licensed.filter((p) => p.attended), // CPDD-12-B: of those, the ones who checked in
    warnings: licensed
      .map((p) => ({ name: fullName(p), license: p.license, reason: licenseWarning(p.license) }))
      .filter((w) => w.reason),
  };
}

function fill(templateBuf, data) {
  const doc = new Docxtemplater(new PizZip(templateBuf), {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'uint8array', compression: 'DEFLATE' });
}

function common(settings) {
  const s = { ...CPD_DEFAULTS, ...settings };
  return {
    program_title: s.program_title,
    date: s.date,
    venue: s.venue,
    topics: s.topics
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    time: s.time,
    room: s.room,
    monitor_name: s.monitor_name.toUpperCase(),
    representative_name: s.representative_name.toUpperCase(),
    signed_date: s.signed_date,
  };
}

// CPDD-12-A — Registration Sheet
export function buildRegistrationSheet(templateBuf, people, settings) {
  return fill(templateBuf, {
    ...common(settings),
    rows: people.map((p, i) => ({
      no: String(i + 1),
      name: fullName(p),
      mobile: (p.mobile || '').trim(),
      email: (p.email || '').trim(),
      license: p.license,
      expiry: '',
    })),
  });
}

// CPDD-12-B — Attendance Sheet
export function buildAttendanceSheet(templateBuf, people, settings) {
  return fill(templateBuf, {
    ...common(settings),
    rows: people.map((p, i) => ({ no: String(i + 1), name: fullName(p), license: p.license, expiry: '' })),
  });
}
