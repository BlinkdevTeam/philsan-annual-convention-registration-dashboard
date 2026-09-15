import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const SUPABASE_URL    = 'https://pskballrwzdbovtylgjs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

// TODO: replace with deployed Edge Function URL
const SPONSOR_PARTICIPANTS_URL = '';
const VALIDATE_EMAIL_MX_URL    = 'https://pskballrwzdbovtylgjs.supabase.co/functions/v1/validate-email-mx';

const MEMBERSHIP_OPTIONS = ['regular', 'associate', 'Donor', 'non_member'];
const SOUVENIR_OPTIONS   = ['no', 'digital', 'printed'];
const AGE_OPTIONS = [
    '20_and_below', '21_30', '31_40', '41_50', '51_60', '61_70', '71_and_above',
];

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

const REQUIRED_COLUMNS = [
    'first_name','last_name','middle_name','email','mobile',
    'company','position','agri_license','membership','age',
    'is_student','certificate_needed','souvenir'
];

const ALLOWED_VALUES = {
    membership:          ['regular','associate','Donor','non_member'],
    age:                 ['20_and_below','21_30','31_40','41_50','51_60','61_70','71_and_above'],
    is_student:          ['yes','no'],
    certificate_needed:  ['yes','no'],
    souvenir:            ['no','digital'],
};

// CSV template content
const CSV_TEMPLATE = [
    REQUIRED_COLUMNS.join(','),
    '# membership: regular | associate | Donor | non_member',
    '# age: 20_and_below | 21_30 | 31_40 | 41_50 | 51_60 | 61_70 | 71_and_above',
    '# is_student: yes | no',
    '# certificate_needed: yes | no',
    '# souvenir: no | digital',
    '# Delete the comment lines above before uploading',
    'Juan,Dela Cruz,Santos,juan@example.com,09171234567,Acme Corp,Manager,N/A,regular,31_40,no,yes,no',
].join('\n');

function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'philsan-bulk-registration-template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function parseCSV(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const rows    = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim());
        const obj  = {};
        headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
        return obj;
    });
    return { headers, rows };
}

function validateRow(row, index) {
    const errors = [];

    // Required fields
    for (const col of REQUIRED_COLUMNS) {
        if (!row[col] || !row[col].toString().trim()) {
            errors.push(`Row ${index + 1}: "${col}" is required.`);
        }
    }

    // Fixed value fields
    for (const [field, allowed] of Object.entries(ALLOWED_VALUES)) {
        if (row[field] && !allowed.includes(row[field].trim())) {
            errors.push(`Row ${index + 1}: "${field}" must be one of: ${allowed.join(', ')}. Got "${row[field]}".`);
        }
    }

    return errors;
}

