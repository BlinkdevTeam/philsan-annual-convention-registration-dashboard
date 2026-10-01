// PRC CPD forms for the 2nd Pet Symposium: CPDD-12-A (Registration Sheet)
// and CPDD-12-B (Attendance Sheet).
//
// Fully separate from the 39th convention's src/reports/cpdForms.js — nothing
// is shared, so changes here can never affect the 39th forms. It only reuses
// the same official template files in public/reports/.

import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

export const SYMPOSIUM_CPD_DEFAULTS = {
    program_title: 'Shaping the Future of Pet Nutrition: Trends, Technology & Consumer',
    date: 'October 5, 2026',
    venue: 'Okada Manila, Parañaque City, Metro Manila, Philippines',
    topics: '',
    time: '',
    room: '',
    signed_date: '',
};

// A license number is left OUT when it is blank, contains any letter (N/A, none, …),
// has no digits at all, or is all zeros.
const cleanLicense = (v) => {
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (/\p{L}/u.test(s)) return '';
    if (!/\d/.test(s)) return '';
    if (/^0+$/.test(s)) return '';
    return s;
};

// Included, but worth a second look before submitting to PRC
const licenseWarning = (lic) => {
    if (!/^\d+$/.test(lic)) return 'contains spaces or symbols';
    if (/^(\d)\1{2,}$/.test(lic)) return 'looks like a placeholder';
    return '';
};

// Expiry date for the PRC column, which is labelled DD/MM/YYYY:
//   "08/15/2027" (MM/DD/YYYY, as typed on the registration form) -> "15/08/2027"
//   "08/27"      (MM/YY, people who registered before the form changed) -> "08/2027"
export const expiryForPrc = (v) => {
    const s = String(v ?? '').trim();
    const full = /^(0[1-9]|1[0-2])\/(0[1-9]|[12]\d|3[01])\/(\d{4})$/.exec(s);
    if (full) return `${full[2]}/${full[1]}/${full[3]}`;
    const short = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(s);
    if (short) return `${short[1]}/20${short[2]}`;
    return '';
};

const clean = (s) => (s || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Surname first: "DELA CRUZ, JUAN SANTOS"
const fullName = (p) => {
    const last = clean(p.last_name);
    const given = [clean(p.first_name), clean(p.middle_name)].filter(Boolean).join(' ');
    return last && given ? `${last}, ${given}` : last || given;
};

export async function fetchSymposiumCpdPeople(supabase) {
    const size = 1000; // Supabase returns max 1000 rows per request
    const rows = [];
    for (let from = 0; ; from += size) {
        const { data, error } = await supabase
            .from('symposium_registrations')
            .select('id, first_name, middle_name, last_name, mobile, email, agri_license, license_expiry')
            .order('id', { ascending: true })
            .range(from, from + size - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []));
        if (!data || data.length < size) break;
    }

    const licensed = rows
        .map((p) => ({ ...p, license: cleanLicense(p.agri_license), expiry: expiryForPrc(p.license_expiry) }))
        .filter((p) => p.license)
        // A–Z by surname, then first name, then middle name
        .sort(
            (a, b) =>
                clean(a.last_name).localeCompare(clean(b.last_name), 'en', { sensitivity: 'base' }) ||
                clean(a.first_name).localeCompare(clean(b.first_name), 'en', { sensitivity: 'base' }) ||
                clean(a.middle_name).localeCompare(clean(b.middle_name), 'en', { sensitivity: 'base' })
        );

    return {
        total: rows.length,
        licensed, // goes on both CPDD-12-A and CPDD-12-B
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
    const s = { ...SYMPOSIUM_CPD_DEFAULTS, ...settings };
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
        signed_date: s.signed_date,
    };
}

// CPDD-12-A — Registration Sheet
export function buildSymposiumRegistrationSheet(templateBuf, people, settings) {
    return fill(templateBuf, {
        ...common(settings),
        rows: people.map((p, i) => ({
            no: String(i + 1),
            name: fullName(p),
            mobile: (p.mobile || '').trim(),
            email: (p.email || '').trim(),
            license: p.license,
            expiry: p.expiry,
        })),
    });
}

// CPDD-12-B — Attendance Sheet
export function buildSymposiumAttendanceSheet(templateBuf, people, settings) {
    return fill(templateBuf, {
        ...common(settings),
        rows: people.map((p, i) => ({ no: String(i + 1), name: fullName(p), license: p.license, expiry: p.expiry })),
    });
}
