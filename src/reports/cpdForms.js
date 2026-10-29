// PRC CPD forms: CPDD-12-A (Registration Sheet) and CPDD-12-B (Attendance Sheet).
// Fills the official .docx templates (public/reports/cpdd-12-*-template.docx)
// with live participant data, keeping PRC's layout, logo and footer exactly.
// Each person's e-signature (drawn or uploaded in the portal's PRC license step)
// is placed in the SIGNATURE column. People without one get an empty cell.
// When the registration license is blank or invalid, the license number from the
// portal's PRC license step is used instead.

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
  signed_date: '',
};

// A license number is left OUT of the CPD forms when it is:
//   - blank
//   - contains any letter (N/A, NA, n/a, none, "pending", "A12345", …)
//   - has no digits at all ("-", "...", "/")
//   - is all zeros ("0", "0000")
export const cleanLicense = (v) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/\p{L}/u.test(s)) return '';
  if (!/\d/.test(s)) return '';
  if (/^0+$/.test(s)) return '';
  return s;
};

// Included, but worth a second look before submitting to PRC
export function licenseWarning(lic) {
  if (!/^\d+$/.test(lic)) return 'contains spaces or symbols';
  if (/^(\d)\1{2,}$/.test(lic)) return 'looks like a placeholder';
  return '';
}

const clean = (s) => (s || '').trim().replace(/\s+/g, ' ').toUpperCase();

// Surname first, for the alphabetical PRC lists: "DELA CRUZ, JUAN SANTOS"
const fullName = (p) => {
  const last = clean(p.last_name);
  const given = [clean(p.first_name), clean(p.middle_name)].filter(Boolean).join(' ');
  return last && given ? `${last}, ${given}` : last || given;
};

export async function fetchCpdPeople(supabase) {
  const [participants, attendance] = await Promise.all([
    fetchAll(supabase, 'participants', 'id, first_name, middle_name, last_name, mobile, email, agri_license, reg_status'),
    fetchAll(supabase, 'attendance_logs', 'participant_id'),
  ]);
  const attended = new Set(attendance.map((a) => a.participant_id));
  const { signatures, portalLicense } = await fetchSignatures(supabase);

  const licensed = participants
    .filter((p) => p.reg_status === 'approved')
    .map((p) => ({
      ...p,
      // the registration license; if that one is blank or invalid ("N/A"),
      // the license number the person gave in the portal's PRC license step
      license: cleanLicense(p.agri_license) || cleanLicense(portalLicense.get(p.id)),
      attended: attended.has(p.id),
    }))
    .filter((p) => p.license)
    .map((p) => ({ ...p, signature: signatures.get(p.id) || null }))
    // A–Z by surname, then first name, then middle name (ignores case, extra spaces and accents)
    .sort(
      (a, b) =>
        clean(a.last_name).localeCompare(clean(b.last_name), 'en', { sensitivity: 'base' }) ||
        clean(a.first_name).localeCompare(clean(b.first_name), 'en', { sensitivity: 'base' }) ||
        clean(a.middle_name).localeCompare(clean(b.middle_name), 'en', { sensitivity: 'base' })
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
    signed_date: s.signed_date,
  };
}

// CPDD-12-A — Registration Sheet
export function buildRegistrationSheet(templateBuf, people, settings) {
  const out = fill(templateBuf, {
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
  return addSignatures(out, people, { maxWidthIn: 1.6, maxHeightIn: 0.45 });
}

// CPDD-12-B — Attendance Sheet
export function buildAttendanceSheet(templateBuf, people, settings) {
  const out = fill(templateBuf, {
    ...common(settings),
    rows: people.map((p, i) => ({ no: String(i + 1), name: fullName(p), license: p.license, expiry: '' })),
  });
  return addSignatures(out, people, { maxWidthIn: 1.1, maxHeightIn: 0.3 });
}

// ---------------------------------------------------------------------------
// E-signatures
// ---------------------------------------------------------------------------

// From the portal's PRC license step:
//   signatures:    Map participant_id -> { bytes, width, height } (PNG, cropped)
//   portalLicense: Map participant_id -> license number typed in the portal
async function fetchSignatures(supabase) {
  const size = 100; // signatures are images, so read them in small pages
  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .rpc('cpd_signatures')
      .order('participant_id')
      .range(from, from + size - 1);
    if (error) {
      throw new Error(
        /cpd_signatures/.test(error.message || '')
          ? 'Signatures could not be loaded: run cpd_signatures.sql in Supabase first.'
          : `Signatures could not be loaded: ${error.message}`
      );
    }
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  const signatures = new Map();
  const portalLicense = new Map();
  for (const r of rows) {
    if (r.license_number) portalLicense.set(r.participant_id, r.license_number);
    const img = await cropSignature(r.signature).catch(() => null);
    if (img) signatures.set(r.participant_id, img);
  }
  return { signatures, portalLicense };
}

// Cuts the empty space around a signature so it fills the cell, and returns PNG bytes.
function cropSignature(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!/^data:image\/png;base64,/.test(dataUrl || '')) return resolve(null);
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let x0 = width, y0 = height, x1 = -1, y1 = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const ink = data[i + 3] > 40 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 200;
          if (ink) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 < 0) return resolve(null); // blank pad
      const pad = 4;
      x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
      x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
      const w = x1 - x0 + 1, h = y1 - y0 + 1;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      out.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
      out.toBlob(async (blob) => {
        if (!blob) return resolve(null);
        resolve({ bytes: new Uint8Array(await blob.arrayBuffer()), width: w, height: h });
      }, 'image/png');
    };
    img.src = dataUrl;
  });
}

