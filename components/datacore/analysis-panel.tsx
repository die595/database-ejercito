'use client';

import { useIntel } from '@/contexts/intel-context';
import { Brain, MapPin, TrendingUp, Link2, Shield } from 'lucide-react';

export default function AnalysisPanel() {
  const { stats, isDataLoaded } = useIntel();

  if (!isDataLoaded || !stats) return null;

  const topMunicipios = (stats.municipios ?? []).slice(0, 5);
  const topTipologias = (stats.tipologias ?? []).slice(0, 5);
  const correlaciones = stats.correlaciones ?? [];
  const recomendaciones = stats.recomendaciones ?? [];
  const riskScore = stats.riskScore ?? 0;

  return (
    <div className="p-2">
      <div className="bg-slate-800/60 border border-slate-600/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-5 h-5 text-cyan-400" />
          <h2 className="text-cyan-400 text-sm font-bold tracking-widest uppercase">ANALISIS INTELIGENTE</h2>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-slate-400">NIVEL DE RIESGO</span>
            <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${riskScore > 70 ? 'bg-red-500' : riskScore > 40 ? 'bg-orange-500' : 'bg-green-500'}`}
                style={{ width: `${riskScore}%` }} />
            </div>
            <span className="text-xs font-mono font-bold text-white">{riskScore}%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-slate-700/40 rounded-lg p-3 border border-red-800/20">
            <div className="flex items-center gap-1.5 mb-2">
              <MapPin className="w-3.5 h-3.5 text-red-400" />
              <span className="text-red-400 text-[10px] font-bold tracking-wider">ZONAS DE MAYOR RIESGO</span>
            </div>
            {topMunicipios.map((m, i) => (
              <div key={i} className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{i + 1}. {m.name}</span>
                <span className="text-red-400 font-mono font-bold">{m.count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-700/40 rounded-lg p-3 border border-cyan-800/20">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-cyan-400 text-[10px] font-bold tracking-wider">TIPOLOGIAS FRECUENTES</span>
            </div>
            {topTipologias.map((t, i) => (
              <div key={i} className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{i + 1}. {t.name}</span>
                <span className="text-cyan-400 font-mono font-bold">{t.count.toLocaleString()}</span>
              </div>
            ))}
          </div>

          <div className="bg-slate-700/40 rounded-lg p-3 border border-purple-800/20">
            <div className="flex items-center gap-1.5 mb-2">
              <Link2 className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-purple-400 text-[10px] font-bold tracking-wider">CORRELACIONES</span>
            </div>
            {correlaciones.slice(0, 5).map((c, i) => (
              <div key={i} className="text-[10px] text-slate-400 mb-1">
                <span className="text-slate-300">{(c.fenomeno ?? '').substring(0, 30)}</span>
                <span className="text-purple-400 mx-1">-{'>'}</span>
                <span className="text-slate-300">{(c.estructura ?? '').substring(0, 20)}</span>
                <span className="text-purple-400 font-mono ml-1">({c.count})</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 bg-slate-700/40 rounded-lg p-3 border border-green-800/20">
          <div className="flex items-center gap-1.5 mb-2">
            <Shield className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-400 text-[10px] font-bold tracking-wider">RECOMENDACIONES DE SEGURIDAD</span>
          </div>
          <div className="space-y-1.5">
            {recomendaciones.map((rec, i) => (
              <p key={i} className="text-xs text-slate-300 leading-relaxed">{rec}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
