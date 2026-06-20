'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Plus, Save, Trash2, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { useIntel } from '@/contexts/intel-context';

// Columnas en el orden exacto en que se esperan los datos (posicional)
const COLUMNS = [
  { key: 'departamento', label: 'Departamento', width: 120 },
  { key: 'municipio', label: 'Municipio', width: 120 },
  { key: 'vereda', label: 'Vereda', width: 120 },
  { key: 'lat_grados', label: 'Lat °', width: 70 },
  { key: 'lat_minutos', label: "Lat '", width: 70 },
  { key: 'lat_segundos', label: 'Lat "', width: 70 },
  { key: 'lon_grados', label: 'Lon °', width: 70 },
  { key: 'lon_minutos', label: "Lon '", width: 70 },
  { key: 'lon_segundos', label: 'Lon "', width: 70 },
  { key: 'latitud', label: 'Latitud (dec)', width: 100 },
  { key: 'longitud', label: 'Longitud (dec)', width: 100 },
  { key: 'fecha', label: 'Fecha', width: 110 },
  { key: 'tipologia', label: 'Tipología', width: 140 },
  { key: 'informacion_hecho', label: 'Información Hecho', width: 200 },
  { key: 'fenomeno_criminalidad', label: 'Fenómeno Criminalidad', width: 160 },
  { key: 'medios', label: 'Medios', width: 100 },
  { key: 'genero', label: 'Género', width: 80 },
  { key: 'estructura', label: 'Estructura', width: 130 },
  { key: 'respuesta_accion', label: 'Respuesta Acción', width: 130 },
  { key: 'accion_enemiga', label: 'Acción Enemiga', width: 130 },
  { key: 'res_tipo', label: 'Res Tipo', width: 100 },
];

type Row = Record<string, string>;

function emptyRow(): Row {
  const r: Row = {};
  COLUMNS.forEach(c => { r[c.key] = ''; });
  return r;
}

// ------------------------------------------------------------
// PARSEADOR POSICIONAL DEFINITIVO
// ------------------------------------------------------------
function parseExcelPaste(text: string): Row[] {
  // 1. Dividir en líneas y limpiar \r
  const rawLines = text.split('\n').map(line => line.replace(/\r/g, '').trim()).filter(line => line !== '');
  if (rawLines.length === 0) return [];

  // 2. Detectar el separador más común en la primera línea
  const separators = ['\t', ',', ';', '|'];
  let separator = '\t'; // valor por defecto
  for (const sep of separators) {
    if (rawLines[0].includes(sep)) {
      separator = sep;
      break;
    }
  }
  // Si no se encontró ninguno, usamos tabulador (fallback)
  console.log('🔍 Separador detectado:', separator === '\t' ? 'TAB' : separator);

  // 3. Intentar detectar si la primera línea es encabezado
  const firstLine = rawLines[0].toLowerCase();
  const headerKeywords = ['departamento', 'municipio', 'vereda', 'lat', 'lon', 'fecha', 'tipologia', 'informacion', 'fenomeno', 'medios', 'genero', 'estructura', 'respuesta', 'accion', 'res_tipo'];
  const hasHeader = headerKeywords.some(kw => firstLine.includes(kw));

  // 4. Definir las líneas de datos
  const dataLines = hasHeader ? rawLines.slice(1) : rawLines;
  if (dataLines.length === 0) return [];

  // 5. Parsear cada línea de datos
  const parsedRows: Row[] = [];
  for (const line of dataLines) {
    // Dividir por el separador
    let values = line.split(separator).map(v => v.trim());
    // Si el separador es coma, pero hay campos que contienen comas (ej: "INFORMACION, CON COMA"), esto fallará.
    // Para simplificar, asumimos que el separador es consistente.

    // Filtrar líneas que no tienen suficientes columnas (menos de 2)
    if (values.length < 2) continue;

    // Crear fila vacía
    const row: Row = {};
    COLUMNS.forEach(col => { row[col.key] = ''; });

    // Asignar por orden posicional (hasta donde alcance)
    COLUMNS.forEach((col, idx) => {
      if (idx < values.length) {
        let val = values[idx] || '';
        // Convertir coma decimal a punto
        if (/^-?\d+,\d+$/.test(val)) {
          val = val.replace(',', '.');
        }
        row[col.key] = val;
      }
    });

    // Solo agregar si tiene al menos un campo relevante
    if (row.departamento || row.municipio || row.tipologia || row.latitud || row.longitud) {
      parsedRows.push(row);
    }
  }

  console.log(`📊 ${parsedRows.length} filas parseadas:`, parsedRows);
  return parsedRows;
}

