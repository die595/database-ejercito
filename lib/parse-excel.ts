import * as XLSX from 'xlsx';
import type { IntelRecord } from '@/contexts/intel-context';

function parseDMS(grados: any, minutos: any, segundos: any, isLon: boolean): number {
  const g = parseFloat(String(grados ?? 0)) || 0;
  const m = parseFloat(String(minutos ?? 0)) || 0;
  const s = parseFloat(String(segundos ?? 0)) || 0;
  const decimal = g + m / 60 + s / 3600;
  return isLon ? -Math.abs(decimal) : decimal;
}

function parseDate(val: any): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().split('T')[0] ?? '';
  if (typeof val === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(val);
      if (d) {
        const yr = String(d?.y ?? 2020);
        const mo = String(d?.m ?? 1).padStart(2, '0');
        const dy = String(d?.d ?? 1).padStart(2, '0');
        return `${yr}-${mo}-${dy}`;
      }
    } catch { /* ignore */ }
    return '';
  }
  if (typeof val === 'string') {
    if (val.startsWith('=')) return '';
    const parsed = new Date(val);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0] ?? '';
    return val;
  }
  return '';
}

function safeStr(val: any, maxLen: number = 0): string {
  if (val == null) return '';
  const s = String(val).trim();
  if (s.startsWith('=')) return '';
  if (maxLen > 0 && s.length > maxLen) return s.substring(0, maxLen);
  return s;
}

function safeNum(val: any): number {
  if (val == null) return 0;
  const s = String(val).trim();
  if (s.startsWith('=')) return NaN;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function processRow(row: any[], i: number): IntelRecord | null {
  if (!row || (row?.length ?? 0) < 10) return null;

  let lat = safeNum(row[10]);
  let lon = safeNum(row[11]);

  if (isNaN(lat) || lat === 0) {
    lat = parseDMS(row[4], row[5], row[6], false);
  }
  if (isNaN(lon) || lon === 0) {
    lon = parseDMS(row[7], row[8], row[9], true);
  }

  if (lat === 0 && lon === 0) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const dept = safeStr(row[1]);
  if (!dept) return null;

  return {
    id: i + 1,
    departamento: dept,
    municipio: safeStr(row[2]),
    vereda: safeStr(row[3], 100),
    latGrados: safeNum(row[4]),
    latMinutos: safeNum(row[5]),
    latSegundos: safeNum(row[6]),
    lonGrados: safeNum(row[7]),
    lonMinutos: safeNum(row[8]),
    lonSegundos: safeNum(row[9]),
    latitud: lat,
    longitud: lon,
    fecha: parseDate(row[12]),
    tipologia: safeStr(row[13]),
    informacionHecho: safeStr(row[14], 200),
    fenomenoCriminalidad: safeStr(row[15]),
    medios: safeStr(row[16]),
    genero: safeStr(row[18]),
    estructura: safeStr(row[19]),
    respuestaAccion: safeStr(row[20]),
    accionEnemiga: safeStr(row[21]),
    resTipo: safeStr(row[22]),
  };
}

export function parseExcelFile(buffer: ArrayBuffer): IntelRecord[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook?.SheetNames?.[0] ?? '';
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet) return [];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) ?? [];
  const rows = jsonData?.slice(1) ?? [];
  const records: IntelRecord[] = [];
  for (let i = 0; i < (rows?.length ?? 0); i++) {
    const record = processRow(rows[i], i);
    if (record) records.push(record);
  }
  return records;
}

export function parseCSVFile(text: string): IntelRecord[] {
  const workbook = XLSX.read(text, { type: 'string' });
  const sheetName = workbook?.SheetNames?.[0] ?? '';
  const sheet = workbook?.Sheets?.[sheetName];
  if (!sheet) return [];
  const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) ?? [];
  const rows = jsonData?.slice(1) ?? [];
  const records: IntelRecord[] = [];
  for (let i = 0; i < (rows?.length ?? 0); i++) {
    const record = processRow(rows[i], i);
    if (record) records.push(record);
  }
  return records;
}

