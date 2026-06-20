export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getServiceSupabase } from '@/lib/supabase';

function parseDMS(g: any, m: any, s: any, isLon: boolean): number {
  const gn = parseFloat(String(g ?? 0)) || 0;
  const mn = parseFloat(String(m ?? 0)) || 0;
  const sn2 = parseFloat(String(s ?? 0)) || 0;
  const dec = gn + mn / 60 + sn2 / 3600;
  return isLon ? -Math.abs(dec) : dec;
}

function cv(cell: ExcelJS.Cell | undefined): any {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && 'result' in v) return (v as any).result ?? '';
  if (typeof v === 'object' && v !== null && 'richText' in v) return ((v as any).richText ?? []).map((r: any) => r?.text ?? '').join('');
  return v;
}

function ss(val: any, maxLen: number = 0): string {
  if (val == null) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0] ?? '';
  const s = String(val).trim();
  if (s.startsWith('=')) return '';
  if (maxLen > 0 && s.length > maxLen) return s.substring(0, maxLen);
  return s;
}

function sn(val: any): number {
  if (val == null) return NaN;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (s.startsWith('=')) return NaN;
  return parseFloat(s);
}

function pd(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    const iso = val.toISOString().split('T')[0];
    return iso || null;
  }
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + val * 86400000);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0] ?? null;
    return null;
  }
  if (typeof val === 'string') {
    if (val.startsWith('=')) return null;
    const p = new Date(val);
    if (!isNaN(p.getTime())) return p.toISOString().split('T')[0] ?? null;
    return null;
  }
  return null;
}

function toSupabaseRow(cells: any[]): Record<string, any> | null {
  const dept = ss(cells[1]);
  if (!dept) return null;

  let lat = sn(cells[10]);
  let lon = sn(cells[11]);
  if (isNaN(lat) || lat === 0) lat = parseDMS(cells[4], cells[5], cells[6], false);
  if (isNaN(lon) || lon === 0) lon = parseDMS(cells[7], cells[8], cells[9], true);
  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  return {
    departamento: dept,
    municipio: ss(cells[2]),
    vereda: ss(cells[3], 100),
    lat_grados: sn(cells[4]) || 0,
    lat_minutos: sn(cells[5]) || 0,
    lat_segundos: sn(cells[6]) || 0,
    lon_grados: sn(cells[7]) || 0,
    lon_minutos: sn(cells[8]) || 0,
    lon_segundos: sn(cells[9]) || 0,
    latitud: lat,
    longitud: lon,
    fecha: pd(cells[12]),
    tipologia: ss(cells[13], 200),
    informacion_hecho: ss(cells[14], 500),
    fenomeno_criminalidad: ss(cells[15], 200),
    medios: ss(cells[16], 200),
    genero: ss(cells[18], 50),
    estructura: ss(cells[19], 200),
    respuesta_accion: ss(cells[20], 200),
    accion_enemiga: ss(cells[21], 200),
    res_tipo: ss(cells[22], 200),
  };
}

function parseCSVLine(line: string, delim: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === delim) { result.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  result.push(cur);
  return result;
}

// Robust insert with retry: if a batch fails, split and retry with smaller chunks
async function robustInsert(
  sb: ReturnType<typeof getServiceSupabase>,
  rows: Record<string, any>[]
): Promise<{ inserted: number; errors: number }> {
  if (rows.length === 0) return { inserted: 0, errors: 0 };

  const { error } = await sb.from('intel_records').insert(rows);
  if (!error) {
    return { inserted: rows.length, errors: 0 };
  }

  // If batch is already 1 row, skip it
  if (rows.length <= 1) {
    console.error('Single row insert failed:', error.message, JSON.stringify(rows[0]).substring(0, 200));
    return { inserted: 0, errors: 1 };
  }

  // Split in half and retry
  const mid = Math.floor(rows.length / 2);
  const [r1, r2] = await Promise.all([
    robustInsert(sb, rows.slice(0, mid)),
    robustInsert(sb, rows.slice(mid)),
  ]);
  return { inserted: r1.inserted + r2.inserted, errors: r1.errors + r2.errors };
}

