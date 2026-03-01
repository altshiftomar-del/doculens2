'use client';
/**
 * DocuLens — ID Card Merge Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Dual dropzone for front + back of ID card.
 * Auto-crops each side via OpenCV, merges onto A4 canvas, exports as JPG/PDF.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useOpenCVWorker } from '../hooks/useOpenCVWorker';
import {
  fileToDataURL,
  mergeIDCardsToCanvas,
  exportCanvasAsJPG,
  exportCanvasAsPDF,
  imageDataToPreviewURL,
} from '../lib/canvasUtils';

// ─── Sub-component: Single ID side dropzone ───────────────────────────────────
function IDDropzone({ side, label, icon, imageData, previewURL, isProcessing, onDrop, onClear }) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.heic'] },
    multiple: false,
    disabled: isProcessing,
  });

  return (
    <div className="flex flex-col gap-3">
      {/* Label row */}
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded-full border border-cyan-400/50 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-cyan-400" />
        </div>
        <span className="font-display text-xs font-500 tracking-widest uppercase text-cyan-400/80">
          {label}
        </span>
        {imageData && !isProcessing && (
          <button
            onClick={onClear}
            className="ml-auto text-xs text-slate-500 hover:text-red-400 transition-colors duration-200 font-mono"
          >
            × clear
          </button>
        )}
      </div>

      {/* Drop area */}
      <div
        {...getRootProps()}
        className={[
          'relative overflow-hidden rounded border transition-all duration-300 cursor-pointer select-none',
          'aspect-[85.6/54]', // ID card ratio
          isDragActive
            ? 'border-cyan-400 bg-cyan-400/5 glow-cyan-border'
            : previewURL
            ? 'border-slate-700 hover:border-slate-600'
            : 'border-dashed border-slate-600 hover:border-cyan-400/50 hover:bg-cyan-400/[0.02]',
          isProcessing ? 'pointer-events-none' : '',
        ].join(' ')}
      >
        <input {...getInputProps()} />

        {/* Preview image */}
        {previewURL && !isProcessing && (
          <img
            src={previewURL}
            alt={`${label} preview`}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="absolute inset-0 bg-obsidian-800/90 flex flex-col items-center justify-center gap-3">
            <ScanAnimation />
            <span className="font-mono text-xs text-cyan-400 tracking-wider">
              DETECTING CARD…
            </span>
          </div>
        )}

        {/* Empty state */}
        {!previewURL && !isProcessing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
            <div className="text-3xl opacity-30">{icon}</div>
            <div className="text-center">
              <p className="font-display text-xs text-slate-400 font-medium">
                {isDragActive ? 'Release to drop' : 'Drop image here'}
              </p>
              <p className="font-mono text-[10px] text-slate-600 mt-1">
                or click to browse
              </p>
            </div>
          </div>
        )}

        {/* Success badge */}
        {previewURL && !isProcessing && (
          <div className="absolute top-2 right-2 bg-emerald-500/90 text-white text-[10px] font-mono px-2 py-0.5 rounded-full">
            ✓ DETECTED
          </div>
        )}

        {/* Corner decoration */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400/30 rounded-tl" />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400/30 rounded-tr" />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400/30 rounded-bl" />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400/30 rounded-br" />
      </div>

      {/* Card dimensions hint */}
      <p className="font-mono text-[10px] text-slate-600 text-center">
        ISO/IEC 7810 ID-1 · 85.6 × 54mm
      </p>
    </div>
  );
}