export default function SponsorStatus() {
    const { slug }     = useParams();
    const navigate     = useNavigate();
    const fileRef      = useRef(null);

    const [auth, setAuth]               = useState(null);
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState('');
    const [searchTerm, setSearchTerm]   = useState('');

    // Edit participant state
    const [editingParticipant, setEditingParticipant] = useState(null);
    const [editForm, setEditForm]       = useState(null);
    const [editError, setEditError]     = useState('');
    const [editSaving, setEditSaving]   = useState(false);

    // Status change (cancel / make pending) state
    const [pendingStatusAction, setPendingStatusAction] = useState(null); // { participant, newStatus }
    const [statusActionSaving, setStatusActionSaving]   = useState(false);
    const [statusActionError, setStatusActionError]     = useState('');

    // Bulk upload state
    const [uploadStep, setUploadStep]   = useState('idle'); // idle | validating | preview | importing | done
    const [parsedRows, setParsedRows]   = useState([]);
    const [validRows, setValidRows]     = useState([]);
    const [skippedRows, setSkippedRows] = useState([]);
    const [importResults, setImportResults] = useState(null);

    useEffect(() => {
        const stored = sessionStorage.getItem('philsan_sponsor_auth');
        if (!stored) { navigate(`/sponsor/${slug}`); return; }
        const parsedAuth = JSON.parse(stored);
        if (parsedAuth.slug !== slug) { navigate(`/sponsor/${slug}`); return; }
        setAuth(parsedAuth);
        fetchParticipants(parsedAuth);
    }, [slug]);

    async function fetchParticipants(authData) {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/participants?sponsor=eq.${encodeURIComponent(authData.name)}&order=reg_request.desc`,
                {
                    headers: {
                        apikey: SUPABASE_ANON_KEY,
                        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                    }
                }
            );
            const data = await res.json();
            if (!res.ok) throw data;
            setParticipants(data ?? []);
        } catch {
            setError("Couldn't load your registrants.");
        } finally {
            setLoading(false);
        }
    }

    function handleSignOut() {
        sessionStorage.removeItem('philsan_sponsor_auth');
        navigate(`/sponsor/${slug}`);
    }

    async function handleFileChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        const text = await file.text();
        const { headers, rows } = parseCSV(text);

        // Check required columns exist
        const missingCols = REQUIRED_COLUMNS.filter(c => !headers.includes(c));
        if (missingCols.length > 0) {
            alert(`CSV is missing required columns: ${missingCols.join(', ')}\n\nPlease use the provided template.`);
            return;
        }

        if (rows.length === 0) {
            alert('The CSV has no data rows.');
            return;
        }

        setParsedRows(rows);
        setUploadStep('validating');

        // Client-side validation first
        const clientErrors = {};
        rows.forEach((row, i) => {
            const errs = validateRow(row, i);
            if (errs.length) clientErrors[i] = errs;
        });

        // MX email check for rows that passed client validation
        const emailsToCheck = rows
            .filter((_, i) => !clientErrors[i])
            .map(r => r.email.trim());

        let mxResults = {};
        if (emailsToCheck.length > 0) {
            try {
                const res = await fetch(VALIDATE_EMAIL_MX_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emails: emailsToCheck }),
                });
                const data = await res.json();
                if (data.results) {
                    for (const r of data.results) {
                        if (!r.valid) mxResults[r.email.toLowerCase()] = r.reason;
                    }
                }
            } catch {
                // If MX check fails, proceed without it
            }
        }

        // Also check for duplicate emails within the CSV itself
        const emailCount = {};
        rows.forEach(r => {
            const e = r.email?.trim().toLowerCase();
            if (e) emailCount[e] = (emailCount[e] || 0) + 1;
        });

        const valid   = [];
        const skipped = [];

        rows.forEach((row, i) => {
            const email = row.email?.trim().toLowerCase();
            const rowErrors = [...(clientErrors[i] || [])];

            if (mxResults[email]) rowErrors.push(`Row ${i + 1}: Email "${email}" — ${mxResults[email]}`);
            if (emailCount[email] > 1) rowErrors.push(`Row ${i + 1}: Duplicate email "${email}" in this file.`);

            if (rowErrors.length === 0) {
                valid.push(row);
            } else {
                skipped.push({ row, errors: rowErrors });
            }
        });

        setValidRows(valid);
        setSkippedRows(skipped);
        setUploadStep('preview');
    }

    async function handleImport() {
        if (!auth || validRows.length === 0) return;
        setUploadStep('importing');

        const toInsert = validRows.map(row => ({
            first_name:         row.first_name.trim(),
            last_name:          row.last_name.trim(),
            middle_name:        row.middle_name?.trim() || null,
            email:              row.email.trim().toLowerCase(),
            mobile:             row.mobile.trim(),
            company:            row.company.trim(),
            position:           row.position.trim(),
            agri_license:       row.agri_license?.trim() || 'N/A',
            membership:         row.membership.trim(),
            age:                row.age.trim(),
            is_student:         row.is_student.trim(),
            certificate_needed: row.certificate_needed.trim(),
            souvenir:           row.souvenir.trim(),
            sponsored:          'yes',
            sponsor:            auth.name,
            reg_status:         'pending',
            reg_request:        new Date().toISOString(),
        }));

        const { data, error } = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify(toInsert),
        }).then(r => r.json().then(d => ({ data: r.ok ? d : null, error: r.ok ? null : d })));

        setImportResults({
            inserted: data ? data.length : 0,
            skipped:  skippedRows.length,
            failed:   error ? toInsert.length : 0,
            error:    error?.message || null,
        });
        setUploadStep('done');
        if (auth) fetchParticipants(auth);
    }

    function resetUpload() {
        setParsedRows([]);
        setValidRows([]);
        setSkippedRows([]);
        setImportResults(null);
        setUploadStep('idle');
    }

    function openEdit(p) {
        setEditingParticipant(p);
        setEditForm({
            first_name: p.first_name ?? '',
            middle_name: p.middle_name ?? '',
            last_name: p.last_name ?? '',
            mobile: p.mobile ?? '',
            company: p.company ?? '',
            position: p.position ?? '',
            agri_license: p.agri_license ?? '',
            membership: p.membership ?? 'regular',
            souvenir: p.souvenir ?? 'no',
            certificate_needed: p.certificate_needed ?? 'no',
            age: p.age ?? '',
            is_student: !!p.is_student,
            email: p.email ?? '',
        });
        setEditError('');
    }

    function closeEdit() {
        setEditingParticipant(null);
        setEditForm(null);
        setEditError('');
    }

    async function handleStatusChange() {
        if (!pendingStatusAction) return;
        const { participant, newStatus } = pendingStatusAction;
        setStatusActionSaving(true);
        setStatusActionError('');

        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${participant.id}`, {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({ reg_status: newStatus }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to update status.');
            }

            const [updated] = await res.json();
            setParticipants((prev) =>
                prev.map((p) => (p.id === participant.id ? { ...p, ...updated } : p))
            );
            setEditingParticipant((prev) =>
                prev && prev.id === participant.id ? { ...prev, ...updated } : prev
            );
            setPendingStatusAction(null);
        } catch (err) {
            setStatusActionError(err.message || 'Something went wrong.');
        } finally {
            setStatusActionSaving(false);
        }
    }

    async function handleEditSubmit() {
        if (!editingParticipant || !editForm) return;
        setEditError('');

        const requiredFields = ['first_name', 'last_name', 'mobile', 'company', 'position', 'age', 'email'];
        for (const field of requiredFields) {
            if (!editForm[field] || !String(editForm[field]).trim()) {
                setEditError(`Please fill in ${field.replace('_', ' ')}.`);
                return;
            }
        }

        const newEmail = editForm.email.trim().toLowerCase();
        const emailChanged = newEmail !== (editingParticipant.email ?? '').trim().toLowerCase();

        setEditSaving(true);

        try {
            if (emailChanged) {
                // 1. Format + MX check via existing edge function
                const mxRes = await fetch(VALIDATE_EMAIL_MX_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emails: [newEmail] }),
                });
                const mxData = await mxRes.json();
                const mxResult = mxData.results?.[0];
                if (mxResult && !mxResult.valid) {
                    setEditError(`Email "${newEmail}" — ${mxResult.reason || 'appears to be invalid.'}`);
                    setEditSaving(false);
                    return;
                }

                // 2. Duplicate check, excluding this participant's own row
                const dupRes = await fetch(
                    `${SUPABASE_URL}/rest/v1/participants?select=id,email,reg_status&email=ilike.${encodeURIComponent(newEmail)}`,
                    { headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' } }
                );
                const dupData = await dupRes.json();
                const others = (dupData ?? []).filter((row) => row.id !== editingParticipant.id);

                if (others.length > 0) {
                    const activeMatch = others.find(
                        (row) => row.reg_status === 'pending' || row.reg_status === 'approved'
                    );
                    const status = activeMatch ? activeMatch.reg_status : others[0].reg_status;

                    if (status === 'pending') {
                        setEditError('This email has already been used and is currently under review.');
                        setEditSaving(false);
                        return;
                    } else if (status === 'approved') {
                        setEditError('This email is already registered and approved.');
                        setEditSaving(false);
                        return;
                    }
                    // rejected/canceled matches are allowed to be reused — fall through
                }
            }

            const res = await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${editingParticipant.id}`, {
                method: 'PATCH',
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                    'Content-Type': 'application/json',
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({
                    first_name: editForm.first_name.trim(),
                    middle_name: editForm.middle_name.trim() || null,
                    last_name: editForm.last_name.trim(),
                    mobile: editForm.mobile.trim(),
                    company: editForm.company.trim(),
                    position: editForm.position.trim(),
                    agri_license: editForm.agri_license.trim() || null,
                    membership: editForm.membership,
                    souvenir: editForm.souvenir,
                    certificate_needed: editForm.certificate_needed,
                    age: editForm.age,
                    is_student: editForm.is_student,
                    email: newEmail,
                }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to save changes.');
            }

            const [updated] = await res.json();
            setParticipants((prev) =>
                prev.map((p) => (p.id === editingParticipant.id ? { ...p, ...updated } : p))
            );
            closeEdit();
        } catch (err) {
            setEditError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setEditSaving(false);
        }
    }

    // Search by name, email, or company
    const filteredParticipants = participants.filter((p) => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return true;
        const fullName = `${p.first_name ?? ''} ${p.last_name ?? ''}`.toLowerCase();
        return (
            fullName.includes(term) ||
            (p.email ?? '').toLowerCase().includes(term) ||
            (p.company ?? '').toLowerCase().includes(term)
        );
    });

    if (!auth) return null;

    return (
        <div className="min-h-screen bg-[#f1efe8]">
            <header className="bg-white border-b border-[#e5e3da] px-6 py-4 flex items-center justify-between">
                <div>
                    <p className="text-[12px] text-[#A9D4B4] bg-[#16572A] inline-block px-3 py-1 rounded-full mb-1">PHILSAN sponsor portal</p>
                    <h1 className="text-[19px] font-bold text-[#16572A]">{auth.name}</h1>
                </div>
                <button onClick={handleSignOut} className="text-[13px] text-[#16572A] border border-[#339544] rounded-md px-3 py-1.5">Sign out</button>
            </header>

            <main className="max-w-[900px] mx-auto px-6 py-8">

                {/* Bulk Upload Section */}
                <div className="bg-white border border-[#e5e3da] rounded-lg p-5 mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[14px] font-bold text-[#16572A]">Bulk registration</p>
                            <p className="text-[12.5px] text-[#5f5e5a]">Upload a CSV file to register multiple participants at once.</p>
                        </div>
                        <button onClick={downloadTemplate}
                            className="text-[12.5px] font-medium text-[#16572A] border border-[#339544] px-3 py-1.5 rounded-md hover:bg-[#EAF3DE] transition-colors shrink-0">
                            Download template
                        </button>
                    </div>

                    {uploadStep === 'idle' && (
                        <label className="flex flex-col items-center justify-center gap-2 w-full p-6 rounded-md border-dashed border-[1.5px] border-[#339544] bg-[#f7f6f1] cursor-pointer text-center hover:bg-[#EAF3DE] transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-[#339544]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4"/>
                            </svg>
                            <span className="text-[13px] text-[#344054] font-medium">Click to upload CSV</span>
                            <span className="text-[11.5px] text-[#888780]">.csv files only</span>
                            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
                        </label>
                    )}

                    {uploadStep === 'validating' && (
                        <div className="flex items-center gap-3 p-4 bg-[#f7f6f1] rounded-md">
                            <div className="w-4 h-4 border-2 border-[#339544] border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[13px] text-[#5f5e5a]">Validating emails and data…</p>
                        </div>
                    )}

                    {uploadStep === 'preview' && (
                        <div className="flex flex-col gap-4">
                            <div className="flex gap-3 flex-wrap">
                                <div className="bg-[#EAF3DE] text-[#3B6D11] px-3 py-2 rounded-md text-[13px] font-medium">
                                    ✓ {validRows.length} valid rows
                                </div>
                                {skippedRows.length > 0 && (
                                    <div className="bg-[#FAEEDA] text-[#854F0B] px-3 py-2 rounded-md text-[13px] font-medium">
                                        ⚠ {skippedRows.length} rows will be skipped
                                    </div>
                                )}
                            </div>

                            {skippedRows.length > 0 && (
                                <div className="bg-[#FCEBEB] border border-[#f5c6c6] rounded-md p-3 max-h-[160px] overflow-y-auto">
                                    <p className="text-[12.5px] font-medium text-[#A32D2D] mb-2">Skipped rows:</p>
                                    {skippedRows.map((s, i) => (
                                        <div key={i} className="mb-2">
                                            {s.errors.map((e, j) => (
                                                <p key={j} className="text-[12px] text-[#A32D2D]">{e}</p>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {validRows.length > 0 && (
                                <div className="overflow-x-auto border border-[#e5e3da] rounded-md max-h-[200px] overflow-y-auto">
                                    <table className="w-full text-[12px]">
                                        <thead className="bg-[#f7f6f1] sticky top-0">
                                            <tr>
                                                {['Name','Email','Company','Membership','Age'].map(h => (
                                                    <th key={h} className="px-3 py-2 text-left font-medium text-[#344054]">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {validRows.map((r, i) => (
                                                <tr key={i} className="border-t border-[#e5e3da]">
                                                    <td className="px-3 py-2">{r.first_name} {r.last_name}</td>
                                                    <td className="px-3 py-2 text-[#5f5e5a]">{r.email}</td>
                                                    <td className="px-3 py-2 text-[#5f5e5a]">{r.company}</td>
                                                    <td className="px-3 py-2 text-[#5f5e5a]">{r.membership}</td>
                                                    <td className="px-3 py-2 text-[#5f5e5a]">{r.age}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button onClick={resetUpload} className="px-4 py-2 rounded-md border border-[#e5e3da] text-[13px] text-[#344054]">Cancel</button>
                                {validRows.length > 0 && (
                                    <button onClick={handleImport}
                                        className="px-4 py-2 rounded-tl-[12px] rounded-br-[12px] bg-[#16572A] hover:bg-[#EDB221] text-white text-[13px] font-medium transition-colors">
                                        Import {validRows.length} participant{validRows.length !== 1 ? 's' : ''}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {uploadStep === 'importing' && (
                        <div className="flex items-center gap-3 p-4 bg-[#f7f6f1] rounded-md">
                            <div className="w-4 h-4 border-2 border-[#339544] border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-[13px] text-[#5f5e5a]">Importing participants…</p>
                        </div>
                    )}

                    {uploadStep === 'done' && importResults && (
                        <div className="flex flex-col gap-3">
                            <div className="bg-[#EAF3DE] border border-[#c3e6cb] rounded-md p-4">
                                <p className="text-[13.5px] font-bold text-[#3B6D11] mb-1">Import complete</p>
                                <p className="text-[13px] text-[#3B6D11]">{importResults.inserted} participant{importResults.inserted !== 1 ? 's' : ''} submitted for review.</p>
                                {importResults.skipped > 0 && <p className="text-[12.5px] text-[#854F0B] mt-1">{importResults.skipped} row{importResults.skipped !== 1 ? 's' : ''} were skipped due to validation errors.</p>}
                                {importResults.error && <p className="text-[12.5px] text-[#A32D2D] mt-1">Some rows failed to insert: {importResults.error}</p>}
                            </div>
                            <button onClick={resetUpload} className="w-fit px-4 py-2 rounded-md border border-[#e5e3da] text-[13px] text-[#344054]">Upload another file</button>
                        </div>
                    )}
                </div>

                {/* Participants list */}
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                    <p className="text-[13.5px] text-[#5f5e5a]">Registration status for participants you're sponsoring.</p>
                    {participants.length > 0 && (
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by name, email, or company…"
                            className="w-full sm:w-[300px] p-2 rounded-md border border-[#d0cec6] text-[13px] focus:outline-none focus:border-[#339544]"
                        />
                    )}
                </div>

                {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>}
                {error   && <p className="text-[13.5px] text-[#A32D2D]">{error}</p>}

                {!loading && !error && participants.length === 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                        <p className="text-[14px] text-[#5f5e5a]">No registrants under your sponsorship yet.</p>
                    </div>
                )}

                {!loading && !error && participants.length > 0 && filteredParticipants.length === 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                        <p className="text-[14px] text-[#5f5e5a]">No registrants match "{searchTerm}".</p>
                    </div>
                )}

                {!loading && !error && filteredParticipants.length > 0 && (
                    <div className="bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                        <table className="w-full text-[13.5px]">
                            <thead>
                                <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                    <th className="px-4 py-3 font-medium">Name</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Company</th>
                                    <th className="px-4 py-3 font-medium">Status</th>
                                    <th className="px-4 py-3 font-medium"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredParticipants.map((p, i) => (
                                    <tr key={i} className="border-t border-[#e5e3da]">
                                        <td className="px-4 py-3 text-[#344054]">{p.first_name} {p.last_name}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.email}</td>
                                        <td className="px-4 py-3 text-[#5f5e5a]">{p.company}</td>
                                        <td className="px-4 py-3">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-medium ${STATUS_BADGE[p.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                                {p.reg_status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button onClick={() => openEdit(p)} className="text-[12.5px] text-[#16572A] hover:underline">
                                                Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>

            {/* Edit participant modal */}
            {editingParticipant && editForm && (
                <div className="fixed inset-0 bg-black/40 flex items-end lg:items-center justify-center z-50 px-0 lg:px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
                    <div className="bg-white rounded-t-2xl lg:rounded-lg shadow-xl w-full lg:max-w-[560px] max-h-[90vh] overflow-y-auto p-6">
                        <h2 className="text-[17px] font-bold text-[#16572A] mb-4">
                            Edit {editingParticipant.first_name} {editingParticipant.last_name}
                        </h2>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">First name</label>
                                <input value={editForm.first_name}
                                    onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Middle name</label>
                                <input value={editForm.middle_name}
                                    onChange={(e) => setEditForm(f => ({ ...f, middle_name: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Last name</label>
                                <input value={editForm.last_name}
                                    onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Mobile</label>
                                <input value={editForm.mobile}
                                    onChange={(e) => setEditForm(f => ({ ...f, mobile: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Company</label>
                                <input value={editForm.company}
                                    onChange={(e) => setEditForm(f => ({ ...f, company: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Position</label>
                                <input value={editForm.position}
                                    onChange={(e) => setEditForm(f => ({ ...f, position: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Agri license</label>
                                <input value={editForm.agri_license}
                                    onChange={(e) => setEditForm(f => ({ ...f, agri_license: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Age group</label>
                                <select value={editForm.age}
                                    onChange={(e) => setEditForm(f => ({ ...f, age: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                                    <option value="">Select…</option>
                                    {AGE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Membership</label>
                                <select value={editForm.membership}
                                    onChange={(e) => setEditForm(f => ({ ...f, membership: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                                    {MEMBERSHIP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Souvenir</label>
                                <select value={editForm.souvenir}
                                    onChange={(e) => setEditForm(f => ({ ...f, souvenir: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                                    {SOUVENIR_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Certificate needed</label>
                                <select value={editForm.certificate_needed}
                                    onChange={(e) => setEditForm(f => ({ ...f, certificate_needed: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                                    <option value="yes">yes</option>
                                    <option value="no">no</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 pt-6">
                                <input id="edit_is_student" type="checkbox" checked={editForm.is_student}
                                    onChange={(e) => setEditForm(f => ({ ...f, is_student: e.target.checked }))}
                                    className="w-4 h-4" />
                                <label htmlFor="edit_is_student" className="text-[13px] text-[#344054]">Is a student</label>
                            </div>
                        </div>

                        <div className="border-t border-[#e5e3da] mt-4 pt-4">
                            <label className="text-[12.5px] text-[#344054] block mb-1">Email</label>
                            <input type="email" value={editForm.email}
                                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                                className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            <p className="text-[11.5px] text-[#888780] mt-1">
                                Changing the email will re-check that it's valid and not already in use.
                            </p>
                        </div>

                        {editError && <p className="text-[12.5px] text-[#A32D2D] mt-3">{editError}</p>}

                        <div className="border-t border-[#e5e3da] mt-4 pt-4">
                            <p className="text-[12.5px] text-[#344054] mb-2">
                                Status: <span className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-medium ${STATUS_BADGE[editingParticipant.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>{editingParticipant.reg_status}</span>
                            </p>
                            <div className="flex gap-3 flex-wrap">
                                {editingParticipant.reg_status !== 'canceled' && (
                                    <button
                                        onClick={() => setPendingStatusAction({ participant: editingParticipant, newStatus: 'canceled' })}
                                        className="text-[12.5px] text-[#A32D2D] border border-[#A32D2D] px-3 py-1.5 rounded-md hover:bg-[#FCEBEB]"
                                    >
                                        Cancel registration
                                    </button>
                                )}
                                {editingParticipant.reg_status !== 'pending' && (
                                    <button
                                        onClick={() => setPendingStatusAction({ participant: editingParticipant, newStatus: 'pending' })}
                                        className="text-[12.5px] text-[#854F0B] border border-[#854F0B] px-3 py-1.5 rounded-md hover:bg-[#FAEEDA]"
                                    >
                                        Make pending
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3 mt-5">
                            <button onClick={closeEdit} className="flex-1 py-2.5 rounded-md border border-[#d0cec6] text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">
                                Cancel
                            </button>
                            <button onClick={handleEditSubmit} disabled={editSaving}
                                className="flex-1 py-2.5 rounded-tl-[16px] rounded-br-[16px] bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium disabled:opacity-60">
                                {editSaving ? 'Saving…' : 'Save changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm cancel / make pending */}
            {pendingStatusAction && (
                <div className="fixed inset-0 bg-black/40 flex items-end lg:items-center justify-center z-50 px-0 lg:px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setPendingStatusAction(null); }}>
                    <div className="bg-white rounded-t-2xl lg:rounded-lg shadow-xl w-full lg:max-w-[400px] p-6">
                        <h2 className="text-[17px] font-bold text-[#344054] mb-2">
                            {pendingStatusAction.newStatus === 'canceled' ? 'Cancel this registration?' : 'Move back to pending?'}
                        </h2>
                        <p className="text-[13.5px] text-[#5f5e5a] mb-6 leading-[1.6]">
                            {pendingStatusAction.newStatus === 'canceled'
                                ? <>This will cancel <strong>{pendingStatusAction.participant.first_name} {pendingStatusAction.participant.last_name}</strong>'s registration.</>
                                : <>This will move <strong>{pendingStatusAction.participant.first_name} {pendingStatusAction.participant.last_name}</strong> back to pending review. PHILSAN admin will need to review and approve it again.</>
                            }
                        </p>
                        {statusActionError && <p className="text-[12.5px] text-[#A32D2D] mb-3">{statusActionError}</p>}
                        <div className="flex gap-3">
                            <button onClick={() => setPendingStatusAction(null)} className="flex-1 py-2.5 rounded-md border border-[#d0cec6] text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">
                                Never mind
                            </button>
                            <button onClick={handleStatusChange} disabled={statusActionSaving}
                                className={`flex-1 py-2.5 rounded-md text-white text-[13.5px] font-medium disabled:opacity-60 ${pendingStatusAction.newStatus === 'canceled' ? 'bg-[#A32D2D] hover:bg-[#791F1F]' : 'bg-[#16572A] hover:bg-[#EDB221]'}`}>
                                {statusActionSaving ? 'Saving…' : 'Yes, confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}