export async function POST(req: NextRequest) {
  let tmpFile = '';
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const fileName = file.name?.toLowerCase() ?? '';
    const isCSV = fileName.endsWith('.csv');
    const arrayBuffer = await file.arrayBuffer();
    const fileSizeMB = (arrayBuffer.byteLength / 1024 / 1024).toFixed(0);

    const sb = getServiceSupabase();
    // Use smaller batch size to avoid Supabase REST API payload limits
    const BATCH_SIZE = 500;
    // Run multiple insert requests in parallel for speed
    const PARALLEL_INSERTS = 8;

    const encoder = new TextEncoder();
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    const sendLine = async (obj: any) => {
      await writer.write(encoder.encode(JSON.stringify(obj) + '\n'));
    };

    (async () => {
      try {
        await sendLine({ t: 'p', m: 'Limpiando datos anteriores...', p: 1 });
        // Delete in batches to avoid timeout on large tables
        let deleteMore = true;
        while (deleteMore) {
          const { data: ids } = await sb.from('intel_records').select('id').limit(10000);
          if (!ids || ids.length === 0) { deleteMore = false; break; }
          const idList = ids.map((r: any) => r.id);
          await sb.from('intel_records').delete().in('id', idList);
          await sendLine({ t: 'p', m: `Limpiando datos anteriores (${idList.length})...`, p: 1 });
        }

        let totalInserted = 0;
        let totalErrors = 0;
        let pendingBatches: Record<string, any>[][] = [];
        let batch: Record<string, any>[] = [];

        const flushParallel = async () => {
          if (pendingBatches.length === 0) return;
          const batches = [...pendingBatches];
          pendingBatches = [];
          const results = await Promise.all(
            batches.map(b => robustInsert(sb, b))
          );
          for (const r of results) {
            totalInserted += r.inserted;
            totalErrors += r.errors;
          }
        };

        const queueBatch = async () => {
          if (batch.length === 0) return;
          pendingBatches.push([...batch]);
          batch = [];
          if (pendingBatches.length >= PARALLEL_INSERTS) {
            await flushParallel();
          }
        };

        if (isCSV) {
          await sendLine({ t: 'p', m: `Procesando CSV (${fileSizeMB}MB)...`, p: 3 });
          const text = Buffer.from(arrayBuffer).toString('utf-8');
          let lineCount = 0;
          for (let i = 0; i < text.length; i++) { if (text[i] === '\n') lineCount++; }
          await sendLine({ t: 'p', m: `${lineCount.toLocaleString()} filas detectadas...`, p: 5 });

          const firstNL = text.indexOf('\n');
          const firstLine = firstNL > 0 ? text.substring(0, firstNL) : text;
          const delim = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

          let lineStart = 0;
          let isHeader = true;
          let rowIdx = 0;
          let emptyStreak = 0;

          for (let i = 0; i <= text.length; i++) {
            if (i === text.length || text[i] === '\n') {
              let lineEnd = i;
              if (lineEnd > 0 && text[lineEnd - 1] === '\r') lineEnd--;
              if (lineEnd > lineStart) {
                const line = text.substring(lineStart, lineEnd);
                if (isHeader) {
                  isHeader = false;
                } else {
                  rowIdx++;
                  const cells = parseCSVLine(line, delim);
                  if (!cells[1] || cells[1].trim() === '') {
                    emptyStreak++;
                    if (emptyStreak > 50) break;
                  } else {
                    emptyStreak = 0;
                    const rec = toSupabaseRow(cells);
                    if (rec) batch.push(rec);
                  }
                  if (batch.length >= BATCH_SIZE) {
                    await queueBatch();
                    if (rowIdx % 5000 === 0) {
                      const pct = Math.min(90, Math.round(5 + (rowIdx / lineCount) * 85));
                      await sendLine({ t: 'p', m: `Insertando... ${totalInserted.toLocaleString()} registros (fila ${rowIdx.toLocaleString()})`, p: pct });
                    }
                  }
                }
              }
              lineStart = i + 1;
            }
          }
          if (batch.length > 0) await queueBatch();
          await flushParallel();

        } else {
          await sendLine({ t: 'p', m: `Cargando Excel (${fileSizeMB}MB)...`, p: 3 });
          tmpFile = path.join(os.tmpdir(), `excel_${Date.now()}.xlsx`);
          fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));

          const estRows = 500000;
          let rowIdx = 0;
          let isHeader = true;
          let emptyStreak = 0;

          const wbReader = new ExcelJS.stream.xlsx.WorkbookReader(
            fs.createReadStream(tmpFile), {}
          );

          for await (const ws of wbReader) {
            await sendLine({ t: 'p', m: 'Leyendo hoja de c\u00e1lculo...', p: 5 });
            for await (const row of ws) {
              if (isHeader) { isHeader = false; continue; }
              rowIdx++;

              const dept = cv(row.getCell(2));
              if (!dept || String(dept).trim() === '') {
                emptyStreak++;
                if (emptyStreak > 100) break;
                continue;
              }
              emptyStreak = 0;

              const cells: any[] = [];
              for (let c = 1; c <= 23; c++) cells.push(cv(row.getCell(c)));

              const rec = toSupabaseRow(cells);
              if (rec) batch.push(rec);

              if (batch.length >= BATCH_SIZE) {
                await queueBatch();
                if (rowIdx % 5000 === 0) {
                  const pct = Math.min(90, Math.round(5 + (rowIdx / estRows) * 85));
                  await sendLine({ t: 'p', m: `Insertando... ${totalInserted.toLocaleString()} registros (fila ${rowIdx.toLocaleString()})`, p: pct });
                }
              }
            }
            break;
          }
          if (batch.length > 0) await queueBatch();
          await flushParallel();
          try { fs.unlinkSync(tmpFile); tmpFile = ''; } catch {}
        }

        await sendLine({ t: 'p', m: `Finalizando... ${totalInserted.toLocaleString()} registros insertados${totalErrors > 0 ? ` (${totalErrors} filas con errores)` : ''}`, p: 95 });
        await sendLine({ t: 'd', n: totalInserted, errors: totalErrors });
        await writer.close();
      } catch (err: any) {
        console.error('Import error:', err);
        try {
          await sendLine({ t: 'e', m: err?.message ?? 'Error procesando archivo' });
          await writer.close();
        } catch {}
        if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: any) {
    console.error('Import error:', err);
    if (tmpFile) try { fs.unlinkSync(tmpFile); } catch {}
    return new Response(JSON.stringify({ error: err?.message ?? 'Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
}
