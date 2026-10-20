import { Siswa, FaceDescriptorCache } from '../types';

const GRID_SIZE = 40; // 40x40 grid = 1600 pixels (combined with gradient = 3200 features)

/**
 * Extracts a robust facial descriptor combining normalized masked luminance
 * and Sobel gradient magnitude (facial contours: eyes, nose, mouth, jawline).
 * Ignores background walls by applying a soft elliptical face mask.
 */
export function extractFaceDescriptor(
  source: HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | string
): Promise<Float32Array | null> {
  return new Promise((resolve) => {
    try {
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }

      tempCanvas.width = GRID_SIZE;
      tempCanvas.height = GRID_SIZE;

      const processElement = (
        el: CanvasImageSource,
        srcW: number,
        srcH: number
      ): Float32Array => {
        // Crop central face region
        const cropDim = Math.min(srcW, srcH) * 0.72;
        const startX = (srcW - cropDim) / 2;
        const startY = (srcH - cropDim) * 0.45; // slightly above vertical center

        ctx.drawImage(el, startX, startY, cropDim, cropDim, 0, 0, GRID_SIZE, GRID_SIZE);
        const imgData = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

        // 1. Calculate luminance map with elliptical facial weight mask
        const lumMap = new Float32Array(GRID_SIZE * GRID_SIZE);
        const center = GRID_SIZE / 2;
        const radiusX = GRID_SIZE * 0.42;
        const radiusY = GRID_SIZE * 0.48;

        for (let y = 0; y < GRID_SIZE; y++) {
          for (let x = 0; x < GRID_SIZE; x++) {
            const idx = (y * GRID_SIZE + x) * 4;
            const r = imgData[idx];
            const g = imgData[idx + 1];
            const b = imgData[idx + 2];
            // Standard relative luminance (ITU-R BT.601)
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;

            // Elliptical mask factor: 1.0 inside face oval, attenuates toward outer edges
            const dx = (x - center) / radiusX;
            const dy = (y - center) / radiusY;
            const distSq = dx * dx + dy * dy;
            const mask = distSq <= 1.0 ? 1.0 : Math.max(0, 1.0 - (distSq - 1.0) * 1.5);

            lumMap[y * GRID_SIZE + x] = lum * mask;
          }
        }

        // 2. Compute spatial gradients (Sobel-like contours for eyes, nose, mouth lines)
        const gradMap = new Float32Array(GRID_SIZE * GRID_SIZE);
        for (let y = 1; y < GRID_SIZE - 1; y++) {
          for (let x = 1; x < GRID_SIZE - 1; x++) {
            const gx = lumMap[y * GRID_SIZE + (x + 1)] - lumMap[y * GRID_SIZE + (x - 1)];
            const gy = lumMap[(y + 1) * GRID_SIZE + x] - lumMap[(y - 1) * GRID_SIZE + x];
            gradMap[y * GRID_SIZE + x] = Math.sqrt(gx * gx + gy * gy);
          }
        }

        // 3. Combined vector: [luminance features, gradient contour features]
        const totalLen = GRID_SIZE * GRID_SIZE * 2;
        const descriptor = new Float32Array(totalLen);

        let sum = 0;
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
          descriptor[i] = lumMap[i];
          descriptor[GRID_SIZE * GRID_SIZE + i] = gradMap[i] * 1.8; // emphasize edges
          sum += descriptor[i] + descriptor[GRID_SIZE * GRID_SIZE + i];
        }

        // Zero-mean centering
        const mean = sum / totalLen;
        let variance = 0;
        for (let i = 0; i < totalLen; i++) {
          descriptor[i] = descriptor[i] - mean;
          variance += descriptor[i] * descriptor[i];
        }

        // L2 unit-variance normalization
        const stdDev = Math.sqrt(variance) || 1;
        for (let i = 0; i < totalLen; i++) {
          descriptor[i] /= stdDev;
        }

        return descriptor;
      };

      if (source instanceof HTMLVideoElement) {
        if (!source.videoWidth || !source.videoHeight) {
          resolve(null);
          return;
        }
        resolve(processElement(source, source.videoWidth, source.videoHeight));
      } else if (source instanceof HTMLCanvasElement) {
        resolve(processElement(source, source.width, source.height));
      } else if (source instanceof HTMLImageElement) {
        if (source.complete && source.naturalWidth) {
          resolve(processElement(source, source.naturalWidth, source.naturalHeight));
        } else {
          source.onload = () => resolve(processElement(source, source.naturalWidth, source.naturalHeight));
          source.onerror = () => resolve(null);
        }
      } else if (typeof source === 'string' && source.startsWith('data:image')) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(processElement(img, img.naturalWidth || 200, img.naturalHeight || 200));
        img.onerror = () => resolve(null);
        img.src = source;
      } else {
        resolve(null);
      }
    } catch (e) {
      console.warn('Face descriptor extraction error:', e);
      resolve(null);
    }
  });
}

/**
 * Creates a horizontally mirrored version of the dual 2D descriptor vector.
 */
export function mirrorDescriptor(desc: Float32Array): Float32Array {
  const totalLen = desc.length;
  const halfLen = GRID_SIZE * GRID_SIZE;
  const mirrored = new Float32Array(totalLen);

  // Mirror luminance block
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const origIdx = y * GRID_SIZE + x;
      const mirrorIdx = y * GRID_SIZE + (GRID_SIZE - 1 - x);
      mirrored[mirrorIdx] = desc[origIdx];
      // Mirror gradient block
      mirrored[halfLen + mirrorIdx] = desc[halfLen + origIdx];
    }
  }

  return mirrored;
}

/**
 * Computes cosine dot product similarity between two unit vectors.
 */
function computeCosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Compares live face descriptor strictly with the student's saved photo descriptor,
 * checking BOTH normal and horizontally mirrored representations for orientation invariance.
 */
export function compareFaceWithCachedStudent(
  liveDesc: Float32Array,
  cached: FaceDescriptorCache
): number {
  const normalDot = computeCosineSimilarity(liveDesc, cached.descriptor);
  const mirroredDot = computeCosineSimilarity(liveDesc, cached.descriptorMirrored);

  // Take the highest match between normal and flipped view
  const bestDot = Math.max(normalDot, mirroredDot);

  // Strictly calibrate against the saved face photo:
  // dot < 0.25: completely different person / background (0 - 20%)
  // dot 0.40 - 0.55: low to partial resemblance (30 - 55%)
  // dot >= 0.62: strong facial feature match with saved photo (70%+)
  // dot >= 0.75: very high match with saved photo (88%+)
  const normalizedScore = ((bestDot - 0.22) / 0.60) * 100;
  const calibrated = Math.round(Math.max(0, Math.min(100, normalizedScore)));

  return calibrated;
}

/**
 * Builds descriptor cache for all registered students who have a saved face photo.
 */
export async function buildStudentsCache(
  students: Siswa[]
): Promise<FaceDescriptorCache[]> {
  const list: FaceDescriptorCache[] = [];
  for (const s of students) {
    if (s.fotoWajah && s.fotoWajah.startsWith('data:image')) {
      const desc = await extractFaceDescriptor(s.fotoWajah);
      if (desc) {
        list.push({
          siswa: s,
          descriptor: desc,
          descriptorMirrored: mirrorDescriptor(desc),
        });
      }
    }
  }
  return list;
}
