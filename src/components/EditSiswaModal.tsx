import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, RefreshCw, Check, FlipHorizontal, Image as ImageIcon } from 'lucide-react';
import { Siswa } from '../types';
import { requestCameraStream, attachStreamToVideo, processImageFile } from '../utils/camera';

interface EditSiswaModalProps {
  siswa: Siswa | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Siswa) => void;
}

export const EditSiswaModal: React.FC<EditSiswaModalProps> = ({
  siswa,
  isOpen,
  onClose,
  onSave,
}) => {
  const [nama, setNama] = useState('');
  const [kelas, setKelas] = useState('');
  const [fotoPreview, setFotoPreview] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (siswa) {
      setNama(siswa.nama);
      setKelas(siswa.kelas);
      setFotoPreview(siswa.fotoWajah || '');
    }
    return () => {
      stopCamera();
    };
  }, [siswa]);

  const [errorMessage, setErrorMessage] = useState('');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      attachStreamToVideo(videoRef.current, streamRef.current);
    }
  }, [isCameraActive]);

  const startCamera = async (facing: 'user' | 'environment') => {
    stopCamera();
    setErrorMessage('');
    try {
      const { stream, activeFacingMode } = await requestCameraStream({
        facingMode: facing,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      // Auto mirror for user-facing camera like standard phone camera
      setIsMirrored(activeFacingMode === 'user');

      if (videoRef.current) {
        attachStreamToVideo(videoRef.current, stream);
      } else {
        setTimeout(() => {
          if (videoRef.current && streamRef.current) {
            attachStreamToVideo(videoRef.current, streamRef.current);
          }
        }, 50);
      }
    } catch (e: unknown) {
      setErrorMessage(
        e instanceof Error ? e.message : 'Tidak dapat mengakses kamera. Mohon izinkan izin kamera di peramban.'
      );
    }
  };

  const switchCameraFacing = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await processImageFile(file);
      setFotoPreview(dataUrl);
      stopCamera();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memproses file foto.');
    }
    e.target.value = '';
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 480 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isMirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    let quality = 0.7;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 45000 && quality > 0.35) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    setFotoPreview(dataUrl);
    stopCamera();
  };

  const handleSave = () => {
    if (!siswa) return;
    if (!nama.trim() || !kelas.trim()) {
      setErrorMessage('Nama dan Kelas tidak boleh kosong!');
      return;
    }

    onSave({
      ...siswa,
      nama: nama.trim(),
      kelas: kelas.trim(),
      fotoWajah: fotoPreview || siswa.fotoWajah,
    });
    stopCamera();
    onClose();
  };

  if (!isOpen || !siswa) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 relative shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Camera className="w-4 h-4 text-blue-400" />
            <span>Edit Data &amp; Foto Siswa</span>
          </h3>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {errorMessage && (
            <div className="p-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
              {errorMessage}
            </div>
          )}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nama Siswa</label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Kelas</label>
            <input
              type="text"
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Foto Sampel Wajah</label>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
              {!isCameraActive ? (
                <div className="flex flex-col items-center">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt="Foto Siswa"
                      className="w-24 h-24 object-cover mx-auto rounded-lg border border-slate-700 mb-2 shadow"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 mb-2">
                      Belum ada foto
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera(facingMode)}
                      className="bg-blue-600/80 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Ambil Foto Baru</span>
                    </button>

                    <label className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition cursor-pointer">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Pilih File</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="relative w-full max-w-[220px] h-40 bg-black rounded-lg overflow-hidden border border-slate-700 mb-2">
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        if (el && streamRef.current && el.srcObject !== streamRef.current) {
                          attachStreamToVideo(el, streamRef.current);
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover transition-transform duration-300 ${
                        isMirrored ? '-scale-x-100' : 'scale-x-100'
                      }`}
                    />

                    {/* Camera overlay indicators */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setIsMirrored(!isMirrored)}
                        className={`p-1.5 rounded-md text-[10px] backdrop-blur font-medium flex items-center gap-1 border transition ${
                          isMirrored
                            ? 'bg-blue-600/80 text-white border-blue-400'
                            : 'bg-black/60 text-slate-300 border-slate-600'
                        }`}
                        title="Toggle Mirror"
                      >
                        <FlipHorizontal className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={switchCameraFacing}
                        className="p-1.5 rounded-md text-[10px] bg-black/60 text-slate-300 border border-slate-600 hover:text-white"
                        title="Ganti Kamera Depan/Belakang"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Jepret Foto</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-medium"
                    >
                      Batal Kamera
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 text-slate-300 hover:text-white"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5"
          >
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