// Convert compact array from server to IntelRecord
// Server format: [dept,muni,vereda,latG,latM,latS,lonG,lonM,lonS,lat,lon,fecha,
//                 tipologia,infoHecho,fenomeno,medios,genero,estructura,respAccion,accEnemiga,resTipo]
function compactToRecord(arr: any[], id: number): IntelRecord {
  return {
    id,
    departamento: arr[0] ?? '',
    municipio: arr[1] ?? '',
    vereda: arr[2] ?? '',
    latGrados: arr[3] ?? 0,
    latMinutos: arr[4] ?? 0,
    latSegundos: arr[5] ?? 0,
    lonGrados: arr[6] ?? 0,
    lonMinutos: arr[7] ?? 0,
    lonSegundos: arr[8] ?? 0,
    latitud: arr[9] ?? 0,
    longitud: arr[10] ?? 0,
    fecha: arr[11] ?? '',
    tipologia: arr[12] ?? '',
    informacionHecho: arr[13] ?? '',
    fenomenoCriminalidad: arr[14] ?? '',
    medios: arr[15] ?? '',
    genero: arr[16] ?? '',
    estructura: arr[17] ?? '',
    respuestaAccion: arr[18] ?? '',
    accionEnemiga: arr[19] ?? '',
    resTipo: arr[20] ?? '',
  };
}

export interface ImportProgress {
  message: string;
  percent: number;
}

// Threshold in bytes to use server-side parsing (10 MB)
const SERVER_PARSE_THRESHOLD = 10 * 1024 * 1024;

export async function importFile(
  file: File,
  onProgress?: (progress: ImportProgress) => void,
): Promise<IntelRecord[]> {
  const isCSV = file?.name?.toLowerCase()?.endsWith('.csv');
  const isLargeFile = file.size > SERVER_PARSE_THRESHOLD;

  // Small CSV files: client-side SheetJS
  if (isCSV && !isLargeFile) {
    onProgress?.({ message: 'Leyendo archivo CSV...', percent: 30 });
    const buffer = await file.arrayBuffer();
    const text = new TextDecoder().decode(buffer);
    onProgress?.({ message: 'Procesando CSV...', percent: 60 });
    const records = parseCSVFile(text);
    onProgress?.({ message: 'Listo', percent: 100 });
    return records;
  }

  // Small Excel files: try client-side SheetJS first
  if (!isCSV && !isLargeFile) {
    onProgress?.({ message: 'Procesando archivo Excel...', percent: 30 });
    const buffer = await file.arrayBuffer();
    const records = parseExcelFile(buffer);
    if (records.length > 0) {
      onProgress?.({ message: 'Listo', percent: 100 });
      return records;
    }
    // If SheetJS returned empty, fall through to server-side
  }

  // Large files or SheetJS failure: stream from server
  const sizeMB = (file.size / 1024 / 1024).toFixed(0);
  onProgress?.({ message: `Subiendo archivo (${sizeMB}MB) al servidor...`, percent: 2 });

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/parse-excel', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Error del servidor');
    throw new Error(errText);
  }

  // Read NDJSON stream
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No se pudo leer la respuesta del servidor');

  const decoder = new TextDecoder();
  let buffer = '';
  const allRecords: IntelRecord[] = [];
  let recordId = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete lines
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, newlineIdx).trim();
      buffer = buffer.substring(newlineIdx + 1);
      if (!line) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.t === 'p') {
          // Progress update
          onProgress?.({ message: msg.m ?? '', percent: msg.p ?? 0 });
        } else if (msg.t === 'c') {
          // Chunk of compact records
          const rows: any[][] = msg.d ?? [];
          for (let i = 0; i < rows.length; i++) {
            recordId++;
            allRecords.push(compactToRecord(rows[i], recordId));
          }
        } else if (msg.t === 'e') {
          throw new Error(msg.m ?? 'Error del servidor');
        } else if (msg.t === 'd') {
          // Done
          onProgress?.({ message: `${allRecords.length.toLocaleString()} registros cargados`, percent: 100 });
        }
      } catch (parseErr: any) {
        if (parseErr?.message?.includes('Error')) throw parseErr;
        // Skip malformed lines
      }
    }
  }

  if (allRecords.length === 0) {
    throw new Error('No se encontraron registros válidos en el archivo.');
  }

  return allRecords;
}
