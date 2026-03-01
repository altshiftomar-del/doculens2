'use client';
/**
 * useOpenCVWorker
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages a single long-lived Web Worker instance for OpenCV operations.
 * Exposes a Promise-based `processImage` API that auto-assigns message IDs
 * and resolves/rejects based on worker responses.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

export function useOpenCVWorker() {
  const workerRef = useRef(null);
  const pendingRef = useRef({}); // id → { resolve, reject }
  const idCounterRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const worker = new Worker('/opencv-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const { type, id, payload, error: workerError } = e.data;

      if (type === 'OPENCV_READY') {
        setIsReady(true);
        setIsLoading(false);
        return;
      }

      if (type === 'ERROR') {
        setError(workerError);
        if (id !== undefined && pendingRef.current[id]) {
          pendingRef.current[id].reject(new Error(workerError));
          delete pendingRef.current[id];
        }
        return;
      }

      // Route result to awaiting promise
      if (id !== undefined && pendingRef.current[id]) {
        pendingRef.current[id].resolve({ type, payload });
        delete pendingRef.current[id];
      }
    };

    worker.onerror = (e) => {
      const msg = e.message || 'Worker crashed';
      setError(msg);
      setIsLoading(false);
      // Reject all pending
      Object.values(pendingRef.current).forEach(({ reject }) => reject(new Error(msg)));
      pendingRef.current = {};
    };

    // Kick off OpenCV load
    worker.postMessage({ type: 'LOAD_OPENCV' });

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Send a task to the worker and await the result.
   * @param {string} type - Operation type
   * @param {object} payload - Data payload (ImageData etc)
   * @param {Transferable[]} [transfer] - Transferable objects for zero-copy
   */
  const processImage = useCallback((type, payload, transfer = []) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++idCounterRef.current;
      pendingRef.current[id] = { resolve, reject };

      workerRef.current.postMessage({ type, payload, id }, transfer);
    });
  }, []);

  /**
   * Convert an HTMLImageElement or Blob URL to ImageData (runs on main thread)
   */
  const imageToImageData = useCallback(async (src, maxDimension = 2400) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Downscale if needed while preserving aspect
        if (Math.max(width, height) > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(ctx.getImageData(0, 0, width, height));
      };
      img.onerror = reject;
      img.src = src;
    });
  }, []);

  return {
    isReady,
    isLoading,
    error,
    processImage,
    imageToImageData,
  };
}
