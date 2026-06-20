'use client';

import { useState } from 'react';
import { useIntel } from '@/contexts/intel-context';
import Header from './header';
import StatsSidebar from './stats-sidebar';
import IntelMap from './intel-map';
import ChartsPanel from './charts-panel';
import AnalysisPanel from './analysis-panel';
import PdfReportButton from './pdf-report';
import WelcomeScreen from './welcome-screen';
import DataGrid from './data-grid';
import { Menu, X, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { isDataLoaded, isLoading, stats } = useIntel();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!isDataLoaded) {
    return <WelcomeScreen />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <Header />

      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-16 left-2 z-40 lg:hidden bg-slate-700 border border-slate-600/50 text-cyan-400 p-2 rounded-lg shadow-lg"
      >
        {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      <div className="flex pt-14">
        {/* Sidebar izquierda - Desktop */}
        <aside className="hidden lg:block sticky top-14 left-0 z-30 h-[calc(100vh-3.5rem)] w-80 bg-slate-800/80 border-r border-slate-600/30 flex-shrink-0 overflow-y-auto scrollbar-hide">
          <div className="p-3 border-b border-slate-600/30 flex items-center justify-between">
            <span className="text-cyan-400 text-[11px] font-bold tracking-widest">PANEL DE CONTROL</span>
            <PdfReportButton />
          </div>
          <div className="p-3">
            <StatsSidebar />
          </div>
        </aside>

        {/* Sidebar móvil */}
        {sidebarOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed top-14 left-0 z-50 h-[calc(100vh-3.5rem)] w-80 max-w-[85vw] bg-slate-800 border-r border-slate-600/30 lg:hidden overflow-y-auto scrollbar-hide">
              <div className="p-3 border-b border-slate-600/30 flex items-center justify-between">
                <span className="text-cyan-400 text-xs font-bold tracking-widest">PANEL DE CONTROL</span>
                <div className="flex items-center gap-2">
                  <PdfReportButton />
                  <button onClick={() => setSidebarOpen(false)} className="text-slate-400 hover:text-cyan-400 p-1">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <StatsSidebar />
              </div>
            </aside>
          </>
        )}

        {/* CONTENIDO PRINCIPAL */}
        <main className="flex-1 min-w-0 overflow-y-auto" style={{ height: 'calc(100vh - 3.5rem)' }}>
          {isLoading && (
            <div className="fixed top-14 left-0 right-0 z-[80] flex items-center justify-center gap-2 bg-slate-800/90 backdrop-blur-sm py-2 border-b border-slate-600/30">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-cyan-400 text-xs font-mono">CARGANDO DATOS...</span>
            </div>
          )}

          <div className="p-3">
            {/* GRÁFICOS */}
            <div className="bg-slate-800/60 rounded-xl border border-slate-600/30 overflow-hidden mb-4 shadow-lg">
              <div className="p-3 border-b border-slate-600/30 bg-slate-800/80">
                <h2 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  DESGLOSE POR TIPOLOGIA Y ESTRUCTURAS
                </h2>
              </div>
              <div className="p-4">
                <ChartsPanel />
              </div>
            </div>

            {/* MAPA + IA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <div className="bg-slate-800/60 rounded-xl border border-slate-600/30 overflow-hidden shadow-lg">
                <div className="p-3 border-b border-slate-600/30 bg-slate-800/80">
                  <h2 className="text-sm font-semibold text-cyan-400 flex items-center gap-2">
                    <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                    MAPA DE INCIDENTES
                  </h2>
                </div>
                <div className="p-3">
                  <div className="rounded-lg overflow-hidden bg-slate-900/50" style={{ height: '420px' }}>
                    <IntelMap />
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl border border-slate-600/30 overflow-hidden shadow-lg">
                <div className="p-3 border-b border-slate-600/30 bg-slate-800/80">
                  <h2 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full" />
                    ANALISIS IA - INTELIGENCIA PREDICTIVA
                  </h2>
                </div>
                <div className="p-4" style={{ height: '420px', overflowY: 'auto' }}>
                  <AnalysisPanel />
                </div>
              </div>
            </div>

            {/* GRILLA DE DATOS - parte inferior */}
            <div className="mb-4">
              <DataGrid />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
