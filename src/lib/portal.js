import { supabase } from './supabaseClient'; // adjust to your supabase client path

// ---- Login session (this browser tab only, like the sponsor portal) ----
const KEY = 'philsan_portal_email';

export function getPortalEmail() {
  try {
    return sessionStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

export function setPortalEmail(email) {
  try {
    sessionStorage.setItem(KEY, email);
  } catch {
    /* storage unavailable — user will just log in again */
  }
}

export function clearPortalEmail() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// ---- Certificate Edge Function ----
export async function callCertificate(body) {
  const { data, error } = await supabase.functions.invoke('smooth-api', { body });
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
