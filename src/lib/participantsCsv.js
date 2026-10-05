// src/lib/participantsCsv.js
// 39th Annual Convention: downloads participants as a CSV file.
// Used by the Overview page (all approved) and the admin sponsor page (per sponsor).
import { supabase } from './supabaseClient';

const COLUMNS = [
    ['Last name',       (p) => p.last_name],
    ['First name',      (p) => p.first_name],
    ['Middle name',     (p) => p.middle_name],
    ['Email',           (p) => p.email],
    ['Mobile',          (p) => p.mobile],
    ['Company',         (p) => p.company],
    ['Position',        (p) => p.position],
    ['PRC license',     (p) => p.agri_license],
    ['Membership',      (p) => p.membership],
    ['Sponsored',       (p) => p.sponsored],
    ['Sponsor',         (p) => p.sponsor],
    ['Payment',         (p) => p.payment],
    ['Status',          (p) => p.reg_status],
    ['Souvenir',        (p) => p.souvenir],
    ['Certificate',     (p) => p.certificate_needed],
    ['Age',             (p) => p.age],
    ['Student',         (p) => (p.is_student ? 'yes' : 'no')],
    ['Registered on',   (p) => (p.created_at ? new Date(p.created_at).toLocaleString('en-PH') : '')],
];

const SELECT = 'last_name, first_name, middle_name, email, mobile, company, position, agri_license, membership, sponsored, sponsor, payment, reg_status, souvenir, certificate_needed, age, is_student, created_at';

// Supabase returns at most 1000 rows per request, so fetch in pages.
async function fetchAll(filters) {
    const PAGE = 1000;
    const rows = [];
    for (let from = 0; ; from += PAGE) {
        let q = supabase.from('participants').select(SELECT);
        for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
        const { data, error } = await q
            .order('last_name', { ascending: true })
            .order('first_name', { ascending: true })
            .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...data);
        if (data.length < PAGE) break;
    }
    return rows;
}

// Quotes every value so commas, quotes and line breaks inside a value are safe
function csvCell(v) {
    return '"' + String(v ?? '').replace(/"/g, '""') + '"';
}

// filters: e.g. { reg_status: 'approved' } or { sponsor: 'AgriPro' }
// Returns the number of rows written.
export async function downloadParticipantsCsv({ filters = {}, filename }) {
    const rows = await fetchAll(filters);
    const lines = [
        ['No.', ...COLUMNS.map(([h]) => h)].map(csvCell).join(','),
        ...rows.map((p, i) => [i + 1, ...COLUMNS.map(([, get]) => get(p))].map(csvCell).join(',')),
    ];
    // BOM so Excel opens names with ñ and other accents correctly
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return rows.length;
}