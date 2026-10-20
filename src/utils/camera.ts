export interface CameraDevice {
  deviceId: string;
  label: string;
}

export type CameraDeviceInfo = CameraDevice;

/**
 * High-level helper for requesting a camera stream with options.
 */
export async function requestCameraStream(options?: {
  facingMode?: 'user' | 'environment';
  deviceId?: string;
}): Promise<{ stream: MediaStream; activeFacingMode: 'user' | 'environment' }> {
  const facing = options?.facingMode || 'user';
  const stream = await getCameraStream(facing, options?.deviceId);
  return { stream, activeFacingMode: facing };
}

/**
 * Robustly requests a camera stream with cascading fallbacks.
 * Prevents OverconstrainedError on devices with only 1 camera or without facingMode support.
 */
export async function getCameraStream(
  facing: 'user' | 'environment' = 'user',
  deviceId?: string
): Promise<MediaStream> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Peramban Anda tidak mendukung akses kamera (getUserMedia tidak tersedia).');
  }

  // 1. Specific device ID if chosen
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch {
      // Fall through to facing mode
    }
  }

  // 2. Try with ideal facingMode and resolution
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
  } catch {
    // 3. Fallback: simple facingMode constraint
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      });
    } catch {
      // 4. Last resort fallback: any video camera available on the device
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }
}

/**
 * Safely attaches a MediaStream to an HTMLVideoElement and starts playback.
 */
export async function attachStreamToVideo(
  video: HTMLVideoElement,
  stream: MediaStream
): Promise<void> {
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('muted', 'true');
  video.srcObject = stream;

  return new Promise((resolve) => {
    const tryPlay = async () => {
      try {
        await video.play();
      } catch (err) {
        console.warn('Autoplay prevented or interrupted:', err);
      }
      resolve();
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      video.onloadedmetadata = () => {
        tryPlay();
      };
      // Fallback timeout in case onloadedmetadata doesn't fire
      setTimeout(tryPlay, 500);
    }
  });
}

/**
 * Stops all tracks in a MediaStream.
 */
export function stopCameraStream(stream: MediaStream | null): void {
  if (!stream) return;
  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {}
    });
  } catch {}
}

/**
 * Enumerates all connected video input devices.
 */
export async function getAvailableCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    return [];
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === 'videoinput');
    return videoDevices.map((d, index) => ({
      deviceId: d.deviceId,
      label: d.label || `Kamera ${index + 1}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Compresses and converts an uploaded user image file into a Base64 data URL.
 */
export function processImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan gambar.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 480;
        let w = img.naturalWidth || 480;
        let h = img.naturalHeight || 480;

        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Gagal memproses gambar.'));
          return;
        }

        ctx.drawImage(img, 0, 0, w, h);

        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        while (dataUrl.length > 45000 && quality > 0.35) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Gagal membaca gambar.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Gagal membuka file.'));
    reader.readAsDataURL(file);
  });
}

