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
            .order('created_at', { ascending: false });

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

    return {
        participants,
        loading,
        error,
        refetch: fetchParticipants,
    };
}