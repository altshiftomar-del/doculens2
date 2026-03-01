/**
 * DocuLens — OpenCV.js Web Worker
 * ─────────────────────────────────────────────────────────────────────────────
 * ALL heavy image processing runs here — completely off the main thread.
 * 
 * Supported operations (via postMessage):
 *   { type: 'LOAD_OPENCV' }
 *   { type: 'AUTO_CROP', payload: { imageData, width, height } }
 *   { type: 'APPLY_FILTER', payload: { imageData, width, height, filter } }
 *   { type: 'CROP_ID_CARD', payload: { imageData, width, height, side } }
 * 
 * Memory contract: Every cv.Mat MUST be deleted before returning.
 */

let cv = null;
let opencvReady = false;

// ─── Load OpenCV ──────────────────────────────────────────────────────────────
self.importScripts('https://docs.opencv.org/4.9.0/opencv.js');

// OpenCV.js calls this when the WASM module is ready
self.Module = {
  onRuntimeInitialized() {
    cv = self.cv;
    opencvReady = true;
    self.postMessage({ type: 'OPENCV_READY' });
  },
};

// ─── Message Router ───────────────────────────────────────────────────────────
self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  if (!opencvReady && type !== 'LOAD_OPENCV') {
    self.postMessage({ type: 'ERROR', id, error: 'OpenCV not ready yet.' });
    return;
  }

  try {
    switch (type) {
      case 'LOAD_OPENCV':
        // Trigger load — response comes via onRuntimeInitialized
        if (opencvReady) self.postMessage({ type: 'OPENCV_READY' });
        break;

      case 'AUTO_CROP':
        handleAutoCrop(payload, id);
        break;

      case 'APPLY_FILTER':
        handleApplyFilter(payload, id);
        break;

      case 'CROP_ID_CARD':
        handleCropIdCard(payload, id);
        break;

      default:
        self.postMessage({ type: 'ERROR', id, error: `Unknown operation: ${type}` });
    }
  } catch (err) {
    self.postMessage({ type: 'ERROR', id, error: err.message || String(err) });
  }
};

// ─── Utility: ImageData → cv.Mat ─────────────────────────────────────────────
function imageDataToMat(imageData, width, height) {
  const mat = new cv.Mat(height, width, cv.CV_8UC4);
  mat.data.set(imageData);
  return mat;
}

// ─── Utility: cv.Mat → ImageData (RGBA) ──────────────────────────────────────
function matToImageData(mat) {
  const rgba = new cv.Mat();
  if (mat.channels() === 1) {
    cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA);
  } else if (mat.channels() === 3) {
    cv.cvtColor(mat, rgba, cv.COLOR_BGR2RGBA);
  } else {
    // Already RGBA/BGRA — convert BGRA→RGBA if needed
    cv.cvtColor(mat, rgba, cv.COLOR_BGRA2RGBA);
  }
  const result = new ImageData(
    new Uint8ClampedArray(rgba.data),
    rgba.cols,
    rgba.rows
  );
  rgba.delete();
  return result;
}

// ─── Utility: Order 4 points clockwise (TL, TR, BR, BL) ─────────────────────
function orderPoints(pts) {
  // pts: array of {x, y}
  const sorted = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const tl = sorted[0];
  const br = sorted[sorted.length - 1];
  const remaining = sorted.slice(1, -1);
  const tr = remaining.sort((a, b) => a.y - b.y)[0];
  const bl = remaining.sort((a, b) => b.y - a.y)[0];
  return [tl, tr, br, bl];
}

