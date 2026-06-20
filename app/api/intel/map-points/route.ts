export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseFilters, applyFilters } from '@/lib/supabase-filters';

const MAX_POINTS = 15000;

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);

    // Get count first
    let countQuery = supabase.from('intel_records').select('*', { count: 'exact', head: true });
    countQuery = applyFilters(countQuery, filters);
    const { count: totalCount } = await countQuery;
    const total = totalCount ?? 0;

    // Fetch coordinates + minimal data for popups
    // Supabase has a default limit of 1000, we need to paginate or increase
    let allPoints: any[] = [];
    const pageSize = 5000;
    let from = 0;

    // If total > MAX_POINTS, we sample by fetching every Nth record
    const shouldSample = total > MAX_POINTS;
    const fetchLimit = shouldSample ? total : Math.min(total, MAX_POINTS);

    while (allPoints.length < fetchLimit && from < total) {
      let query = supabase.from('intel_records')
        .select('id, latitud, longitud, departamento, municipio, tipologia, fecha, estructura, fenomeno_criminalidad, informacion_hecho')
        .range(from, from + pageSize - 1)
        .order('id', { ascending: true });
      query = applyFilters(query, filters);
      const { data, error } = await query;
      if (error) {
        console.error('Map points error:', error);
        break;
      }
      if (!data || data.length === 0) break;
      allPoints = allPoints.concat(data);
      from += pageSize;
    }

    // Sample if needed
    let displayPoints = allPoints;
    if (shouldSample && allPoints.length > MAX_POINTS) {
      const step = Math.ceil(allPoints.length / MAX_POINTS);
      displayPoints = [];
      for (let i = 0; i < allPoints.length; i += step) {
        displayPoints.push(allPoints[i]);
      }
    }

    return NextResponse.json({
      total,
      displayed: displayPoints.length,
      points: displayPoints,
    });
  } catch (err: any) {
    console.error('Map points error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
