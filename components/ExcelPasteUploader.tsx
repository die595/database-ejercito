'use client';

import { useState } from 'react';

// Función para parsear el texto copiado desde Excel
function parseExcelPaste(text: string): any[] {
  const lines = text.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  // Usamos la primera línea como encabezados
  const headers = lines[0].split('\t').map(h => h.trim().toLowerCase());
  const dataLines = lines.slice(1);

  // Mapeo de nombres de columnas de Excel a los nombres que espera la API
  const fieldMap: { [key: string]: string } = {
    'departamento': 'departamento',
    'municipio': 'municipio',
    'vereda': 'vereda',
    'lat_grados': 'lat_grados',
    'lat_minutos': 'lat_minutos',
    'lat_segundos': 'lat_segundos',
    'lon_grados': 'lon_grados',
    'lon_minutos': 'lon_minutos',
    'lon_segundos': 'lon_segundos',
    'latitud': 'latitud',
    'longitud': 'longitud',
    'fecha': 'fecha',
    'tipologia': 'tipologia',
    'informacion_hecho': 'informacion_hecho',
    'fenomeno_criminalidad': 'fenomeno_criminalidad',
    'medios': 'medios',
    'genero': 'genero',
    'estructura': 'estructura',
    'respuesta_accion': 'respuesta_accion',
    'accion_enemiga': 'accion_enemiga',
    'res_tipo': 'res_tipo',
  };

  return dataLines.map(line => {
    const values = line.split('\t').map(v => v.trim());
    const obj: any = {};
    headers.forEach((header, index) => {
      const field = fieldMap[header];
      if (field && index < values.length) {
        obj[field] = values[index];
      }
    });
    return obj;
  });
}

export default function ExcelPasteUploader() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success?: boolean; count?: number; error?: string } | null>(null);

  const handlePaste = async () => {
    if (!text.trim()) {
      alert('Primero pega los datos desde Excel');
      return;
    }

    try {
      setLoading(true);
      setResult(null);

      const records = parseExcelPaste(text);
      if (records.length === 0) {
        alert('No se encontraron datos válidos. Asegúrate de copiar incluyendo la fila de encabezados.');
        return;
      }

      console.log('Enviando registros:', records); // Para depurar

      const response = await fetch('/api/admin/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(records),
      });

      const data = await response.json();
      if (response.ok) {
        setResult({ success: true, count: data.count });
        setText(''); // Limpiar el textarea después de éxito
      } else {
        setResult({ error: data.error || 'Error desconocido' });
      }
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border rounded-md bg-white">
      <h3 className="text-lg font-bold mb-2">📋 Pegar desde Excel</h3>
      <p className="text-sm text-gray-600 mb-2">
        Copia las celdas de Excel (incluyendo la fila de encabezados) y pégalas aquí.
        Luego haz clic en "Agregar registros".
      </p>
      <textarea
        rows={10}
        className="w-full border p-2 font-mono text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Pega aquí el contenido copiado de Excel..."
      />
      <br />
      <button
        onClick={handlePaste}
        disabled={loading}
        className="mt-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
      >
        {loading ? 'Enviando...' : 'Agregar registros'}
      </button>

      {result && (
        <div className="mt-3 p-2 border rounded">
          {result.success ? (
            <p className="text-green-600">✅ {result.count} registro(s) agregados correctamente.</p>
          ) : (
            <p className="text-red-600">❌ Error: {result.error}</p>
          )}
        </div>
      )}
    </div>
  );
}