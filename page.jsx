'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamic imports — prevents SSR issues with browser APIs
const DocumentScanner = dynamic(() => import('../components/DocumentScanner'), { ssr: false });
const IDCardMerge = dynamic(() => import('../components/IDCardMerge'), { ssr: false });

const MODULES = [
  {
    id: 'scanner',
    label: 'Document Scanner',
    shortLabel: 'Scanner',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <path d="M3 9h18M9 21V9"/>
      </svg>
    ),
    description: 'Batch scan · Auto-crop · PDF export',
  },
  {
    id: 'idcard',
    label: 'ID Card Mode',
    shortLabel: 'ID Card',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="13" rx="2"/>
        <circle cx="8" cy="13" r="2.5"/>
        <path d="M14 11h4M14 14h3"/>
      </svg>
    ),
    description: 'Front & back · A4 merge · Print ready',
  },
];

export default function Home() {
  const [activeModule, setActiveModule] = useState('scanner');

  return (
    <div className="min-h-screen grid-bg">
      {/* ── Navigation Bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-obsidian-950/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative w-7 h-7 flex items-center justify-center">
                <div className="absolute inset-0 rounded border border-cyan-400/40 bg-cyan-400/5" />
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 4L4 1H13V13H1V4Z" stroke="#22D3EE" strokeWidth="1.2" fill="none"/>
                  <path d="M1 4H4V1" stroke="#22D3EE" strokeWidth="1.2" fill="none"/>
                  <path d="M4 7H10M4 9.5H8" stroke="#22D3EE" strokeWidth="1" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <span className="font-display font-semibold text-slate-100 tracking-tight text-sm">
                  Docu<span className="text-gradient-cyan">Lens</span>
                </span>
              </div>
            </div>

            {/* Module tabs */}
            <nav className="flex items-center gap-1 p-1 rounded-lg border border-slate-800 bg-obsidian-900">
              {MODULES.map(mod => (
                <button
                  key={mod.id}
                  onClick={() => setActiveModule(mod.id)}
                  className={[
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-display font-medium transition-all duration-200',
                    activeModule === mod.id
                      ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/25 shadow-sm'
                      : 'text-slate-500 hover:text-slate-400',
                  ].join(' ')}
                >
                  <span className={activeModule === mod.id ? 'text-cyan-400' : 'text-slate-600'}>
                    {mod.icon}
                  </span>
                  <span className="hidden sm:inline">{mod.shortLabel}</span>
                </button>
              ))}
            </nav>

            {/* Privacy badge */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full border border-slate-800 bg-obsidian-900">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-mono text-[10px] text-slate-500">100% local · no uploads</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero strip ────────────────────────────────────────────────── */}
      <div className="border-b border-slate-800/50 bg-obsidian-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <h1 className="font-display text-xl sm:text-2xl font-semibold text-slate-100 tracking-tight">
                {MODULES.find(m => m.id === activeModule)?.label}
              </h1>
              <p className="font-mono text-xs text-slate-500 mt-1">
                {MODULES.find(m => m.id === activeModule)?.description}
              </p>
            </div>

            {/* Tech stack badges */}
            <div className="flex flex-wrap gap-2">
              {['OpenCV.js', 'Web Workers', 'Canvas API', 'jsPDF'].map(tech => (
                <span
                  key={tech}
                  className="font-mono text-[10px] text-slate-600 px-2 py-1 rounded border border-slate-800"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeModule === 'scanner' && <DocumentScanner />}
        {activeModule === 'idcard' && <IDCardMerge />}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold text-slate-400">
                Docu<span className="text-gradient-cyan">Lens</span>
              </span>
              <span className="font-mono text-[10px] text-slate-700">v0.1.0</span>
            </div>
            <p className="font-mono text-[10px] text-slate-700 text-center">
              Browser-native document intelligence · Your data stays local · Built with OpenCV.js + Next.js
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
