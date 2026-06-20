/*import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Client-side Supabase (anon key - respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase (service_role key - bypasses RLS)
export function getServiceSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  return createClient(supabaseUrl, serviceKey);
}*/

import { createClient } from '@supabase/supabase-js';

let serviceClient: any = null;
let publicClient: any = null;

export function getServiceSupabase() {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error('supabaseUrl or SUPABASE_KEY is required');
    }
    serviceClient = createClient(url, key);
  }
  return serviceClient;
}

export function getPublicSupabase() {
  if (!publicClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('supabaseUrl or NEXT_PUBLIC_SUPABASE_ANON_KEY is required');
    }
    publicClient = createClient(url, key);
  }
  return publicClient;
}