import { createClient } from '@supabase/supabase-js';

// Same project as the WordPress registration page.
// This is the public anon/publishable key — safe to expose client-side.
// Access control for admin data is enforced by RLS policies in Supabase,
// not by hiding this key.
const SUPABASE_URL = 'https://pskballrwzdbovtylgjs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBza2JhbGxyd3pkYm92dHlsZ2pzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU4MTAsImV4cCI6MjA5NzIxMTgxMH0.LhtBD_E8aEUHLI4UAFqQ5-3_iVqwOLYN5TklbCDDeIg';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);