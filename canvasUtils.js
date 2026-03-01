/**
 * DocuLens — Canvas & Export Utilities
 */

/**
 * Draw ImageData onto a new canvas and return it.
 */
export function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Load a File/Blob as a data URL.
 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Generate a low-res thumbnail (≤ 400px) from a data URL for UI previews.
 * Returns a canvas element.
 */
export async function generateThumbnail(dataURL, maxSize = 400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = reject;
    img.src = dataURL;
  });
}

/**
 * Merge front and back ID card ImageDatas onto an A4-proportioned canvas.
 * A4 ratio: 210 × 297mm → approx 1:1.414
 *
 * Layout:
 *   ┌─────────────────────┐
 *   │      padding        │
 *   │  ┌───────────────┐  │
 *   │  │   FRONT SIDE  │  │
 *   │  └───────────────┘  │
 *   │      gap            │
 *   │  ┌───────────────┐  │
 *   │  │   BACK SIDE   │  │
 *   │  └───────────────┘  │
 *   │      padding        │
 *   └─────────────────────┘
 *
 * @param {ImageData} frontData
 * @param {ImageData} backData
 * @param {object} options
 * @returns {HTMLCanvasElement}
 */
export function mergeIDCardsToCanvas(frontData, backData, options = {}) {
  const {
    outputWidth = 2480,   // A4 @ 300 DPI
    bgColor = '#FFFFFF',
    paddingRatio = 0.06,  // 6% padding on each side
    gapRatio = 0.04,      // 4% gap between cards
    labelCards = true,
    labelFont = '36px "Space Grotesk", monospace',
    labelColor = '#64748B',
  } = options;

  const A4_RATIO = 297 / 210; // height / width ≈ 1.4142
  const outputHeight = Math.round(outputWidth * A4_RATIO);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, outputWidth, outputHeight);

  // Subtle grid pattern on background
  ctx.strokeStyle = 'rgba(0,0,0,0.04)';
  ctx.lineWidth = 1;
  const gridSize = 60;
  for (let x = 0; x < outputWidth; x += gridSize) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, outputHeight); ctx.stroke();
  }
  for (let y = 0; y < outputHeight; y += gridSize) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(outputWidth, y); ctx.stroke();
  }

  const padding = Math.round(outputWidth * paddingRatio);
  const gap = Math.round(outputHeight * gapRatio);
  const labelHeight = labelCards ? 50 : 0;

  const cardWidth = outputWidth - padding * 2;
  // Each card occupies half the usable vertical space minus gap and labels
  const totalContentH = outputHeight - padding * 2 - gap;
  const cardHeight = Math.round((totalContentH - labelHeight * 2) / 2);

  // ID card target dimensions (forced aspect ratio 85.6:54)
  const ID_ASPECT = 85.6 / 54;
  const scaledCardH = Math.round(cardWidth / ID_ASPECT);
  const finalCardH = Math.min(cardHeight, scaledCardH);
  const finalCardW = Math.round(finalCardH * ID_ASPECT);
  const cardX = Math.round((outputWidth - finalCardW) / 2);

  // Helper to draw a card section
  const drawCard = (imageData, yOffset, label) => {
    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cardX, yOffset, finalCardW, finalCardH);
    ctx.restore();

    // Draw image
    const tempCanvas = imageDataToCanvas(imageData);
    ctx.drawImage(tempCanvas, cardX, yOffset, finalCardW, finalCardH);

    // Rounded border overlay (decorative)
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cardX, yOffset, finalCardW, finalCardH);

    // Label
    if (labelCards) {
      ctx.font = labelFont;
      ctx.fillStyle = labelColor;
      ctx.textAlign = 'center';
      ctx.fillText(label, outputWidth / 2, yOffset - 12);
    }
  };

  const frontY = padding + labelHeight;
  const backY = frontY + finalCardH + gap + labelHeight;

  drawCard(frontData, frontY, 'FRONT');
  drawCard(backData, backY, 'BACK');

  return canvas;
}

/**
 * Export a canvas as a downloadable JPG file.
 */
export function exportCanvasAsJPG(canvas, filename = 'doculens-id-card.jpg', quality = 0.95) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/jpeg', quality);
  link.click();
}

/**
 * Export a canvas as a PDF using jsPDF.
 * The canvas is placed on an A4 page.
 */
export async function exportCanvasAsPDF(canvas, filename = 'doculens-id-card.pdf') {
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageW = 210; // mm
  const pageH = 297; // mm

  const imgData = canvas.toDataURL('image/jpeg', 0.92);

  // Fill A4 page
  pdf.addImage(imgData, 'JPEG', 0, 0, pageW, pageH);
  pdf.save(filename);
}

/**
 * Create a low-res preview URL from ImageData.
 */
export function imageDataToPreviewURL(imageData, maxSize = 600) {
  const scale = Math.min(1, maxSize / Math.max(imageData.width, imageData.height));
  const w = Math.round(imageData.width * scale);
  const h = Math.round(imageData.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  const tmpCanvas = imageDataToCanvas(imageData);
  ctx.drawImage(tmpCanvas, 0, 0, w, h);

  return canvas.toDataURL('image/jpeg', 0.8);
}

function imageDataToCanvas(imageData) {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext('2d').putImageData(imageData, 0, 0);
  return canvas;
}
