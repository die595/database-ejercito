export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase';
import { getSessionUser } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Solo administradores pueden agregar registros' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const records = Array.isArray(body) ? body : [body];
    const supabase = getServiceSupabase();

    // Función para convertir fecha DD/MM/YYYY a YYYY-MM-DD
    const convertDate = (dateStr: string): string | null => {
      if (!dateStr) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        const date = new Date(`${year}-${month}-${day}`);
        if (!isNaN(date.getTime())) {
          return `${year}-${month}-${day}`;
        }
      }
      return null;
    };

    const rows = records.map((r: any) => ({
      departamento: (r.departamento ?? '').toString().trim(),
      municipio: (r.municipio ?? '').toString().trim(),
      vereda: (r.vereda ?? '').toString().trim(),
      lat_grados: parseFloat((r.lat_grados || '').toString().replace(',', '.')) || 0,
      lat_minutos: parseFloat((r.lat_minutos || '').toString().replace(',', '.')) || 0,
      lat_segundos: parseFloat((r.lat_segundos || '').toString().replace(',', '.')) || 0,
      lon_grados: parseFloat((r.lon_grados || '').toString().replace(',', '.')) || 0,
      lon_minutos: parseFloat((r.lon_minutos || '').toString().replace(',', '.')) || 0,
      lon_segundos: parseFloat((r.lon_segundos || '').toString().replace(',', '.')) || 0,
      latitud: parseFloat((r.latitud || '').toString().replace(',', '.')) || 0,
      longitud: parseFloat((r.longitud || '').toString().replace(',', '.')) || 0,
      fecha: convertDate(r.fecha), // Conversión aquí
      tipologia: (r.tipologia ?? '').toString().trim(),
      informacion_hecho: (r.informacion_hecho ?? '').toString().trim(),
      fenomeno_criminalidad: (r.fenomeno_criminalidad ?? '').toString().trim(),
      medios: (r.medios ?? '').toString().trim(),
      genero: (r.genero ?? '').toString().trim(),
      estructura: (r.estructura ?? '').toString().trim(),
      respuesta_accion: (r.respuesta_accion ?? '').toString().trim(),
      accion_enemiga: (r.accion_enemiga ?? '').toString().trim(),
      res_tipo: (r.res_tipo ?? '').toString().trim(),
    }));

    const { data, error } = await supabase.from('intel_records').insert(rows).select('id');
    if (error) throw error;

    return NextResponse.json({ success: true, count: data?.length ?? 0 });
  } catch (err: any) {
    console.error('Error en /api/intel/records:', err);
    return NextResponse.json({ error: err?.message ?? 'Error al insertar' }, { status: 500 });
  }
}