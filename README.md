# 🔍 DocuLens

> **Browser-native document scanning** — a privacy-first alternative to CamScanner, running entirely client-side via OpenCV.js WASM.

---

## ✨ Features

### Module 1 — Document Scanner
| Feature | Implementation |
|---|---|
| **Batch upload** | `react-dropzone` multi-file |
| **Auto-crop** | OpenCV Canny → contour detection → 4-point perspective warp |
| **Original filter** | Cropped, no color change |
| **B&W Clean filter** | `adaptiveThreshold` (ADAPTIVE_THRESH_GAUSSIAN_C) — kills shadows |
| **Magic Color filter** | CLAHE on LAB L-channel + HSV saturation boost |
| **PDF export** | `jsPDF` multi-page, one doc per page |

### Module 2 — ID Card Mode
| Feature | Implementation |
|---|---|
| **Dual dropzones** | Separate front/back zones |
| **ID auto-crop** | Contour + aspect-ratio scoring (CR80: 85.6×54mm) |
| **A4 canvas merge** | HTML5 Canvas API — front on top, back below |
| **Export JPG** | High-quality JPEG (95%) direct download |
| **Export PDF** | A4 PDF via `jsPDF` |

---

## 🏗️ Architecture

```
doculens/
├── public/
│   └── opencv-worker.js      ← Web Worker (OpenCV.js WASM runs here)
│
└── src/
    ├── app/
    │   ├── layout.jsx         ← Root layout + fonts
    │   ├── page.jsx           ← Main app shell with module nav
    │   └── globals.css        ← Tailwind + custom design tokens
    │
    ├── components/
    │   ├── DocumentScanner.jsx  ← Module 1: batch scan UI
    │   └── IDCardMerge.jsx      ← Module 2: ID card merge UI
    │
    ├── hooks/
    │   └── useOpenCVWorker.js  ← Worker lifecycle + Promise-based API
    │
    └── lib/
        └── canvasUtils.js      ← Canvas ops, thumbnail gen, PDF export
```

---

## 🔧 Web Worker Architecture

```
Main Thread                      Worker Thread
──────────────────               ──────────────────────────────
useOpenCVWorker hook             opencv-worker.js
  │                                │
  │  postMessage({type, payload,   │
  │  id}, [transfer])  ──────────► │  switch(type) {
  │                                │    case 'AUTO_CROP': ...
  │                                │    case 'APPLY_FILTER': ...
  │  ◄────────────  postMessage()  │    case 'CROP_ID_CARD': ...
  │  resolve Promise               │  }
```

**Key design decisions:**
- **Transferable objects** — `ImageData.buffer` is zero-copy transferred to worker
- **Promise-based API** — each call gets a numeric `id`, matched on response
- **Memory safety** — every `cv.Mat` has explicit `.delete()` in `finally` blocks
- **Lazy filter caching** — filter results stored in `fullResStore` ref, not re-processed

---

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** First load downloads OpenCV.js WASM (~8MB). Subsequent loads use browser cache.

---

## ⚠️ Important: COOP/COEP Headers

OpenCV.js WASM requires `SharedArrayBuffer`, which needs cross-origin isolation headers:

```js
// next.config.js — already configured
headers: [
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
]
```

If deploying to **Vercel**, add these to `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

---

## 🧠 OpenCV.js Pipeline Details

### Auto-Crop (Document Scanner)
```
RGBA → Grayscale → GaussianBlur(5×5) → Canny(75,200) → Dilate
→ findContours → approxPolyDP (ε=2% perimeter) → largest quad
→ orderPoints (TL/TR/BR/BL) → getPerspectiveTransform → warpPerspective
```

### B&W Clean Filter
```
BGR → Grayscale → adaptiveThreshold(GAUSSIAN_C, BINARY, blockSize=21, C=15)
```
The large block size handles uneven lighting; C=15 aggressively whitens backgrounds.

### Magic Color Filter
```
BGR → LAB → split → CLAHE(clipLimit=2.5, tileSize=8×8) on L → merge → LAB→BGR
→ BGR → HSV → split → saturation × 1.3 → merge → HSV→BGR
```

### ID Card Crop
Same contour pipeline as document, but:
- Minimum area = 10% of image (ID cards are smaller)
- Scores contours by `area × (1 / |aspect_ratio - 1.585|)` to prefer CR80 ratio
- Forces output to exactly 1200 × 757px (85.6:54 ratio)

---

## 📦 Dependencies

```json
{
  "next": "14.x",
  "react": "18.x",
  "react-dropzone": "^14",    // drag-and-drop uploads
  "jspdf": "^2.5",            // PDF generation
  "clsx": "^2"                // conditional class names
}
```

OpenCV.js is loaded from the official CDN in the worker:
```
https://docs.opencv.org/4.9.0/opencv.js
```

---

## 🎨 Design System

| Token | Value |
|---|---|
| Primary bg | `#04080F` (deep obsidian) |
| Card bg | `#0D1424` |
| Accent | `#22D3EE` (cyan-400) |
| Text primary | `#CBD5E1` (slate-300) |
| Display font | Space Grotesk |
| Mono font | JetBrains Mono |
| Body font | DM Sans |

---

## 🔒 Privacy Guarantee

- **Zero network requests** for image data
- OpenCV.js WASM runs inside a Web Worker — sandboxed from DOM
- No analytics, no telemetry on image content
- Files are never serialized to disk or localStorage
