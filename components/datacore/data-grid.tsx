'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Plus, Save, Trash2, Loader2, Lock, ClipboardPaste } from 'lucide-react';
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
// FUNCIÓN DE PARSEO MEJORADA
// ------------------------------------------------------------
function parseExcelPaste(text: string): Row[] {
  // 1. Limpiar y dividir en líneas
  const rawLines = text.split('\n').map(line => line.replace(/\r/g, '').trim()).filter(line => line !== '');
  if (rawLines.length === 0) {
    console.warn('⚠️ No hay líneas para parsear');
    return [];
  }

  console.log('📄 Líneas recibidas:', rawLines);

  // 2. Detectar el separador más probable (tabulador, coma, punto y coma, pipe)
  const separators = ['\t', ',', ';', '|'];
  let separator = '\t';
  for (const sep of separators) {
    // Contar cuántas veces aparece el separador en la primera línea
    const count = (rawLines[0].match(new RegExp(sep, 'g')) || []).length;
    if (count > 1) {
      separator = sep;
      break;
    }
  }
  console.log('🔍 Separador detectado:', separator === '\t' ? 'TAB' : separator);

  // 3. Parsear cada línea como datos (ignoramos cualquier posible encabezado)
  const parsedRows: Row[] = [];
  for (const line of rawLines) {
    // Dividir por el separador
    let values = line.split(separator).map(v => v.trim());
    // Si la línea tiene menos de 2 valores, saltarla
    if (values.length < 2) {
      console.warn('⚠️ Línea con pocos valores, saltando:', line);
      continue;
    }

    // Crear fila vacía
    const row: Row = {};
    COLUMNS.forEach(col => { row[col.key] = ''; });

    // Asignar por orden posicional (hasta donde alcance)
    COLUMNS.forEach((col, idx) => {
      if (idx < values.length) {
        let val = values[idx] || '';
        // Si el valor parece un número con coma decimal, reemplazar coma por punto
        if (/^-?\d+,\d+$/.test(val)) {
          val = val.replace(',', '.');
        }
        row[col.key] = val;
      }
    });

    // Verificar si la fila tiene al menos un campo relevante
    const hasData = row.departamento || row.municipio || row.tipologia || row.latitud || row.longitud;
    if (hasData) {
      parsedRows.push(row);
    } else {
      console.warn('⚠️ Fila sin datos relevantes, saltando:', row);
    }
  }

  console.log(`📊 ${parsedRows.length} filas parseadas:`, parsedRows);
  return parsedRows;
}

export default function DataGrid() {
  const { isAdmin } = useAuth();
  const { refreshData } = useIntel(); // Aunque no lo usaremos para no perder datos
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

  // ------------------------------------------------------------
  // SAVE ROWS - CORREGIDO: ya no refresca todo el dashboard
  // ------------------------------------------------------------
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
      // ✅ ELIMINADO: await refreshData();  // Ya no refresca todo el dashboard
      // Los datos se actualizarán cuando el usuario recargue la página o navegue.
      // Si quieres actualizar solo las estadísticas, puedes llamar a una función específica.
    } catch (err: any) {
      toast.error('Error: ' + (err?.message ?? 'desconocido'));
    } finally {
      setSaving(false);
    }
  }, [rows]); // ✅ refreshData ya no está en las dependencias

  // Manejar pegado a nivel de tabla
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = e.clipboardData?.getData('text/plain');
    console.log('📋 Texto pegado (crudo):', pastedText);
    if (!pastedText) {
      toast.warning('No se detectó texto en el portapapeles.');
      return;
    }

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
          <span className="text-xs text-slate-400 hidden sm:inline flex items-center gap-1">
            <ClipboardPaste className="w-4 h-4 text-emerald-400" />
            Pega desde Excel (Ctrl+V) - solo datos, sin encabezados
          </span>
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