// ─── Utility: Euclidean distance ──────────────────────────────────────────────
function dist(a, b) {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

// ─── AUTO CROP: Edge detect → find doc contour → perspective warp ─────────────
function handleAutoCrop({ imageData, width, height }, id) {
  const src = imageDataToMat(imageData, width, height);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  let warped = null;
  let foundQuad = false;

  try {
    // Preprocessing pipeline
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 75, 200);

    // Dilate edges slightly to close gaps
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(edged, edged, kernel);
    kernel.delete();

    cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Find the largest quadrilateral contour
    let bestContour = null;
    let bestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const minArea = width * height * 0.05; // at least 5% of image

      if (area < minArea) continue;

      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows === 4 && area > bestArea) {
        bestArea = area;
        if (bestContour) bestContour.delete();
        bestContour = approx;
      } else {
        approx.delete();
      }
    }

    if (bestContour) {
      foundQuad = true;

      // Extract 4 points
      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });
      }
      bestContour.delete();

      const [tl, tr, br, bl] = orderPoints(pts);

      // Calculate output dimensions
      const widthA = dist(br, bl);
      const widthB = dist(tr, tl);
      const outWidth = Math.round(Math.max(widthA, widthB));

      const heightA = dist(tr, br);
      const heightB = dist(tl, bl);
      const outHeight = Math.round(Math.max(heightA, heightB));

      // Build perspective transform
      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y,
        tr.x, tr.y,
        br.x, br.y,
        bl.x, bl.y,
      ]);

      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0,
        outWidth - 1, 0,
        outWidth - 1, outHeight - 1,
        0, outHeight - 1,
      ]);

      const M = cv.getPerspectiveTransform(srcPts, dstPts);
      warped = new cv.Mat();

      // Convert to BGR for warpPerspective, then back
      const srcBgr = new cv.Mat();
      cv.cvtColor(src, srcBgr, cv.COLOR_RGBA2BGR);
      cv.warpPerspective(srcBgr, warped, M, new cv.Size(outWidth, outHeight));
      srcBgr.delete();

      srcPts.delete();
      dstPts.delete();
      M.delete();
    }

    if (!foundQuad || !warped) {
      // Fallback: return original image
      warped = new cv.Mat();
      cv.cvtColor(src, warped, cv.COLOR_RGBA2BGR);
    }

    const resultImageData = matToImageData(warped);
    warped.delete();

    self.postMessage({
      type: 'AUTO_CROP_RESULT',
      id,
      payload: {
        imageData: resultImageData,
        width: resultImageData.width,
        height: resultImageData.height,
        foundDocument: foundQuad,
      },
    }, [resultImageData.data.buffer]);
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    contours.delete();
    hierarchy.delete();
    if (warped) {
      try { warped.delete(); } catch (_) { /* already deleted */ }
    }
  }
}

// ─── APPLY FILTER ─────────────────────────────────────────────────────────────
function handleApplyFilter({ imageData, width, height, filter }, id) {
  const src = imageDataToMat(imageData, width, height);
  const bgr = new cv.Mat();
  let output = null;
  let resultImageData = null;

  try {
    cv.cvtColor(src, bgr, cv.COLOR_RGBA2BGR);

    switch (filter) {
      case 'original': {
        // Just convert back — no processing
        output = bgr.clone();
        break;
      }

      case 'bw': {
        // Black & White (Clean): Adaptive threshold for perfect document scans
        const gray = new cv.Mat();
        cv.cvtColor(bgr, gray, cv.COLOR_BGR2GRAY);

        output = new cv.Mat();
        cv.adaptiveThreshold(
          gray,
          output,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY,
          21,   // block size — larger = handles bigger shadows
          15    // C constant — higher = whiter background
        );
        gray.delete();
        break;
      }

      case 'magic': {
        // Magic Color: Boost contrast, saturation, reduce shadows
        output = new cv.Mat();

        // Step 1: Convert to LAB and apply CLAHE for contrast
        const lab = new cv.Mat();
        cv.cvtColor(bgr, lab, cv.COLOR_BGR2Lab);

        const labChannels = new cv.MatVector();
        cv.split(lab, labChannels);

        const clahe = new cv.CLAHE(2.5, new cv.Size(8, 8));
        const lChannel = labChannels.get(0);
        clahe.apply(lChannel, lChannel);

        cv.merge(labChannels, lab);
        const enhanced = new cv.Mat();
        cv.cvtColor(lab, enhanced, cv.COLOR_Lab2BGR);

        // Step 2: Boost saturation via HSV
        const hsv = new cv.Mat();
        cv.cvtColor(enhanced, hsv, cv.COLOR_BGR2HSV);

        const hsvChannels = new cv.MatVector();
        cv.split(hsv, hsvChannels);

        // Increase saturation channel (index 1) by 1.3x
        const satChannel = hsvChannels.get(1);
        satChannel.convertTo(satChannel, -1, 1.3, 0);

        cv.merge(hsvChannels, hsv);
        cv.cvtColor(hsv, output, cv.COLOR_HSV2BGR);

        // Cleanup intermediates
        lab.delete();
        labChannels.delete();
        enhanced.delete();
        hsv.delete();
        hsvChannels.delete();
        break;
      }

      default:
        output = bgr.clone();
    }

    resultImageData = matToImageData(output);

    self.postMessage({
      type: 'FILTER_RESULT',
      id,
      payload: {
        imageData: resultImageData,
        width: resultImageData.width,
        height: resultImageData.height,
        filter,
      },
    }, [resultImageData.data.buffer]);
  } finally {
    src.delete();
    bgr.delete();
    if (output) {
      try { output.delete(); } catch (_) { /* already deleted */ }
    }
  }
}

