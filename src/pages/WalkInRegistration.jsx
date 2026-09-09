import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const SUPABASE_URL = 'https://pskballrwzdbovtylgjs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

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
    membership: 'regular',
    souvenir: 'no',
    certificate_needed: 'no',
    age: '',
    is_student: false,
    payment: '',
};

async function callFunction(name, body) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res;
}

export default function WalkInRegistration() {
    const [form, setForm] = useState(EMPTY_FORM);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [walkInCount, setWalkInCount] = useState(null);

    const fetchWalkInCount = useCallback(async () => {
        const { count, error } = await supabase
            .from('attendance_logs')
            .select('*', { count: 'exact', head: true })
            .eq('device_id', 'walk-in-registration');

        if (!error) setWalkInCount(count ?? 0);
    }, []);

    useEffect(() => {
        fetchWalkInCount();

        const channel = supabase
            .channel('walk_in_count_changes')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
                (payload) => {
                    if (payload.new?.device_id === 'walk-in-registration') {
                        setWalkInCount((prev) => (prev ?? 0) + 1);
                    }
                }
            )
            .on(
                'postgres_changes',
                { event: 'DELETE', schema: 'public', table: 'attendance_logs' },
                () => {
                    // A delete could be an undone walk-in — safest is to
                    // just refetch the accurate count rather than guess.
                    fetchWalkInCount();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchWalkInCount]);

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
            // 1. Insert the participant, pre-approved since the admin is
            // vetting and collecting payment in person at the booth.
            const ticketToken = crypto.randomUUID();

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
                    membership: form.membership,
                    souvenir: form.souvenir,
                    certificate_needed: form.certificate_needed,
                    sponsored: 'no',
                    sponsor: null,
                    payment: form.payment.trim() || null,
                    age: form.age,
                    is_student: form.is_student,
                    reg_status: 'approved',
                    reg_request: new Date().toISOString(),
                    ticket_token: ticketToken,
                })
                .select()
                .single();

            if (insertError) throw new Error(insertError.message);

            // 2. Auto check-in — walk-ins are considered present the moment
            // they register, no scan needed.
            const { error: attendanceError } = await supabase
                .from('attendance_logs')
                .insert({
                    participant_id: participant.id,
                    scanned_by: null,
                    device_id: 'walk-in-registration',
                });

            if (attendanceError) {
                console.error('Attendance auto check-in failed:', attendanceError);
                // Don't block the flow on this — participant is registered,
                // surface a warning instead of losing their registration.
                setError(
                    'Registered, but auto check-in failed — please check them in manually from the Attendance page.'
                );
            }

            // 3. Send the registration/QR email — informational only, this
            // QR does not need to be scanned since they're already checked in.
            try {
                await callFunction('send-confirmation-email', {
                    email: participant.email,
                    first_name: participant.first_name,
                });
            } catch (e) {
                console.error('Confirmation email error:', e);
            }

            setSuccessMsg(
                `${participant.first_name} ${participant.last_name} has been registered and checked in.`
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
            <div className="flex items-center justify-between mb-1">
                <h1 className="text-[22px] font-bold text-[#16572A]">Walk-In Registration</h1>
                <div className="text-right">
                    <p className="text-[11px] uppercase tracking-wide text-[#98a2b3]">Walk-ins so far</p>
                    <p className="text-[22px] font-bold text-[#16572A]">
                        {walkInCount === null ? '—' : walkInCount}
                    </p>
                </div>
            </div>
            <p className="text-[13px] text-[#5f5e5a] mb-6">
                For same-day registrations at the walk-in booth. Registering here automatically
                checks the participant in — no QR scan needed.
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
                    {submitting ? 'Registering…' : 'Register & Check In'}
                </button>
            </form>
        </div>
    );
}