// ─── Sub-component: Scanning animation ───────────────────────────────────────
function ScanAnimation() {
  return (
    <div className="w-12 h-12 relative">
      <svg viewBox="0 0 48 48" className="w-full h-full">
        <rect x="2" y="2" width="44" height="30" rx="2" fill="none" stroke="rgba(34,211,238,0.3)" strokeWidth="1.5" />
        <line x1="2" y1="17" x2="46" y2="17" stroke="rgba(34,211,238,0.8)" strokeWidth="1.5"
          className="animate-[scan_1.5s_ease-in-out_infinite]"
          style={{ transformOrigin: '24px 2px', animation: 'scan 1.5s ease-in-out infinite' }}
        />
        <rect x="2" y="36" width="14" height="10" rx="1" fill="rgba(34,211,238,0.2)" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
        <rect x="18" y="36" width="14" height="10" rx="1" fill="rgba(34,211,238,0.2)" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
        <rect x="34" y="36" width="12" height="10" rx="1" fill="rgba(34,211,238,0.2)" stroke="rgba(34,211,238,0.4)" strokeWidth="1" />
      </svg>
    </div>
  );
}

// ─── Sub-component: Merged preview panel ─────────────────────────────────────
function MergedPreview({ previewURL, canvasRef, onExportJPG, onExportPDF, isMerging }) {
  if (isMerging) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-400/10 border-b-cyan-400/60 animate-spin animate-reverse" />
          </div>
        </div>
        <p className="font-mono text-xs text-cyan-400 tracking-widest">COMPOSITING…</p>
      </div>
    );
  }

  if (!previewURL) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <div className="text-4xl opacity-10">⬜</div>
        <p className="font-mono text-xs text-slate-600">Merged output will appear here</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-[fadeIn_0.4s_ease-out]">
      {/* Preview */}
      <div className="relative rounded overflow-hidden border border-slate-700 corner-accent">
        <img
          src={previewURL}
          alt="Merged ID card document"
          className="w-full h-auto"
        />
        <div className="absolute top-3 left-3 font-mono text-[10px] text-slate-400 bg-obsidian-900/80 px-2 py-1 rounded">
          A4 · 300 DPI preview
        </div>
      </div>

      {/* Export buttons */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onExportJPG}
          className="group flex items-center justify-center gap-2 px-4 py-3 rounded border border-slate-700 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all duration-200"
        >
          <span className="text-lg">🖼️</span>
          <div className="text-left">
            <div className="font-display text-xs font-medium text-slate-300 group-hover:text-cyan-400 transition-colors">
              Export JPG
            </div>
            <div className="font-mono text-[10px] text-slate-600">high quality · 95%</div>
          </div>
        </button>

        <button
          onClick={onExportPDF}
          className="group flex items-center justify-center gap-2 px-4 py-3 rounded border border-slate-700 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all duration-200"
        >
          <span className="text-lg">📄</span>
          <div className="text-left">
            <div className="font-display text-xs font-medium text-slate-300 group-hover:text-cyan-400 transition-colors">
              Export PDF
            </div>
            <div className="font-mono text-[10px] text-slate-600">A4 · print-ready</div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Main IDCardMerge component ───────────────────────────────────────────────