// ─── CROP ID CARD: Auto-detect card region, maintain 85.6 × 54mm (CR80) ratio ─
function handleCropIdCard({ imageData, width, height, side }, id) {
  const ID_ASPECT = 85.6 / 54.0; // standard ID card aspect ratio (landscape)

  const src = imageDataToMat(imageData, width, height);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let warped = null;
  let foundCard = false;

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 50, 150);

    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.dilate(edged, edged, kernel);
    kernel.delete();

    cv.findContours(edged, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestContour = null;
    let bestScore = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      const minArea = width * height * 0.1; // ID must be at least 10% of image

      if (area < minArea) continue;

      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      if (approx.rows === 4) {
        // Score by how close aspect ratio is to ID card
        const rect = cv.boundingRect(approx);
        const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);
        const aspectScore = 1 / (Math.abs(aspectRatio - ID_ASPECT) + 0.01);
        const score = area * aspectScore;

        if (score > bestScore) {
          bestScore = score;
          if (bestContour) bestContour.delete();
          bestContour = approx;
        } else {
          approx.delete();
        }
      } else {
        approx.delete();
      }
    }

    if (bestContour) {
      foundCard = true;

      const pts = [];
      for (let i = 0; i < 4; i++) {
        pts.push({ x: bestContour.data32S[i * 2], y: bestContour.data32S[i * 2 + 1] });
      }
      bestContour.delete();

      const [tl, tr, br, bl] = orderPoints(pts);

      // Force output to exact ID card proportions at 1200px wide
      const OUTPUT_W = 1200;
      const OUTPUT_H = Math.round(OUTPUT_W / ID_ASPECT); // ~757px

      const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
      ]);
      const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0, 0, OUTPUT_W - 1, 0, OUTPUT_W - 1, OUTPUT_H - 1, 0, OUTPUT_H - 1,
      ]);

      const M = cv.getPerspectiveTransform(srcPts, dstPts);
      warped = new cv.Mat();

      const srcBgr = new cv.Mat();
      cv.cvtColor(src, srcBgr, cv.COLOR_RGBA2BGR);
      cv.warpPerspective(srcBgr, warped, M, new cv.Size(OUTPUT_W, OUTPUT_H));
      srcBgr.delete();
      srcPts.delete();
      dstPts.delete();
      M.delete();
    } else {
      // Fallback: crop to center with correct ID aspect
      warped = new cv.Mat();
      const srcBgr = new cv.Mat();
      cv.cvtColor(src, srcBgr, cv.COLOR_RGBA2BGR);

      // Auto-fit letterbox crop
      const srcAspect = width / height;
      let cropX = 0, cropY = 0, cropW = width, cropH = height;

      if (srcAspect > ID_ASPECT) {
        cropW = Math.round(height * ID_ASPECT);
        cropX = Math.round((width - cropW) / 2);
      } else {
        cropH = Math.round(width / ID_ASPECT);
        cropY = Math.round((height - cropH) / 2);
      }

      const roi = srcBgr.roi(new cv.Rect(cropX, cropY, cropW, cropH));
      cv.resize(roi, warped, new cv.Size(1200, Math.round(1200 / ID_ASPECT)));
      srcBgr.delete();
      roi.delete();
    }

    const resultImageData = matToImageData(warped);
    warped.delete();

    self.postMessage({
      type: 'CROP_ID_RESULT',
      id,
      payload: {
        imageData: resultImageData,
        width: resultImageData.width,
        height: resultImageData.height,
        side,
        foundCard,
      },
    }, [resultImageData.data.buffer]);
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edged.delete();
    contours.delete();
    hierarchy.delete();
    if (warped) {
      try { warped.delete(); } catch (_) { /* */ }
    }
  }
}
