'use client';
/**
 * DocuLens — Document Scanner Module
 * ─────────────────────────────────────────────────────────────────────────────
 * Batch upload → Auto-crop (OpenCV edge detection + perspective warp) →
 * Filter selection (Original / B&W / Magic Color) → PDF export
 */

import { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { useOpenCVWorker } from '../hooks/useOpenCVWorker';
import { fileToDataURL, imageDataToPreviewURL, exportCanvasAsPDF } from '../lib/canvasUtils';

const FILTERS = [
  {
    id: 'original',
    label: 'Original',
    icon: '🖼',
    description: 'Cropped, no color change',
  },
  {
    id: 'bw',
    label: 'B&W Clean',
    icon: '◐',
    description: 'Adaptive threshold, shadow-free',
  },
  {
    id: 'magic',
    label: 'Magic Color',
    icon: '✦',
    description: 'CLAHE + saturation boost',
  },
];

// ─── Single document card ─────────────────────────────────────────────────────
function DocumentCard({ doc, activeFilter, onFilterChange, onRemove }) {
  const currentPreview = doc.filterPreviews?.[activeFilter] || doc.croppedPreviewURL || doc.originalPreviewURL;
  const isProcessingFilter = doc.processingFilter === activeFilter;

  return (
    <div className="group relative flex flex-col rounded border border-slate-800 bg-obsidian-800/60 overflow-hidden transition-all duration-200 hover:border-slate-700 animate-[slideUp_0.3s_ease-out]">
      {/* Image preview */}
      <div className="relative aspect-[3/4] bg-obsidian-900 overflow-hidden">
        {currentPreview ? (
          <img
            src={currentPreview}
            alt={doc.filename}
            className="w-full h-full object-cover transition-opacity duration-300"
          />
        ) : (
          <div className="absolute inset-0 shimmer" />
        )}

        {/* Processing overlay */}
        {(doc.status === 'cropping' || isProcessingFilter) && (
          <div className="absolute inset-0 bg-obsidian-900/80 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
            <span className="font-mono text-[10px] text-cyan-400 tracking-wider">
              {doc.status === 'cropping' ? 'SCANNING…' : 'FILTERING…'}
            </span>
          </div>
        )}

        {/* Status badge */}
        {doc.status === 'done' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-emerald-500/80 text-white font-mono text-[9px] px-2 py-0.5 rounded-full">
            <span>✓</span>
            <span>{doc.foundDocument ? 'DOC FOUND' : 'CROPPED'}</span>
          </div>
        )}

        {/* Remove button */}
        <button
          onClick={() => onRemove(doc.id)}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-obsidian-900/90 border border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-400/50 transition-all duration-200 text-xs flex items-center justify-center"
        >
          ×
        </button>
      </div>

      {/* Filename */}
      <div className="px-3 pt-2 pb-1">
        <p className="font-mono text-[10px] text-slate-500 truncate" title={doc.filename}>
          {doc.filename}
        </p>
        {doc.dimensions && (
          <p className="font-mono text-[9px] text-slate-700">
            {doc.dimensions.width} × {doc.dimensions.height}
          </p>
        )}
      </div>

      {/* Filter selector */}
      {doc.status === 'done' && (
        <div className="px-3 pb-3 flex gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => onFilterChange(doc.id, f.id)}
              disabled={isProcessingFilter}
              title={f.description}
              className={[
                'flex-1 py-1 rounded text-center font-mono text-[9px] transition-all duration-150 border',
                activeFilter === f.id
                  ? 'bg-cyan-400/10 border-cyan-400/50 text-cyan-400'
                  : 'border-slate-800 text-slate-600 hover:border-slate-700 hover:text-slate-500',
              ].join(' ')}
            >
              {f.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main DocumentScanner ─────────────────────────────────────────────────────
export default function DocumentScanner() {
  const { isReady, isLoading, processImage, imageToImageData } = useOpenCVWorker();

  const [documents, setDocuments] = useState([]);
  const [activeFilter, setActiveFilter] = useState('original');
  const [isExporting, setIsExporting] = useState(false);

  // Store full-res ImageData per doc per filter
  const fullResStore = useRef({}); // { docId: { original: ImageData, bw: ImageData, magic: ImageData } }

  // ─── Process a single file ──────────────────────────────────────────────
  const processFile = useCallback(async (file, docId) => {
    const setDoc = (updater) => {
      setDocuments(prev => prev.map(d => d.id === docId ? updater(d) : d));
    };

    try {
      const dataURL = await fileToDataURL(file);
      const originalPreviewURL = await generateThumbnail(dataURL);

      setDoc(d => ({ ...d, originalPreviewURL, status: 'cropping' }));

      // Full-res processing
      const imgData = await imageToImageData(dataURL, 2400);

      const cropResult = await processImage('AUTO_CROP', {
        imageData: imgData,
        width: imgData.width,
        height: imgData.height,
      });

      const { payload: cropPayload } = cropResult;

      // Store full-res original
      if (!fullResStore.current[docId]) fullResStore.current[docId] = {};
      fullResStore.current[docId].original = cropPayload.imageData;

      const croppedPreviewURL = imageDataToPreviewURL(cropPayload.imageData, 600);

      setDoc(d => ({
        ...d,
        croppedPreviewURL,
        filterPreviews: { original: croppedPreviewURL },
        status: 'done',
        foundDocument: cropPayload.foundDocument,
        dimensions: { width: cropPayload.width, height: cropPayload.height },
      }));
    } catch (err) {
      console.error('Processing failed:', err);
      setDoc(d => ({ ...d, status: 'error', error: err.message }));
    }
  }, [imageToImageData, processImage]);

  // ─── Apply filter to a doc ──────────────────────────────────────────────
  const applyFilter = useCallback(async (docId, filterId) => {
    if (filterId === 'original') {
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, activeFilter: 'original' } : d));
      return;
    }

    const stored = fullResStore.current[docId];
    if (!stored?.original) return;

    // Check cache
    if (stored[filterId]) {
      const previewURL = imageDataToPreviewURL(stored[filterId], 600);
      setDocuments(prev => prev.map(d =>
        d.id === docId
          ? { ...d, filterPreviews: { ...d.filterPreviews, [filterId]: previewURL } }
          : d
      ));
      return;
    }

    setDocuments(prev => prev.map(d => d.id === docId ? { ...d, processingFilter: filterId } : d));

    try {
      const result = await processImage('APPLY_FILTER', {
        imageData: stored.original,
        width: stored.original.width,
        height: stored.original.height,
        filter: filterId,
      });

      const { payload } = result;
      stored[filterId] = payload.imageData; // cache it

      const previewURL = imageDataToPreviewURL(payload.imageData, 600);

      setDocuments(prev => prev.map(d =>
        d.id === docId
          ? {
              ...d,
              processingFilter: null,
              filterPreviews: { ...d.filterPreviews, [filterId]: previewURL },
            }
          : d
      ));
    } catch (err) {
      console.error('Filter failed:', err);
      setDocuments(prev => prev.map(d => d.id === docId ? { ...d, processingFilter: null } : d));
    }
  }, [processImage]);

  // ─── Global filter change (applies to all) ──────────────────────────────
  const handleGlobalFilterChange = useCallback(async (filterId) => {
    setActiveFilter(filterId);
    const doneDocs = documents.filter(d => d.status === 'done');
    for (const doc of doneDocs) {
      await applyFilter(doc.id, filterId);
    }
  }, [documents, applyFilter]);

  // ─── Dropzone handler ───────────────────────────────────────────────────
  const onDrop = useCallback(async (acceptedFiles) => {
    const newDocs = acceptedFiles.map(file => ({
      id: `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      filename: file.name,
      file,
      status: 'pending',
      originalPreviewURL: null,
      croppedPreviewURL: null,
      filterPreviews: {},
    }));

    setDocuments(prev => [...prev, ...newDocs]);

    // Process sequentially to avoid overwhelming the worker
    for (const doc of newDocs) {
      await processFile(doc.file, doc.id);
    }
  }, [processFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true,
    disabled: isLoading,
  });

  // ─── Export all as PDF ──────────────────────────────────────────────────
  const handleExportPDF = useCallback(async () => {
    const doneDocs = documents.filter(d => d.status === 'done');
    if (!doneDocs.length) return;

    setIsExporting(true);

    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      for (let i = 0; i < doneDocs.length; i++) {
        const doc = doneDocs[i];
        const stored = fullResStore.current[doc.id];
        const imageData = stored?.[activeFilter] || stored?.original;

        if (!imageData) continue;

        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext('2d').putImageData(imageData, 0, 0);

        const imgDataURL = canvas.toDataURL('image/jpeg', 0.92);
        const pageW = 210, pageH = 297;

        // Fit image to page
        const imgAspect = imageData.width / imageData.height;
        const pageAspect = pageW / pageH;

        let drawW = pageW - 20, drawH, drawX = 10, drawY = 10;
        if (imgAspect > pageAspect) {
          drawW = pageW - 20;
          drawH = drawW / imgAspect;
          drawY = (pageH - drawH) / 2;
        } else {
          drawH = pageH - 20;
          drawW = drawH * imgAspect;
          drawX = (pageW - drawW) / 2;
        }

        if (i > 0) pdf.addPage();
        pdf.addImage(imgDataURL, 'JPEG', drawX, drawY, drawW, drawH);
      }

      pdf.save('doculens-scan.pdf');
    } finally {
      setIsExporting(false);
    }
  }, [documents, activeFilter]);

  const doneCount = documents.filter(d => d.status === 'done').length;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 animate-[slideUp_0.4s_ease-out]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-200 tracking-tight">
            Document Scanner
          </h2>
          <p className="font-mono text-xs text-slate-500 mt-1">
            Batch upload · Edge detection · Perspective correction
          </p>
        </div>

        {/* Global filter selector */}
        {doneCount > 0 && (
          <div className="flex items-center gap-1 p-1 rounded border border-slate-800 bg-obsidian-900">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => handleGlobalFilterChange(f.id)}
                title={f.description}
                className={[
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-display font-medium transition-all duration-150',
                  activeFilter === f.id
                    ? 'bg-cyan-400/10 text-cyan-400 border border-cyan-400/30'
                    : 'text-slate-500 hover:text-slate-400',
                ].join(' ')}
              >
                <span>{f.icon}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={[
          'relative overflow-hidden rounded border-2 border-dashed transition-all duration-300 cursor-pointer',
          isDragActive
            ? 'border-cyan-400 bg-cyan-400/5'
            : isLoading
            ? 'border-slate-800 cursor-not-allowed opacity-50'
            : 'border-slate-700 hover:border-cyan-400/40 hover:bg-obsidian-800/30',
        ].join(' ')}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center py-12 px-6 gap-4 text-center">
          <div className={`text-4xl transition-transform duration-300 ${isDragActive ? 'scale-125' : ''}`}>
            {isDragActive ? '📂' : '📄'}
          </div>
          <div>
            <p className="font-display text-sm font-medium text-slate-300">
              {isDragActive ? 'Release to scan' : 'Drop documents here to scan'}
            </p>
            <p className="font-mono text-xs text-slate-600 mt-1">
              JPG · PNG · WEBP · Multiple files supported
            </p>
          </div>
          {!isDragActive && (
            <div className="flex items-center gap-4 font-mono text-[10px] text-slate-600">
              <span>Auto edge detection</span>
              <span>·</span>
              <span>Perspective warp</span>
              <span>·</span>
              <span>Batch processing</span>
            </div>
          )}
        </div>

        {/* Scan line animation when dragging */}
        {isDragActive && (
          <div
            className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent scan-line-anim pointer-events-none"
            style={{ top: 0 }}
          />
        )}
      </div>

      {/* Document grid */}
      {documents.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs text-slate-500">
              {doneCount}/{documents.length} processed
              {activeFilter !== 'original' && (
                <span className="ml-2 text-cyan-400">
                  · {FILTERS.find(f => f.id === activeFilter)?.label} filter
                </span>
              )}
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setDocuments([]);
                  fullResStore.current = {};
                }}
                className="font-mono text-[10px] text-slate-600 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>

              {doneCount > 0 && (
                <button
                  onClick={handleExportPDF}
                  disabled={isExporting}
                  className="flex items-center gap-2 px-4 py-2 rounded border border-cyan-400/30 bg-cyan-400/5 text-cyan-400 hover:bg-cyan-400/10 hover:border-cyan-400/50 transition-all duration-200 font-display text-xs font-medium disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <div className="w-3 h-3 rounded-full border border-cyan-400/30 border-t-cyan-400 animate-spin" />
                      Exporting…
                    </>
                  ) : (
                    <>
                      <span>📄</span>
                      Export {doneCount > 1 ? `${doneCount} pages` : 'PDF'}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {documents.map(doc => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                activeFilter={activeFilter}
                onFilterChange={applyFilter}
                onRemove={(id) => {
                  setDocuments(prev => prev.filter(d => d.id !== id));
                  delete fullResStore.current[id];
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Local thumbnail helper
async function generateThumbnail(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}
