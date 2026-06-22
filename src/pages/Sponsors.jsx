import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

function slugify(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

const EMPTY_FORM = { name: '', slug: '', password: '' };

export default function Sponsors() {
    const [sponsors, setSponsors] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Delete state
    const [deletingId, setDeletingId] = useState(null);
    const navigate = useNavigate();

    useEffect(() => { fetchData(); }, []);

    async function fetchData() {
        setLoading(true);
        setError('');
        try {
            const { data: sponsorData, error: sponsorErr } = await supabase
                .from('sponsors')
                .select('id, name, slug, created_at')
                .order('name', { ascending: true });
            if (sponsorErr) throw sponsorErr;

            const { data: participantData, error: partErr } = await supabase
                .from('participants')
                .select('sponsor, reg_status');
            if (partErr) throw partErr;

            const countMap = {};
            for (const p of participantData ?? []) {
                const key = (p.sponsor ?? '').trim();
                if (!key) continue;
                if (!countMap[key]) countMap[key] = { total: 0, approved: 0, pending: 0, canceled: 0 };
                countMap[key].total++;
                if (p.reg_status === 'approved') countMap[key].approved++;
                else if (p.reg_status === 'pending') countMap[key].pending++;
                else if (p.reg_status === 'canceled') countMap[key].canceled++;
            }

            setSponsors(sponsorData ?? []);
            setCounts(countMap);
        } catch (err) {
            setError('Failed to load sponsors.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    function handleNameChange(name) {
        setForm(f => ({ ...f, name, slug: slugify(name) }));
    }

    function openModal() {
        setForm(EMPTY_FORM);
        setFormError('');
        setShowModal(true);
    }

    async function handleAdd() {
        setFormError('');
        if (!form.name.trim()) return setFormError('Sponsor name is required.');
        if (!form.slug.trim()) return setFormError('Slug is required.');
        if (!form.password.trim()) return setFormError('Password is required.');

        setSaving(true);
        try {
            const { error } = await supabase.from('sponsors').insert({
                name: form.name.trim(),
                slug: form.slug.trim(),
                password: form.password.trim(),
            });

            if (error) {
                if (error.code === '23505') {
                    setFormError('A sponsor with that name or slug already exists.');
                } else {
                    setFormError(error.message);
                }
                return;
            }

            setShowModal(false);
            await fetchData();
        } catch (err) {
            setFormError('Something went wrong. Please try again.');
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(id, name) {
        if (!window.confirm(`Remove "${name}" from sponsors? This will not delete their participants.`)) return;
        setDeletingId(id);
        try {
            const { error } = await supabase.from('sponsors').delete().eq('id', id);
            if (error) throw error;
            await fetchData();
        } catch (err) {
            alert('Failed to delete sponsor.');
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="px-8 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-[22px] font-bold text-[#16572A]">Sponsors</h1>
                    <p className="text-[13.5px] text-[#5f5e5a] mt-1">
                        Manage sponsors and their portal access.
                    </p>
                </div>
                <button
                    onClick={openModal}
                    className="inline-flex items-center gap-2 bg-[#16572A] hover:bg-[#EDB221] text-white px-4 py-2.5 rounded-tl-[16px] rounded-br-[16px] text-[13.5px] font-medium transition-colors"
                >
                    + Add sponsor
                </button>
            </div>

            {loading && <p className="text-[13.5px] text-[#5f5e5a]">Loading…</p>}
            {error && <p className="text-[13.5px] text-[#A32D2D]">{error}</p>}

            {!loading && !error && sponsors.length === 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg p-10 text-center">
                    <p className="text-[14px] text-[#5f5e5a]">No sponsors yet. Add one to get started.</p>
                </div>
            )}

            {!loading && !error && sponsors.length > 0 && (
                <div className="bg-white border border-[#e5e3da] rounded-lg overflow-hidden">
                    <table className="w-full text-[13.5px]">
                        <thead>
                            <tr className="bg-[#f7f6f1] text-left text-[#344054]">
                                <th className="px-5 py-3 font-medium">Sponsor</th>
                                <th className="px-5 py-3 font-medium">Portal URL</th>
                                <th className="px-5 py-3 font-medium text-center">Total</th>
                                <th className="px-5 py-3 font-medium text-center">Approved</th>
                                <th className="px-5 py-3 font-medium text-center">Pending</th>
                                <th className="px-5 py-3 font-medium text-center">Rejected</th>
                                <th className="px-5 py-3 font-medium"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sponsors.map((s) => {
                                const c = counts[s.name.trim()] ?? { total: 0, approved: 0, pending: 0, canceled: 0 };
                                return (
                                    <tr key={s.id} className="border-t border-[#e5e3da] hover:bg-[#fafaf7]">
                                        <td className="px-5 py-3">
                                            <button
                                                onClick={() => navigate(`/sponsors/${s.slug}`)}
                                                className="font-medium text-[#16572A] hover:underline text-left"
                                            >
                                                {s.name}
                                            </button>
                                        </td>
                                        <td className="px-5 py-3 text-[#5f5e5a]">
                                            <span className="font-mono text-[12px] bg-[#f1efe8] px-2 py-0.5 rounded">
                                                /sponsor/{s.slug}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center text-[#344054] font-medium">{c.total}</td>
                                        <td className="px-5 py-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[12px] bg-[#EAF3DE] text-[#3B6D11] font-medium">
                                                {c.approved}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[12px] bg-[#FAEEDA] text-[#854F0B] font-medium">
                                                {c.pending}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-center">
                                            <span className="inline-block px-2 py-0.5 rounded-full text-[12px] bg-[#FCEBEB] text-[#A32D2D] font-medium">
                                                {c.canceled}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(s.id, s.name)}
                                                disabled={deletingId === s.id}
                                                className="text-[12.5px] text-[#A32D2D] hover:underline disabled:opacity-50"
                                            >
                                                {deletingId === s.id ? 'Removing…' : 'Remove'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Add Sponsor Modal */}
            {showModal && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
                >
                    <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px] p-6">
                        <h2 className="text-[17px] font-bold text-[#16572A] mb-4">Add sponsor</h2>

                        <div className="flex flex-col gap-4">
                            {/* Name */}
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">
                                    Sponsor name <span className="text-[#A32D2D]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => handleNameChange(e.target.value)}
                                    placeholder="e.g. Acme Corporation"
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] focus:outline-none focus:border-[#339544]"
                                />
                            </div>

                            {/* Slug */}
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">
                                    Portal URL slug <span className="text-[#A32D2D]">*</span>
                                </label>
                                <div className="flex items-center gap-1">
                                    <span className="text-[12.5px] text-[#5f5e5a] shrink-0">/sponsor/</span>
                                    <input
                                        type="text"
                                        value={form.slug}
                                        onChange={(e) => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                                        placeholder="acme-corporation"
                                        className="flex-1 p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] font-mono focus:outline-none focus:border-[#339544]"
                                    />
                                </div>
                                <p className="text-[11.5px] text-[#5f5e5a] mt-1">Auto-filled from name. Edit if needed.</p>
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-[12.5px] text-[#344054] block mb-1">
                                    Portal password <span className="text-[#A32D2D]">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={form.password}
                                    onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="e.g. acme2025"
                                    className="w-full p-2.5 rounded-md border border-[#d0cec6] text-[13.5px] focus:outline-none focus:border-[#339544]"
                                />
                                <p className="text-[11.5px] text-[#5f5e5a] mt-1">Share this with the sponsor to access their portal.</p>
                            </div>

                            {formError && (
                                <p className="text-[12.5px] text-[#A32D2D]">{formError}</p>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 mt-1">
                                <button
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 py-2.5 rounded-md border border-[#d0cec6] text-[13.5px] text-[#344054] hover:bg-[#f7f6f1] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAdd}
                                    disabled={saving}
                                    className="flex-1 py-2.5 rounded-tl-[16px] rounded-br-[16px] bg-[#16572A] hover:bg-[#EDB221] text-white text-[13.5px] font-medium transition-colors disabled:opacity-60"
                                >
                                    {saving ? 'Saving…' : 'Add sponsor'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