export default function DataGrid() {
  const { isAdmin } = useAuth();
  const { refreshData } = useIntel();
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const updateCell = useCallback((rowIdx: number, key: string, value: string) => {
    setRows(prev => {
      const copy = [...prev];
      copy[rowIdx] = { ...copy[rowIdx], [key]: value };
      return copy;
    });
  }, []);

  const addRow = useCallback(() => {
    setRows(prev => [...prev, emptyRow()]);
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows(prev => prev.length <= 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx));
  }, []);

  const saveRows = useCallback(async () => {
    const validRows = rows.filter(r =>
      r.departamento?.trim() || r.municipio?.trim() || r.tipologia?.trim()
    );
    if (validRows.length === 0) {
      toast.error('Ingrese al menos un registro con datos.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/intel/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRows),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`${data.count} registro(s) guardados exitosamente.`);
      setRows([emptyRow()]);
      await refreshData();
    } catch (err: any) {
      toast.error('Error: ' + (err?.message ?? 'desconocido'));
    } finally {
      setSaving(false);
    }
  }, [rows, refreshData]);

  // Manejar pegado a nivel de tabla
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = e.clipboardData?.getData('text/plain');
    if (!pastedText) return;

    const parsedRows = parseExcelPaste(pastedText);
    if (parsedRows.length === 0) {
      toast.warning('No se encontraron datos válidos. Asegúrate de copiar solo las filas de datos (sin encabezados).');
      return;
    }

    setRows(prev => [...prev, ...parsedRows]);
    e.preventDefault(); // Evita que se pegue en un input individual
    toast.info(`${parsedRows.length} fila(s) pegadas desde Excel.`);
  }, []);

  // Prevenir pegado en inputs individuales
  const preventInputPaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
  }, []);

  if (!isAdmin) {
    return (
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
        <Lock className="w-8 h-8 text-slate-500 mx-auto mb-2" />
        <p className="text-slate-400 text-sm">Solo los administradores pueden agregar registros directamente.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="p-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
          AGREGAR REGISTROS MANUALMENTE
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 hidden sm:inline">🖥️   Pega desde Excel (Ctrl+V)</span>
          <button onClick={addRow} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-lg text-xs transition-colors">
            <Plus className="w-3.5 h-3.5" /> Fila
          </button>
          <button onClick={saveRows} disabled={saving}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      <div
        ref={tableContainerRef}
        onPaste={handlePaste}
        tabIndex={0}
        className="overflow-x-auto"
        style={{ outline: 'none' }}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-900/80">
              <th className="px-2 py-2 text-left text-slate-400 font-medium w-8 sticky left-0 bg-slate-900/80 z-10">#</th>
              {COLUMNS.map(col => (
                <th key={col.key} className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap" style={{ minWidth: col.width }}>
                  {col.label}
                </th>
              ))}
              <th className="px-2 py-2 w-8 sticky right-0 bg-slate-900/80 z-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="border-t border-slate-800/50 hover:bg-slate-800/30">
                <td className="px-2 py-1 text-slate-500 font-mono sticky left-0 bg-slate-900/80 z-10">{rIdx + 1}</td>
                {COLUMNS.map(col => (
                  <td key={col.key} className="px-1 py-1">
                    <input
                      type={col.key === 'fecha' ? 'date' : 'text'}
                      value={row[col.key] ?? ''}
                      onChange={(e) => updateCell(rIdx, col.key, e.target.value)}
                      onPaste={preventInputPaste}
                      className="w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  </td>
                ))}
                <td className="px-1 py-1 sticky right-0 bg-slate-900/80 z-10">
                  <button onClick={() => removeRow(rIdx)} className="text-slate-500 hover:text-red-400 p-1">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}