import { supabase } from '../lib/supabaseClient';

// 2nd Pet Symposium portal — kept separate from the 39th portal
// (own login key, own routes, own Edge Function).

export const SYMPOSIUM_NAME = '2nd PHILSAN Pet Symposium';
export const BASE = '/pet-symposium';

// ---- Login session (this browser tab only) ----
const KEY = 'philsan_symposium_email';

export function getSymposiumEmail() {
    try {
        return sessionStorage.getItem(KEY) || '';
    } catch {
        return '';
    }
}

export function setSymposiumEmail(email) {
    try {
        sessionStorage.setItem(KEY, email);
    } catch {
        /* storage unavailable — user will just log in again */
    }
}

export function clearSymposiumEmail() {
    try {
        sessionStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}

// ---- Certificate Edge Function ----
export async function callSymposiumCertificate(body) {
    const { data, error } = await supabase.functions.invoke('symposium-certificate', { body });
    if (error) {
        let message = 'Something went wrong. Please try again.';
        try {
            const payload = await error.context.json();
            if (payload?.error) message = payload.error;
        } catch {
            /* keep default message */
        }
        throw new Error(message);
    }
    return data;
}