const NS = {
  w: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  wp: 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  pic: 'http://schemas.openxmlformats.org/drawingml/2006/picture',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
};
const EMU_PER_INCH = 914400;

const cellText = (tc) =>
  Array.from(tc.getElementsByTagNameNS(NS.w, 't'))
    .map((t) => t.textContent)
    .join('')
    .trim();

const directChildren = (el, name) =>
  Array.from(el.childNodes).filter((n) => n.nodeType === 1 && n.namespaceURI === NS.w && n.localName === name);

// [{ tc, start }] for one table row, where start = the grid column the cell begins at
function cellsWithColumns(tr) {
  let col = 0;
  const trPr = directChildren(tr, 'trPr')[0];
  const before = trPr && directChildren(trPr, 'gridBefore')[0];
  if (before) col = parseInt(before.getAttributeNS(NS.w, 'val') || before.getAttribute('w:val') || '0', 10) || 0;
  return directChildren(tr, 'tc').map((tc) => {
    const tcPr = directChildren(tc, 'tcPr')[0];
    const span = tcPr && directChildren(tcPr, 'gridSpan')[0];
    const n = span ? parseInt(span.getAttributeNS(NS.w, 'val') || span.getAttribute('w:val') || '1', 10) || 1 : 1;
    const cell = { tc, start: col, end: col + n };
    col += n;
    return cell;
  });
}

function drawingRun(doc, relId, docPrId, cx, cy) {
  const xml =
    `<w:r xmlns:w="${NS.w}"><w:drawing>` +
    `<wp:inline xmlns:wp="${NS.wp}" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${docPrId}" name="Signature ${docPrId}"/>` +
    `<a:graphic xmlns:a="${NS.a}"><a:graphicData uri="${NS.pic}">` +
    `<pic:pic xmlns:pic="${NS.pic}">` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="signature${docPrId}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS.r}" r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const frag = new DOMParser().parseFromString(xml, 'application/xml');
  return doc.importNode(frag.documentElement, true);
}

// Puts each person's signature into the SIGNATURE column of the filled form.
// Rows are matched by their NO. (row 1 = people[0], …), the same order they were filled in.
function addSignatures(docxBytes, people, { maxWidthIn, maxHeightIn }) {
  if (!people.some((p) => p.signature)) return docxBytes;

  const zip = new PizZip(docxBytes);
  const doc = new DOMParser().parseFromString(zip.file('word/document.xml').asText(), 'application/xml');
  let rels = zip.file('word/_rels/document.xml.rels').asText();
  let added = 0;

  for (const tbl of Array.from(doc.getElementsByTagNameNS(NS.w, 'tbl'))) {
    const rows = directChildren(tbl, 'tr');
    let sigCol = null;
    for (const tr of rows) {
      const cells = cellsWithColumns(tr);
      if (sigCol === null) {
        const head = cells.find((c) => cellText(c.tc).toUpperCase() === 'SIGNATURE');
        if (head) sigCol = head.start;
        continue;
      }
      const no = cells.length ? cellText(cells[0].tc) : '';
      if (!/^\d+$/.test(no)) continue;
      const person = people[parseInt(no, 10) - 1];
      const sig = person && person.signature;
      if (!sig) continue;
      const cell = cells.find((c) => c.start <= sigCol && sigCol < c.end);
      if (!cell) continue;

      added += 1;
      const relId = `rIdCpdSig${added}`;
      zip.file(`word/media/cpd-signature-${added}.png`, sig.bytes);
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="${NS.r}/image" Target="media/cpd-signature-${added}.png"/></Relationships>`
      );

      const k = Math.min((maxWidthIn * 96) / sig.width, (maxHeightIn * 96) / sig.height);
      const cx = Math.round(((sig.width * k) / 96) * EMU_PER_INCH);
      const cy = Math.round(((sig.height * k) / 96) * EMU_PER_INCH);

      let p = directChildren(cell.tc, 'p')[0];
      if (!p) {
        p = doc.createElementNS(NS.w, 'w:p');
        cell.tc.appendChild(p);
      }
      let pPr = directChildren(p, 'pPr')[0];
      if (!pPr) {
        pPr = doc.createElementNS(NS.w, 'w:pPr');
        p.insertBefore(pPr, p.firstChild);
      }
      if (!directChildren(pPr, 'jc')[0]) {
        const jc = doc.createElementNS(NS.w, 'w:jc');
        jc.setAttributeNS(NS.w, 'w:val', 'center');
        pPr.appendChild(jc);
      }
      p.appendChild(drawingRun(doc, relId, 9000 + added, cx, cy));
    }
  }

  if (!added) return docxBytes;

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  zip.file('word/_rels/document.xml.rels', rels);
  let types = zip.file('[Content_Types].xml').asText();
  if (!/Extension="png"/i.test(types)) {
    types = types.replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>');
    zip.file('[Content_Types].xml', types);
  }
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}