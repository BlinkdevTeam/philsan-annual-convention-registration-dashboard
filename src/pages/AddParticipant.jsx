import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const MEMBERSHIP_OPTIONS = ['regular', 'associate', 'Donor', 'non_member'];
const SOUVENIR_OPTIONS = ['no', 'digital', 'printed'];
const AGE_OPTIONS = [
    '20_and_below', '21_30', '31_40', '41_50', '51_60', '61_70', '71_and_above',
];

const EMPTY_FORM = {
    email: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    mobile: '',
    company: '',
    position: '',
    agri_license: '',
    license_expiry: '',
    membership: 'regular',
    souvenir: 'no',
    certificate_needed: 'no',
    age: '',
    is_student: false,
    payment: '',
};

// Single participant registration from the admin dashboard.
// Saved as PENDING (approve it from Participants). No check-in, not counted as walk-in, no email sent here.
export default function AddParticipant() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    function updateField(field, value) {
        setForm((prev) => ({ ...prev, [field]: value }));
    }

    function validate() {
        const required = ['email', 'first_name', 'last_name', 'mobile', 'company', 'position', 'age'];
        for (const field of required) {
            if (!form[field] || !String(form[field]).trim()) {
                return `Please fill in ${field.replace('_', ' ')}.`;
            }
        }
        if (!/^\S+@\S+\.\S+$/.test(form.email)) {
            return 'Please enter a valid email address.';
        }
        // A real license number (not N/A, 0000 …) needs its expiry date
        if (/[1-9]/.test(form.agri_license) && !form.license_expiry) {
            return 'Please fill in the license expiry date.';
        }
        return null;
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setSubmitting(true);

        try {
            const { data: participant, error: insertError } = await supabase
                .from('participants')
                .insert({
                    email: form.email.trim(),
                    first_name: form.first_name.trim(),
                    middle_name: form.middle_name.trim() || null,
                    last_name: form.last_name.trim(),
                    mobile: form.mobile.trim(),
                    company: form.company.trim(),
                    position: form.position.trim(),
                    agri_license: form.agri_license.trim() || null,
                    license_expiry: form.license_expiry || null,
                    membership: form.membership,
                    souvenir: form.souvenir,
                    certificate_needed: form.certificate_needed,
                    sponsored: 'no',
                    sponsor: null,
                    payment: form.payment.trim() || null,
                    age: form.age,
                    is_student: form.is_student,
                    reg_status: 'pending',
                    reg_request: new Date().toISOString(),
                    ticket_token: crypto.randomUUID(),
                })
                .select()
                .single();

            if (insertError) throw new Error(insertError.message);

            setSuccessMsg(
                `${participant.first_name} ${participant.last_name} has been added as pending. Approve them from Participants.`
            );
            setForm(EMPTY_FORM);
        } catch (err) {
            setError(err.message || 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="px-8 py-8 max-w-[720px]">
            <h1 className="text-[22px] font-bold text-[#16572A] mb-1">Add Participant</h1>
            <p className="text-[13px] text-[#5f5e5a] mb-6">
                Register a single participant from the dashboard. They are saved as pending
                (approve them from Participants). This is not a walk-in and does not check them in.
            </p>

            <form onSubmit={handleSubmit} className="bg-white border border-[#e5e3da] rounded-lg p-6 flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">First name *</label>
                        <input
                            value={form.first_name}
                            onChange={(e) => updateField('first_name', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Middle name</label>
                        <input
                            value={form.middle_name}
                            onChange={(e) => updateField('middle_name', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Last name *</label>
                        <input
                            value={form.last_name}
                            onChange={(e) => updateField('last_name', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Email *</label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => updateField('email', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Mobile *</label>
                        <input
                            value={form.mobile}
                            onChange={(e) => updateField('mobile', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Company *</label>
                        <input
                            value={form.company}
                            onChange={(e) => updateField('company', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Position *</label>
                        <input
                            value={form.position}
                            onChange={(e) => updateField('position', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Agri license</label>
                        <input
                            value={form.agri_license}
                            onChange={(e) => updateField('agri_license', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>
                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">License expiry</label>
                        <input
                            type="date"
                            value={form.license_expiry}
                            onChange={(e) => updateField('license_expiry', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px] bg-white"
                        />
                    </div>

                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Membership</label>
                        <select
                            value={form.membership}
                            onChange={(e) => updateField('membership', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px] bg-white"
                        >
                            {MEMBERSHIP_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Age group *</label>
                        <select
                            value={form.age}
                            onChange={(e) => updateField('age', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px] bg-white"
                        >
                            <option value="">Select…</option>
                            {AGE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Souvenir</label>
                        <select
                            value={form.souvenir}
                            onChange={(e) => updateField('souvenir', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px] bg-white"
                        >
                            {SOUVENIR_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Certificate needed</label>
                        <select
                            value={form.certificate_needed}
                            onChange={(e) => updateField('certificate_needed', e.target.value)}
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px] bg-white"
                        >
                            <option value="yes">yes</option>
                            <option value="no">no</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-[12.5px] text-[#344054] block mb-1">Payment amount</label>
                        <input
                            value={form.payment}
                            onChange={(e) => updateField('payment', e.target.value)}
                            placeholder="e.g. 1500"
                            className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[14px]"
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-6">
                        <input
                            id="is_student"
                            type="checkbox"
                            checked={form.is_student}
                            onChange={(e) => updateField('is_student', e.target.checked)}
                            className="w-4 h-4"
                        />
                        <label htmlFor="is_student" className="text-[13px] text-[#344054]">
                            Is a student (verified in person)
                        </label>
                    </div>
                </div>

                {error && <p className="text-[12.5px] text-[#A32D2D]">{error}</p>}
                {successMsg && <p className="text-[12.5px] text-[#3B6D11]">{successMsg}</p>}

                <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 inline-flex items-center justify-center gap-2 bg-[#16572A] hover:bg-[#EDB221] text-white py-2.5 rounded-tl-[20px] rounded-br-[20px] text-[14px] font-medium disabled:opacity-60"
                >
                    {submitting ? 'Saving…' : 'Add as Pending'}
                </button>
            </form>
        </div>
    );
}