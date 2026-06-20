export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { parseFilters, applyFilters } from '@/lib/supabase-filters';

const PAGE_SIZE = 5000;
const PARALLEL = 8;

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function topN(map: Record<string, number>, n: number = 100) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => ({ name, count }));
}

export async function GET(req: NextRequest) {
  try {
    const filters = parseFilters(req.nextUrl.searchParams);

    // Get total count
    let countQuery = supabase.from('intel_records').select('*', { count: 'exact', head: true });
    countQuery = applyFilters(countQuery, filters);
    const { count: totalCount } = await countQuery;
    const total = totalCount ?? 0;

    if (total === 0) {
      return NextResponse.json({
        totalCount: 0, tipologias: [], fenomenos: [], estructuras: [],
        respuestas: [], acciones: [], municipios: [], departamentos: [],
        generos: [], timeline: [], correlaciones: [],
        patternTemporal: DAY_NAMES.map(l => ({ label: l, count: 0 })),
        monthlyPattern: MONTH_NAMES.map(l => ({ label: l, count: 0 })),
        riskScore: 0, recomendaciones: [],
        municipiosByDept: {},
      });
    }

    // Accumulators
    const fieldCounts: Record<string, Record<string, number>> = {
      departamento: {}, municipio: {}, tipologia: {},
      fenomeno_criminalidad: {}, estructura: {},
      respuesta_accion: {}, accion_enemiga: {}, genero: {},
    };
    const timelineCounts: Record<string, number> = {};
    const corrCounts: Record<string, number> = {};
    const dayCounts: Record<number, number> = {};
    const monthCounts: Record<number, number> = {};
    const deptMuniMap: Record<string, Set<string>> = {};

    const pages = Math.ceil(total / PAGE_SIZE);

    // Fetch in parallel batches
    for (let b = 0; b < pages; b += PARALLEL) {
      const promises: Promise<any>[] = [];
      for (let p = b; p < Math.min(b + PARALLEL, pages); p++) {
        let q = supabase.from('intel_records')
          .select('departamento, municipio, tipologia, fenomeno_criminalidad, estructura, respuesta_accion, accion_enemiga, fecha, genero')
          .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)
          .order('id', { ascending: true });
        q = applyFilters(q, filters);
        promises.push(Promise.resolve(q));
      }
      const results = await Promise.all(promises);

      for (const { data, error } of results) {
        if (error) { console.error('Stats page error:', error.message); continue; }
        if (!data) continue;
        for (const r of data) {
          // Count categorical fields
          for (const field of Object.keys(fieldCounts)) {
            const val = (r as any)[field];
            if (val) {
              const v = String(val).trim();
              if (v) fieldCounts[field][v] = (fieldCounts[field][v] || 0) + 1;
            }
          }
          // Dept-muni mapping
          const dept = (r as any).departamento;
          const muni = (r as any).municipio;
          if (dept && muni) {
            if (!deptMuniMap[dept]) deptMuniMap[dept] = new Set();
            deptMuniMap[dept].add(muni);
          }
          // Timeline
          const f = (r as any).fecha;
          if (f) {
            const fs2 = String(f);
            const ym = fs2.substring(0, 7);
            if (ym.length === 7) timelineCounts[ym] = (timelineCounts[ym] || 0) + 1;
            // Day + month patterns
            try {
              const d = new Date(fs2);
              if (!isNaN(d.getTime())) {
                dayCounts[d.getDay()] = (dayCounts[d.getDay()] || 0) + 1;
                monthCounts[d.getMonth()] = (monthCounts[d.getMonth()] || 0) + 1;
              }
            } catch {}
          }
          // Correlations
          const fen = (r as any).fenomeno_criminalidad;
          const est = (r as any).estructura;
          if (fen && est) {
            const key = `${String(fen).trim()}|||${String(est).trim()}`;
            corrCounts[key] = (corrCounts[key] || 0) + 1;
          }
        }
      }
    }

    // Build results
    const timeline = Object.entries(timelineCounts)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fecha, count]) => ({ fecha, count }));

    const correlaciones = Object.entries(corrCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, count]) => {
        const [fenomeno, estructura] = key.split('|||');
        return { fenomeno: fenomeno ?? '', estructura: estructura ?? '', count };
      });

    const patternTemporal = DAY_NAMES.map((label, i) => ({ label, count: dayCounts[i] || 0 }));
    const monthlyPattern = MONTH_NAMES.map((label, i) => ({ label, count: monthCounts[i] || 0 }));

    // Risk score
    const riskScore = Math.min(100, Math.round((total / 100) * 1.5));

    // Recommendations
    const tipologias = topN(fieldCounts.tipologia);
    const municipios = topN(fieldCounts.municipio);
    const recomendaciones: string[] = [];

    if ((municipios[0]?.count ?? 0) > total * 0.15) {
      recomendaciones.push(`[ALERTA ALTA] ${municipios[0]?.name ?? 'N/A'} concentra ${((municipios[0]?.count ?? 0) / total * 100).toFixed(1)}% de los incidentes. Se recomienda reforzar presencia militar.`);
    }
    if ((tipologias[0]?.count ?? 0) > 0) {
      recomendaciones.push(`[TIPOLOGIA] Tipología predominante: "${tipologias[0]?.name ?? 'N/A'}" con ${tipologias[0]?.count ?? 0} casos.`);
    }
    const maxDay = patternTemporal.reduce((a, b) => a.count > b.count ? a : b, patternTemporal[0]);
    if (maxDay?.count > 0) {
      recomendaciones.push(`[PATRON] Mayor actividad los días ${maxDay.label} (${maxDay.count} incidentes).`);
    }
    const maxMonth = monthlyPattern.reduce((a, b) => a.count > b.count ? a : b, monthlyPattern[0]);
    if (maxMonth?.count > 0) {
      recomendaciones.push(`[TEMPORAL] Mes con mayor actividad: ${maxMonth.label} (${maxMonth.count} incidentes).`);
    }
    if ((correlaciones[0]?.count ?? 0) > 0) {
      recomendaciones.push(`[CORRELACION] Correlación más fuerte: "${correlaciones[0]?.fenomeno ?? ''}" vinculado a "${correlaciones[0]?.estructura ?? ''}" (${correlaciones[0]?.count ?? 0} casos).`);
    }
    recomendaciones.push(`[RESUMEN] Total de ${total} incidentes registrados en ${Object.keys(fieldCounts.municipio).length} municipios.`);

    // Convert dept-muni map
    const municipiosByDept: Record<string, string[]> = {};
    for (const [dept, muniSet] of Object.entries(deptMuniMap)) {
      municipiosByDept[dept] = Array.from(muniSet).sort();
    }

    return NextResponse.json({
      totalCount: total,
      tipologias,
      fenomenos: topN(fieldCounts.fenomeno_criminalidad),
      estructuras: topN(fieldCounts.estructura),
      respuestas: topN(fieldCounts.respuesta_accion),
      acciones: topN(fieldCounts.accion_enemiga),
      municipios,
      departamentos: topN(fieldCounts.departamento),
      generos: topN(fieldCounts.genero),
      timeline,
      correlaciones,
      patternTemporal,
      monthlyPattern,
      riskScore,
      recomendaciones,
      municipiosByDept,
    });
  } catch (err: any) {
    console.error('Stats error:', err);
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
