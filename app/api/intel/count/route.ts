export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';

export async function GET() {
  try {
    const sb = getServiceSupabase();
    const { count, error } = await sb.from('intel_records').select('*', { count: 'exact', head: true });
    if (error) throw error;
    return NextResponse.json({ count: count ?? 0 });
  } catch (err: any) {
    console.error('Count error:', err);
    return NextResponse.json({ count: 0 });
  }
}
