// src/symposium/SymposiumLicenseForm.jsx
// 2nd Pet Symposium: PRC license step shown in the portal before Quiz / Survey / Certificate.
// Needs symposium_license_gate.sql (functions symposium_get_license / symposium_save_license).
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { GREEN } from '../components/PortalShell';

const SAVE_RPC = 'symposium_save_license';

const RAGR_FIELDS = [
  'Feed Mill Company',
  'Government',
  'Feed Ingredient Company',
  'Cooperative',
  'Academe',
  'Business Owner',
  'Consultancy',
  'Others',
];

const EMPTY = {
  has_prc_license: '',
  prc_license_number: '',
  prc_license_expiry: '',
  prc_signature: '',
  ragr_nutritionist: '',
  ragr_field: '',
  ragr_field_other: '',
};

const inputClass =
  'mt-3 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1F773A]';

// Signature: draw with finger/mouse, or upload a photo/scan.
// Either way it is saved as a 600x200 transparent PNG (data URL) with dark ink.
function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload'
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (!value) return; // show a previously saved signature
    const c = canvasRef.current;
    const img = new Image();
    img.onload = () => c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    img.src = value;
  }, []);

  const point = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const stroke = (from, to) => {
    const g = canvasRef.current.getContext('2d');
    g.strokeStyle = '#111';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    g.stroke();
  };
  const start = (e) => {
    if (mode !== 'draw') return;
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    stroke(last.current, { x: last.current.x + 0.1, y: last.current.y + 0.1 });
  };
  const move = (e) => {
    if (!drawing.current) return;
    const p = point(e);
    stroke(last.current, p);
    last.current = p;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(canvasRef.current.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    if (fileRef.current) fileRef.current.value = '';
    setUploadError('');
    onChange('');
  };

  // Uploaded photo/scan -> paper becomes transparent, ink becomes dark,
  // cropped to the signature and fitted into the box
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    if (!file.type.startsWith('image/')) {
      setUploadError('Please choose an image file (photo or scan of your signature).');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      // 1) Work on a reduced copy (max 1200px wide) to keep phones fast
      const k = Math.min(1, 1200 / img.width);
      const work = document.createElement('canvas');
      work.width = Math.max(1, Math.round(img.width * k));
      work.height = Math.max(1, Math.round(img.height * k));
      const wg = work.getContext('2d');
      wg.drawImage(img, 0, 0, work.width, work.height);
      const data = wg.getImageData(0, 0, work.width, work.height);
      const px = data.data;
      // 2) How bright is the paper in this photo? (most pixels are paper)
      const hist = new Array(256).fill(0);
      for (let i = 0; i < px.length; i += 4) {
        hist[Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2])]++;
      }
      let seen = 0;
      let paper = 255;
      const target = (px.length / 4) * 0.5; // median brightness ≈ paper
      for (let v = 0; v < 256; v++) {
        seen += hist[v];
        if (seen >= target) { paper = v; break; }
      }
      const cut = paper * 0.72; // clearly darker than the paper = ink
      // 3) Mark dark pixels, then drop dark areas touching the photo's edge
      //    (shadows, table edges, fingers) — a signature sits inside the paper
      const W = work.width;
      const H = work.height;
      const n = W * H;
      const lumArr = new Float32Array(n);
      const dark = new Uint8Array(n);
      for (let p = 0; p < n; p++) {
        const i = p * 4;
        const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        lumArr[p] = lum;
        dark[p] = px[i + 3] > 0 && lum < cut ? 1 : 0;
      }
      const stack = [];
      const pushIfDark = (p) => { if (dark[p] === 1) { dark[p] = 2; stack.push(p); } };
      for (let x = 0; x < W; x++) { pushIfDark(x); pushIfDark((H - 1) * W + x); }
      for (let y = 0; y < H; y++) { pushIfDark(y * W); pushIfDark(y * W + W - 1); }
      while (stack.length) {
        const p = stack.pop();
        const x = p % W;
        if (x > 0) pushIfDark(p - 1);
        if (x < W - 1) pushIfDark(p + 1);
        if (p >= W) pushIfDark(p - W);
        if (p < n - W) pushIfDark(p + W);
      }
      // Paper/edge areas -> transparent, ink -> dark; count ink per column and row
      const cols = new Array(W).fill(0);
      const rows = new Array(H).fill(0);
      let total = 0;
      for (let p = 0; p < n; p++) {
        const i = p * 4;
        const isInk = dark[p] === 1;
        px[i] = 17;
        px[i + 1] = 17;
        px[i + 2] = 17;
        px[i + 3] = isInk ? Math.max(0, Math.min(255, Math.round((cut - lumArr[p]) * 4 + 80))) : 0;
        if (isInk) {
          const x = p % W;
          cols[x]++;
          rows[(p - x) / W]++;
          total++;
        }
      }
      // Crop box: ignore the outer 1% of ink on each side (stray specks, shadows)
      const range = (counts) => {
        let acc = 0, lo = 0, hi = counts.length - 1;
        for (let v = 0; v < counts.length; v++) { acc += counts[v]; if (acc > total * 0.01) { lo = v; break; } }
        acc = 0;
        for (let v = counts.length - 1; v >= 0; v--) { acc += counts[v]; if (acc > total * 0.01) { hi = v; break; } }
        return [lo, hi];
      };
      const [minX, maxX] = range(cols);
      const [minY, maxY] = range(rows);
      if (total < 30 || maxX <= minX || maxY <= minY) {
        setUploadError('No signature found in this image. Please use a clear photo with dark ink on light paper.');
        return;
      }
      wg.putImageData(data, 0, 0);
      // 4) Crop to the signature and fit it into the box
      const c = canvasRef.current;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;
      const pad = 12;
      const scale = Math.min((c.width - pad * 2) / cw, (c.height - pad * 2) / ch);
      const w = cw * scale;
      const h = ch * scale;
      g.drawImage(work, minX, minY, cw, ch, (c.width - w) / 2, (c.height - h) / 2, w, h);
      onChange(c.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (fileRef.current) fileRef.current.value = '';
      setUploadError('This image could not be read. Please try a JPG or PNG photo.');
    };
    img.src = url;
  };

  const tab = (m, label) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
        mode === m ? 'border-[#1F773A] bg-[#1F773A] text-white' : 'border-gray-300 text-gray-700 hover:border-[#1F773A]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-3">
      <div className="flex gap-2 mb-3">
        {tab('draw', '✍️ Draw signature')}
        {tab('upload', '📷 Upload image')}
      </div>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onPointerLeave={end}
        className="w-full rounded-lg border border-dashed border-gray-400 bg-white"
        style={{ touchAction: mode === 'draw' ? 'none' : 'auto', aspectRatio: '3 / 1' }}
      />
      {mode === 'upload' && (
        <div className="mt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-[#EAF3DE] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#1F773A]"
          />
          {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
        </div>
      )}
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-gray-500">
          {mode === 'draw'
            ? 'Sign inside the box using your finger or mouse.'
            : 'Use a clear photo or scan of your signature on white paper.'}
        </p>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function Choice({ name, options, value, onChange }) {
  return (
    <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <label
            key={opt}
            className={`cursor-pointer rounded-lg border px-4 py-2 text-sm text-center transition ${
              selected ? 'border-[#1F773A] bg-[#1F773A] text-white' : 'border-gray-300 text-gray-700 hover:border-[#1F773A]'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt}
              checked={selected}
              onChange={() => onChange(opt)}
              className="sr-only"
            />
            {opt}
          </label>
        );
      })}
    </div>
  );
}

/**
 * props:
 *   email       — the logged-in email
 *   registered  — { license_number, license_expiry } from registration (pre-fill)
 *   initial     — previously saved answers, or null
 *   onSaved()   — called after a successful save
 *   onCancel()  — optional; shows a Cancel button (used when editing)
 */
export default function SymposiumLicenseForm({ email, registered, initial, onSaved, onCancel }) {
  const [a, setA] = useState(() => ({ ...EMPTY, ...(initial || {}) }));
  const [missing, setMissing] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const licensed = a.has_prc_license === 'Yes';
  const ragr = licensed && a.ragr_nutritionist === 'Yes';
  const other = ragr && a.ragr_field === 'Others';

  function set(key, value) {
    setA((prev) => {
      const next = { ...prev, [key]: value };
      // Saying "Yes" fills in what was given at registration (still editable)
      if (key === 'has_prc_license' && value === 'Yes') {
        if (!next.prc_license_number && registered?.license_number) next.prc_license_number = registered.license_number;
        if (!next.prc_license_expiry && registered?.license_expiry) next.prc_license_expiry = registered.license_expiry;
      }
      return next;
    });
    setMissing((m) => m.filter((k) => k !== key));
    setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const required = ['has_prc_license'];
    if (licensed) required.push('prc_license_number', 'prc_license_expiry', 'prc_signature', 'ragr_nutritionist');
    if (ragr) required.push('ragr_field');
    if (other) required.push('ragr_field_other');
    const miss = required.filter((k) => !String(a[k] || '').trim());
    setMissing(miss);
    if (miss.length) {
      setError('Please answer all required questions.');
      document.getElementById(`lic-${miss[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Only answers that apply are sent
    const payload = { has_prc_license: a.has_prc_license };
    if (licensed) {
      Object.assign(payload, {
        prc_license_number: a.prc_license_number.trim(),
        prc_license_expiry: a.prc_license_expiry,
        prc_signature: a.prc_signature,
        ragr_nutritionist: a.ragr_nutritionist,
      });
      if (ragr) payload.ragr_field = a.ragr_field;
      if (other) payload.ragr_field_other = a.ragr_field_other.trim();
    }

    setError('');
    setSaving(true);
    const { error: rpcError } = await supabase.rpc(SAVE_RPC, { p_email: email, p_answers: payload });
    setSaving(false);
    if (rpcError) {
      const msg = rpcError.message || '';
      setError(
        msg.includes('incomplete')
          ? 'Some answers are missing or invalid. Please check the form.'
          : msg.includes('not_registered') || msg.includes('not_timed_in')
            ? 'We could not find your registration. Please contact the PHILSAN secretariat.'
            : 'Could not save. Please check your connection and try again.'
      );
      return;
    }
    onSaved();
  }

  const box = (key) =>
    `bg-white rounded-xl shadow-sm p-5 border ${missing.includes(key) ? 'border-red-400' : 'border-transparent'}`;
  const req = <span className="text-red-500">*</span>;
  const missMsg = (key) =>
    missing.includes(key) && <p className="text-xs text-red-600 mt-2">This is a required question.</p>;

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
      <div className="px-1 pt-2">
        <h2 className="font-bold text-[#1F773A]">PRC License Information</h2>
        <p className="text-sm text-gray-600">Please answer this first. The quiz, survey and certificate open after.</p>
      </div>

      <div id="lic-has_prc_license" className={box('has_prc_license')}>
        <p className="font-medium text-gray-800">Do you have a PRC license? {req}</p>
        <Choice name="has_prc_license" options={['Yes', 'No']} value={a.has_prc_license} onChange={(v) => set('has_prc_license', v)} />
        {missMsg('has_prc_license')}
      </div>

      {licensed && (
        <>
          <div id="lic-prc_license_number" className={box('prc_license_number')}>
            <p className="font-medium text-gray-800">PRC license number {req}</p>
            <input
              type="text"
              value={a.prc_license_number}
              onChange={(e) => set('prc_license_number', e.target.value)}
              placeholder="e.g. 0012345"
              className={inputClass}
            />
            {missMsg('prc_license_number')}
          </div>

          <div id="lic-prc_license_expiry" className={box('prc_license_expiry')}>
            <p className="font-medium text-gray-800">PRC license expiration date {req}</p>
            <input
              type="date"
              value={a.prc_license_expiry}
              onChange={(e) => set('prc_license_expiry', e.target.value)}
              className={inputClass}
            />
            {missMsg('prc_license_expiry')}
          </div>

          <div id="lic-prc_signature" className={box('prc_signature')}>
            <p className="font-medium text-gray-800">E-signature (for your CPD record) {req}</p>
            <SignaturePad value={a.prc_signature} onChange={(v) => set('prc_signature', v)} />
            {missMsg('prc_signature')}
          </div>

          <div id="lic-ragr_nutritionist" className={box('ragr_nutritionist')}>
            <p className="font-medium text-gray-800">
              Are you a Registered Agriculturist (RAgr) working as an animal nutritionist? {req}
            </p>
            <Choice name="ragr_nutritionist" options={['Yes', 'No']} value={a.ragr_nutritionist} onChange={(v) => set('ragr_nutritionist', v)} />
            {missMsg('ragr_nutritionist')}
          </div>

          {ragr && (
            <div id="lic-ragr_field" className={box('ragr_field')}>
              <p className="font-medium text-gray-800">If yes, which field? {req}</p>
              <Choice name="ragr_field" options={RAGR_FIELDS} value={a.ragr_field} onChange={(v) => set('ragr_field', v)} />
              {missMsg('ragr_field')}
            </div>
          )}

          {other && (
            <div id="lic-ragr_field_other" className={box('ragr_field_other')}>
              <p className="font-medium text-gray-800">Others: Kindly specify {req}</p>
              <input
                type="text"
                value={a.ragr_field_other}
                onChange={(e) => set('ragr_field_other', e.target.value)}
                placeholder="Your answer"
                className={inputClass}
              />
              {missMsg('ragr_field_other')}
            </div>
          )}
        </>
      )}

      {error && <p className="text-sm text-red-600 px-1">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-300 py-3 font-semibold text-gray-700"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg py-3 font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: GREEN }}
        >
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </form>
  );
}