import { useState } from 'react';
import { supabase } from '../lib/supabaseClient'; // adjust to your actual client import

const VALIDATE_EMAIL_MX_URL = 'https://pskballrwzdbovtylgjs.supabase.co/functions/v1/validate-email-mx';

const MEMBERSHIP_OPTIONS = ['regular', 'associate', 'Donor', 'non_member'];
const SOUVENIR_OPTIONS   = ['no', 'digital', 'printed'];
const AGE_OPTIONS = [
    '20_and_below', '21_30', '31_40', '41_50', '51_60', '61_70', '71_and_above',
];
const REG_STATUS_OPTIONS = ['pending', 'approved', 'rejected', 'canceled'];

const STATUS_BADGE = {
    pending:  'bg-[#FAEEDA] text-[#854F0B]',
    approved: 'bg-[#EAF3DE] text-[#3B6D11]',
    rejected: 'bg-[#FCEBEB] text-[#A32D2D]',
    canceled: 'bg-[#FCEBEB] text-[#A32D2D]',
};

// Hook you can drop into any admin page that lists participants.
// Renders openAdminEdit(participant) to trigger, and <AdminEditModal /> to mount once.
export function useAdminParticipantEdit({ onUpdated }) {
    const [editingParticipant, setEditingParticipant] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [editError, setEditError] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    function openAdminEdit(p) {
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
            sponsored: p.sponsored ?? 'no',
            sponsor: p.sponsor ?? '',
            reg_status: p.reg_status ?? 'pending',
            status_reason: p.status_reason ?? '',
        });
        setEditError('');
    }

    function closeAdminEdit() {
        setEditingParticipant(null);
        setEditForm(null);
        setEditError('');
    }

    async function handleAdminEditSubmit() {
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

                const { data: dupData, error: dupErr } = await supabase
                    .from('participants')
                    .select('id,email,reg_status')
                    .ilike('email', newEmail);

                if (dupErr) throw new Error(dupErr.message);

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

            const { data: updated, error: updateErr } = await supabase
                .from('participants')
                .update({
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
                    sponsored: editForm.sponsored,
                    sponsor: editForm.sponsored === 'yes' ? (editForm.sponsor.trim() || null) : null,
                    reg_status: editForm.reg_status,
                    status_reason: (editForm.reg_status === 'rejected' || editForm.reg_status === 'canceled')
                        ? (editForm.status_reason.trim() || null)
                        : null,
                })
                .eq('id', editingParticipant.id)
                .select()
                .single();

            if (updateErr) throw new Error(updateErr.message);

            onUpdated?.(updated);
            closeAdminEdit();
        } catch (err) {
            setEditError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setEditSaving(false);
        }
    }

    const AdminEditModal = () => {
        if (!editingParticipant || !editForm) return null;
        return (
            <div className="fixed inset-0 bg-black/40 flex items-end lg:items-center justify-center z-50 px-0 lg:px-4"
                onClick={(e) => { if (e.target === e.currentTarget) closeAdminEdit(); }}>
                <div className="bg-white rounded-t-2xl lg:rounded-lg shadow-xl w-full lg:max-w-[600px] max-h-[90vh] overflow-y-auto p-6">
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
                            <input id="admin_edit_is_student" type="checkbox" checked={editForm.is_student}
                                onChange={(e) => setEditForm(f => ({ ...f, is_student: e.target.checked }))}
                                className="w-4 h-4" />
                            <label htmlFor="admin_edit_is_student" className="text-[13px] text-[#344054]">Is a student</label>
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

                    {/* Admin-only: sponsorship reassignment */}
                    <div className="border-t border-[#e5e3da] mt-4 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="text-[12.5px] text-[#344054] block mb-1">Sponsored</label>
                            <select value={editForm.sponsored}
                                onChange={(e) => setEditForm(f => ({ ...f, sponsored: e.target.value }))}
                                className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                                <option value="no">no</option>
                                <option value="yes">yes</option>
                            </select>
                        </div>
                        {editForm.sponsored === 'yes' && (
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">Sponsor</label>
                                <input value={editForm.sponsor}
                                    onChange={(e) => setEditForm(f => ({ ...f, sponsor: e.target.value }))}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                        )}
                    </div>

                    {/* Admin-only: uploaded proof, read-only links */}
                    {(editingParticipant.payment_proof || editingParticipant.student_id_photo) && (
                        <div className="border-t border-[#e5e3da] mt-4 pt-4 flex gap-4 flex-wrap">
                            {editingParticipant.payment_proof && (
                                <a href={editingParticipant.payment_proof} target="_blank" rel="noreferrer"
                                    className="text-[12.5px] text-[#16572A] underline">View payment proof</a>
                            )}
                            {editingParticipant.student_id_photo && (
                                <a href={editingParticipant.student_id_photo} target="_blank" rel="noreferrer"
                                    className="text-[12.5px] text-[#16572A] underline">View student ID photo</a>
                            )}
                        </div>
                    )}

                    {editError && <p className="text-[12.5px] text-[#A32D2D] mt-3">{editError}</p>}

                    {/* Admin-only: direct status control, including approved */}
                    <div className="border-t border-[#e5e3da] mt-4 pt-4">
                        <label className="text-[12.5px] text-[#344054] block mb-1">Registration status</label>
                        <select value={editForm.reg_status}
                            onChange={(e) => setEditForm(f => ({ ...f, reg_status: e.target.value }))}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] bg-white">
                            {REG_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                        <p className="mt-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[12px] font-medium ${STATUS_BADGE[editingParticipant.reg_status] ?? 'bg-[#f1efe8] text-[#5f5e5a]'}`}>
                                current: {editingParticipant.reg_status}
                            </span>
                        </p>

                        {(editForm.reg_status === 'rejected' || editForm.reg_status === 'canceled') && (
                            <div className="mt-3">
                                <label className="text-[12.5px] text-[#344054] block mb-1">Reason (shown to participant)</label>
                                <textarea value={editForm.status_reason}
                                    onChange={(e) => setEditForm(f => ({ ...f, status_reason: e.target.value }))}
                                    rows={2}
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px]" />
                            </div>
                        )}
                    </div>

                    <div className="flex gap-3 mt-5">
                        <button onClick={closeAdminEdit} className="flex-1 py-2.5 rounded-md border border-[#d0cec6] text-[13.5px] text-[#344054] hover:bg-[#f7f6f1]">
                            Cancel
                        </button>
                        <button onClick={handleAdminEditSubmit} disabled={editSaving}
                            className="flex-1 py-2.5 rounded-tl-[16px] rounded-br-[16px] bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium disabled:opacity-60">
                            {editSaving ? 'Saving…' : 'Save changes'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return { openAdminEdit, AdminEditModal, editingParticipant };
}