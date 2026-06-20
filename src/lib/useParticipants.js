import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

export function useParticipants(statusFilter) {
    const [participants, setParticipants] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchParticipants = useCallback(async () => {
        setLoading(true);
        setError(null);

        let query = supabase
            .from('participants')
            .select('*')
            .order('reg_request', { ascending: false });

        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('reg_status', statusFilter);
        }

        const { data, error } = await query;

        if (error) {
            setError(error.message);
        } else {
            setParticipants(data ?? []);
        }

        setLoading(false);
    }, [statusFilter]);

    useEffect(() => {
        fetchParticipants();
    }, [fetchParticipants]);

    async function approveParticipant(id) {
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'approved', rejection_reason: null })
            .eq('id', id);

        if (!error) {
            await fetchParticipants();
        }

        return { error };
    }

    async function rejectParticipant(id, reason) {
        const { error } = await supabase
            .from('participants')
            .update({ reg_status: 'canceled', rejection_reason: reason })
            .eq('id', id);

        if (!error) {
            await fetchParticipants();
        }

        return { error };
    }

    return {
        participants,
        loading,
        error,
        refetch: fetchParticipants,
        approveParticipant,
        rejectParticipant,
    };
}