export default function IDCardMerge() {
  const { isReady, isLoading, error: workerError, processImage, imageToImageData } = useOpenCVWorker();

  const [frontState, setFrontState] = useState({ imageData: null, previewURL: null, processing: false });
  const [backState, setBackState] = useState({ imageData: null, previewURL: null, processing: false });
  const [mergedPreviewURL, setMergedPreviewURL] = useState(null);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState(null);

  const mergedCanvasRef = useRef(null);

  // ─── Process dropped image through worker ─────────────────────────────────
  const processSide = useCallback(async (file, side) => {
    const setter = side === 'front' ? setFrontState : setBackState;

    setter(prev => ({ ...prev, processing: true }));

    try {
      const dataURL = await fileToDataURL(file);
      const imgData = await imageToImageData(dataURL, 2400);

      const result = await processImage('CROP_ID_CARD', {
        imageData: imgData,
        width: imgData.width,
        height: imgData.height,
        side,
      });

      const { payload } = result;
      const previewURL = imageDataToPreviewURL(payload.imageData, 800);

      setter({
        imageData: payload.imageData,
        previewURL,
        processing: false,
        foundCard: payload.foundCard,
      });
    } catch (err) {
      console.error(`Failed to process ${side}:`, err);
      setter(prev => ({ ...prev, processing: false }));
    }
  }, [imageToImageData, processImage]);

  const handleFrontDrop = useCallback((files) => {
    if (files[0]) processSide(files[0], 'front');
  }, [processSide]);

  const handleBackDrop = useCallback((files) => {
    if (files[0]) processSide(files[0], 'back');
  }, [processSide]);

  // ─── Merge both sides whenever both are ready ─────────────────────────────
  useEffect(() => {
    if (!frontState.imageData || !backState.imageData) {
      setMergedPreviewURL(null);
      mergedCanvasRef.current = null;
      return;
    }

    let cancelled = false;

    const doMerge = async () => {
      setIsMerging(true);
      setMergeError(null);

      try {
        await new Promise(r => setTimeout(r, 50)); // let UI breathe

        const canvas = mergeIDCardsToCanvas(
          frontState.imageData,
          backState.imageData,
          {
            outputWidth: 2480,
            bgColor: '#F8F9FA',
            paddingRatio: 0.07,
            gapRatio: 0.05,
            labelCards: true,
          }
        );

        if (cancelled) return;

        mergedCanvasRef.current = canvas;

        // Generate low-res preview
        const previewCanvas = document.createElement('canvas');
        const scale = 800 / canvas.width;
        previewCanvas.width = 800;
        previewCanvas.height = Math.round(canvas.height * scale);
        previewCanvas.getContext('2d').drawImage(canvas, 0, 0, previewCanvas.width, previewCanvas.height);

        setMergedPreviewURL(previewCanvas.toDataURL('image/jpeg', 0.85));
      } catch (err) {
        if (!cancelled) setMergeError(err.message);
      } finally {
        if (!cancelled) setIsMerging(false);
      }
    };

    doMerge();
    return () => { cancelled = true; };
  }, [frontState.imageData, backState.imageData]);

  // ─── Export handlers ──────────────────────────────────────────────────────
  const handleExportJPG = useCallback(() => {
    if (mergedCanvasRef.current) {
      exportCanvasAsJPG(mergedCanvasRef.current, 'doculens-id-card.jpg');
    }
  }, []);

  const handleExportPDF = useCallback(async () => {
    if (mergedCanvasRef.current) {
      await exportCanvasAsPDF(mergedCanvasRef.current, 'doculens-id-card.pdf');
    }
  }, []);

  const bothReady = frontState.imageData && backState.imageData;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8 animate-[slideUp_0.4s_ease-out]">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-200 tracking-tight">
            ID Card Mode
          </h2>
          <p className="font-mono text-xs text-slate-500 mt-1">
            Auto-detect · Perspective correct · A4 merge
          </p>
        </div>

        {/* OpenCV status indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800 bg-obsidian-800">
          <div className={[
            'w-1.5 h-1.5 rounded-full',
            isLoading ? 'bg-amber-400 animate-pulse' :
            isReady ? 'bg-emerald-400' :
            'bg-red-400'
          ].join(' ')} />
          <span className="font-mono text-[10px] text-slate-500">
            {isLoading ? 'LOADING CV…' : isReady ? 'CV READY' : 'CV ERROR'}
          </span>
        </div>
      </div>

      {/* Worker error */}
      {workerError && (
        <div className="rounded border border-red-500/30 bg-red-500/5 p-4">
          <p className="font-mono text-xs text-red-400">⚠ Worker error: {workerError}</p>
        </div>
      )}

      {/* OpenCV loading state */}
      {isLoading && (
        <div className="rounded border border-amber-500/20 bg-amber-500/5 p-4 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin flex-shrink-0" />
          <div>
            <p className="font-mono text-xs text-amber-400">Initializing OpenCV.js WASM engine…</p>
            <p className="font-mono text-[10px] text-slate-600 mt-0.5">
              First load may take 5–10s. All processing stays in your browser.
            </p>
          </div>
        </div>
      )}

      {/* Main content: 2-column layout on wide screens */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto_1fr] gap-6 items-start">

        {/* Left column: Input dropzones */}
        <div className="flex flex-col gap-6">
          <div className="rounded border border-slate-800 bg-obsidian-800/50 p-5 flex flex-col gap-5">
            {/* Section title */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">Input</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <IDDropzone
              side="front"
              label="Front Side"
              icon="🪪"
              imageData={frontState.imageData}
              previewURL={frontState.previewURL}
              isProcessing={frontState.processing || (isLoading && !frontState.previewURL)}
              onDrop={handleFrontDrop}
              onClear={() => setFrontState({ imageData: null, previewURL: null, processing: false })}
            />

            {/* Divider with merge indicator */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <div className={[
                'flex items-center gap-1.5 px-3 py-1 rounded-full border font-mono text-[10px] transition-all duration-300',
                bothReady
                  ? 'border-cyan-400/40 bg-cyan-400/5 text-cyan-400'
                  : 'border-slate-800 text-slate-600',
              ].join(' ')}>
                <span>{bothReady ? '⚡' : '+'}</span>
                <span>{bothReady ? 'merging' : 'combine'}</span>
              </div>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            <IDDropzone
              side="back"
              label="Back Side"
              icon="🔄"
              imageData={backState.imageData}
              previewURL={backState.previewURL}
              isProcessing={backState.processing || (isLoading && !backState.previewURL)}
              onDrop={handleBackDrop}
              onClear={() => setBackState({ imageData: null, previewURL: null, processing: false })}
            />
          </div>

          {/* Processing stats */}
          {(frontState.imageData || backState.imageData) && (
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: 'Front',
                  data: frontState.imageData,
                  found: frontState.foundCard,
                },
                {
                  label: 'Back',
                  data: backState.imageData,
                  found: backState.foundCard,
                },
              ].map(({ label, data, found }) => (
                <div key={label} className={[
                  'rounded border p-3 text-center transition-all duration-200',
                  data ? 'border-slate-700 bg-obsidian-800' : 'border-slate-800 bg-obsidian-900',
                ].join(' ')}>
                  <div className={`font-mono text-[10px] mb-1 ${data ? 'text-emerald-400' : 'text-slate-600'}`}>
                    {data ? '✓ LOADED' : '○ PENDING'}
                  </div>
                  <div className="font-display text-xs font-medium text-slate-400">{label}</div>
                  {data && (
                    <div className="font-mono text-[10px] text-slate-600 mt-1">
                      {data.width} × {data.height}px
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center: Arrow */}
        <div className="hidden xl:flex flex-col items-center justify-start pt-24">
          <div className="flex flex-col items-center gap-1">
            <div className={[
              'transition-all duration-500',
              bothReady ? 'text-cyan-400' : 'text-slate-700',
            ].join(' ')}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M6 16H26M26 16L18 8M26 16L18 24"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {bothReady && (
              <span className="font-mono text-[9px] text-cyan-400/60 tracking-widest">MERGE</span>
            )}
          </div>
        </div>

        {/* Right column: Merged output */}
        <div className="rounded border border-slate-800 bg-obsidian-800/50 p-5 flex flex-col gap-4">
          {/* Section title */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">Output</span>
            <div className="flex-1 h-px bg-slate-800" />
            {mergedPreviewURL && (
              <span className="font-mono text-[10px] text-emerald-400">A4 READY</span>
            )}
          </div>

          {mergeError && (
            <div className="rounded border border-red-500/30 bg-red-500/5 p-3">
              <p className="font-mono text-xs text-red-400">Merge failed: {mergeError}</p>
            </div>
          )}

          <MergedPreview
            previewURL={mergedPreviewURL}
            canvasRef={mergedCanvasRef}
            onExportJPG={handleExportJPG}
            onExportPDF={handleExportPDF}
            isMerging={isMerging}
          />
        </div>
      </div>

      {/* Privacy note */}
      <div className="flex items-center gap-2 px-4 py-3 rounded border border-slate-800 bg-obsidian-900/50">
        <span className="text-sm">🔒</span>
        <p className="font-mono text-[10px] text-slate-600">
          All processing happens locally in your browser via OpenCV.js WASM.
          Your images never leave your device.
        </p>
      </div>
    </div>
  );
}
