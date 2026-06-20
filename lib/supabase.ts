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

// Cliente público (anon) - bajo demanda
export function getPublicSupabase() {
  if (!publicClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    }
    publicClient = createClient(url, key);
  }
  return publicClient;
}

// Cliente de servicio (service role) - bajo demanda
export function getServiceSupabase() {
  if (!serviceClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    serviceClient = createClient(url, key);
  }
  return serviceClient;
}

// Proxy para mantener compatibilidad con archivos que importan `supabase`
export const supabase = new Proxy({} as any, {
  get: (target, prop) => {
    const client = getPublicSupabase();
    const value = client[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  }
});
