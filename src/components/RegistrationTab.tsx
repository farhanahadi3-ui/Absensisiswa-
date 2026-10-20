import React, { useState, useRef, useEffect } from 'react';
import {
  UserPlus,
  Camera,
  RefreshCw,
  FlipHorizontal,
  Check,
  RotateCcw,
  Download,
  Upload,
  Trash2,
  Edit3,
  Search,
  FileSpreadsheet,
  Image as ImageIcon,
} from 'lucide-react';
import { Siswa } from '../types';
import { playBeep, playRegSound } from '../utils/audio';
import {
  getAvailableCameras,
  requestCameraStream,
  attachStreamToVideo,
  processImageFile,
  CameraDeviceInfo,
} from '../utils/camera';

interface RegistrationTabProps {
  students: Siswa[];
  onAddStudent: (student: Siswa) => void;
  onEditStudent: (student: Siswa) => void;
  onDeleteStudent: (id: string) => void;
  sheetUrl: string;
  setSheetUrl: (url: string) => void;
  onPullFromSheet: () => void;
  onOpenScriptModal: () => void;
  showToast: (msg: string) => void;
}

export const RegistrationTab: React.FC<RegistrationTabProps> = ({
  students,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  sheetUrl,
  setSheetUrl,
  onPullFromSheet,
  onOpenScriptModal,
  showToast,
}) => {
  const [nama, setNama] = useState('');
  const [kelas, setKelas] = useState('');
  const [fotoCaptured, setFotoCaptured] = useState<string | null>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true); // Default true like standard selfie camera!
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [filterKelas, setFilterKelas] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const availableClasses = Array.from(new Set(students.map((s) => s.kelas).filter(Boolean))).sort();

  useEffect(() => {
    getAvailableCameras().then((devs) => {
      if (devs.length > 0) setAvailableCameras(devs);
    });
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
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

  const startCamera = async (facing: 'user' | 'environment', deviceId?: string) => {
    stopCamera();
    setCameraError(null);
    try {
      const devId = deviceId !== undefined ? deviceId : selectedDeviceId;
      const { stream, activeFacingMode } = await requestCameraStream({
        deviceId: devId || undefined,
        facingMode: facing,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      // Natural mirror behavior: mirror front selfie camera, unmirror back camera
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

      getAvailableCameras().then((devs) => {
        if (devs.length > 0) setAvailableCameras(devs);
      });
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Kamera tidak dapat diakses.';
      setCameraError(msg);
      showToast(msg);
    }
  };

  const toggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera(facingMode, selectedDeviceId);
    }
  };

  const switchFacing = () => {
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextFacing);
    if (isCameraActive) {
      startCamera(nextFacing, undefined);
    } else {
      setIsMirrored(nextFacing === 'user');
    }
  };

  const handleSelectCameraDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (isCameraActive) {
      startCamera(facingMode, deviceId);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await processImageFile(file);
      setFotoCaptured(dataUrl);
      stopCamera();
      playBeep(650, 880);
      showToast('Foto wajah siswa berhasil diunggah!');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal memproses file gambar.');
    }
    e.target.value = '';
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      showToast('Kamera belum siap.');
      return;
    }

    const maxW = 480;
    const scale = Math.min(1, maxW / video.videoWidth);
    const w = Math.round(video.videoWidth * scale);
    const h = Math.round(video.videoHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Apply mirror horizontally if mirror is active so captured image matches preview exactly
    if (isMirrored) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, w, h);

    let quality = 0.7;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 45000 && quality > 0.35) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }

    setFotoCaptured(dataUrl);
    stopCamera();
    playBeep(650, 880);
    showToast('Foto wajah berhasil diambil!');
  };

  const handleRetake = () => {
    setFotoCaptured(null);
    startCamera(facingMode);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim() || !kelas.trim()) {
      showToast('Nama dan kelas siswa wajib diisi.');
      return;
    }
    if (!fotoCaptured) {
      showToast('Ambil sampel foto wajah siswa terlebih dahulu.');
      return;
    }

    const newSiswa: Siswa = {
      id: 'SIS-' + Date.now(),
      nama: nama.trim(),
      kelas: kelas.trim(),
      fotoWajah: fotoCaptured,
      createdAt: new Date().toISOString(),
    };

    onAddStudent(newSiswa);
    playRegSound(newSiswa.nama);
    showToast(`Siswa ${newSiswa.nama} berhasil didaftarkan!`);

    // Reset form
    setNama('');
    setKelas('');
    setFotoCaptured(null);
  };

  const handleBackup = () => {
    const dataBlob = new Blob([JSON.stringify({ siswaData: students }, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(dataBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_siswa_smk_fajar_indah_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup data siswa berhasil diunduh.');
  };

  const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        const list: Siswa[] = Array.isArray(parsed.siswaData)
          ? parsed.siswaData
          : Array.isArray(parsed)
          ? parsed
          : [];

        if (list.length === 0) {
          showToast('File JSON tidak berisi data siswa yang valid.');
          return;
        }

        list.forEach((s) => onAddStudent(s));
        showToast(`Berhasil merestore ${list.length} data siswa!`);
      } catch (err) {
        showToast('Gagal membaca file JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredStudents = students.filter((s) => {
    const matchClass = !filterKelas || s.kelas === filterKelas;
    const matchSearch =
      !searchQuery ||
      s.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchClass && matchSearch;
  });

  return (
    <section className="space-y-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl">
      <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-400" />
            <span>Registrasi Data Siswa &amp; Sampel Wajah AI</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Daftarkan siswa baru dengan sampel foto wajah. Sistem mendukung penyesuaian cermin natural seperti kamera bawaan ponsel.
          </p>
        </div>
        <button
          onClick={onOpenScriptModal}
          className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Setup Google Apps Script</span>
        </button>
      </div>

      {/* Form Input Siswa */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Nama Lengkap Siswa
            </label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Angel Lee Majesty"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Kelas / Jurusan
            </label>
            <input
              type="text"
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
              placeholder="Contoh: X AKL"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Google Sheet URL */}
        <div className="bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-medium text-slate-300">
              URL Web App Google Apps Script (/exec)
            </label>
            <button
              type="button"
              onClick={onOpenScriptModal}
              className="text-[11px] text-emerald-400 hover:underline"
            >
              Lihat Tutorial Script
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
            />
            <button
              type="button"
              onClick={onPullFromSheet}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-md"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tarik Data</span>
            </button>
          </div>
        </div>

        {/* Camera Box for Registration */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Ambil Sampel Foto Wajah Siswa
            </label>
            {isCameraActive && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Kamera Aktif</span>
              </span>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center flex flex-col items-center justify-center">
            {fotoCaptured ? (
              <div className="flex flex-col items-center space-y-3 py-2">
                <div className="relative rounded-xl overflow-hidden border-2 border-emerald-500 shadow-xl w-48 h-48 bg-black">
                  <img
                    src={fotoCaptured}
                    alt="Pratinjau Foto Siswa"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 right-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    <span>Terambil</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                  <span>Ambil Ulang Foto</span>
                </button>
              </div>
            ) : isCameraActive ? (
              <div className="flex flex-col items-center w-full max-w-sm">
                <div className="relative w-full h-64 bg-black rounded-xl overflow-hidden border-2 border-blue-500/50 shadow-2xl mb-3">
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

                  {/* Face Guide Oval */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-36 h-48 border-2 border-dashed border-blue-400/80 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
                  </div>

                  {/* Camera Top Controls: Mirror & Switch Facing */}
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-10">
                    <button
                      type="button"
                      onClick={() => setIsMirrored(!isMirrored)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium backdrop-blur-md border flex items-center gap-1.5 transition ${
                        isMirrored
                          ? 'bg-blue-600/80 text-white border-blue-400 shadow-md'
                          : 'bg-black/60 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Klik untuk membalik posisi cermin (Mirror Normal / Cermin)"
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>{isMirrored ? 'Cermin: Aktif' : 'Cermin: Nonaktif'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={switchFacing}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-black/60 backdrop-blur-md text-slate-300 border border-slate-700 hover:text-white flex items-center gap-1.5 transition"
                      title="Ganti Kamera Depan / Belakang"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{facingMode === 'user' ? 'Depan' : 'Belakang'}</span>
                    </button>
                  </div>

                  <div className="absolute bottom-2 left-2 right-2 bg-black/70 backdrop-blur-md rounded-lg py-1 px-2 text-[10px] text-blue-200">
                    Posisikan wajah di dalam oval. Tampilan kamera telah diselaraskan dengan posisi cermin alami.
                  </div>
                </div>

                {availableCameras.length > 1 && (
                  <div className="w-full mb-2">
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => handleSelectCameraDevice(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="">Pilih Sumber Kamera...</option>
                      {availableCameras.map((cam) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          📷 {cam.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={handleCapture}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Jepret Foto Wajah</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-xs font-medium cursor-pointer"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center max-w-sm">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-3 shadow-inner">
                  <Camera className="w-7 h-7" />
                </div>
                <p className="text-xs text-slate-400 mb-3 text-center">
                  Ambil foto sampel wajah siswa langsung menggunakan webcam atau unggah file foto dari perangkat.
                </p>

                {cameraError && (
                  <div className="w-full bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 mb-3 text-left text-xs text-rose-300 space-y-1">
                    <div className="font-semibold text-rose-200">⚠️ Kendala Kamera:</div>
                    <p>{cameraError}</p>
                    <p className="text-[11px] text-slate-400">
                      Anda tetap dapat mendaftarkan siswa dengan mengklik tombol <b>Unggah File Foto</b> di bawah.
                    </p>
                  </div>
                )}

                {availableCameras.length > 1 && (
                  <div className="w-full mb-3 text-left">
                    <label className="block text-[11px] text-slate-400 mb-1">Pilih Perangkat Kamera:</label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
                    >
                      <option value="">Kamera Default (Otomatis)</option>
                      {availableCameras.map((cam) => (
                        <option key={cam.deviceId} value={cam.deviceId}>
                          📷 {cam.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                  <button
                    type="button"
                    onClick={toggleCamera}
                    className="flex-1 w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Nyalakan Kamera</span>
                  </button>

                  <label className="flex-1 w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 py-2.5 px-4 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer">
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    <span>Unggah File Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
        >
          <Check className="w-4 h-4" />
          <span>Simpan Data Siswa Baru</span>
        </button>
      </form>

      {/* Daftar Siswa Terdaftar */}
      <div className="pt-4 border-t border-slate-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs sm:text-sm font-semibold text-white">
              Daftar Siswa &amp; Foto Terdaftar
            </h3>
            <span className="bg-blue-900/60 text-blue-300 text-xs font-bold px-2.5 py-0.5 rounded-full border border-blue-700/50">
              {students.length} Siswa
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackup}
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-1.5 px-3 rounded-xl font-medium text-xs flex items-center gap-1.5 transition"
              title="Unduh file backup JSON"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Backup JSON</span>
            </button>

            <label
              className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 py-1.5 px-3 rounded-xl font-medium text-xs flex items-center gap-1.5 transition cursor-pointer"
              title="Pulihkan data siswa dari file JSON"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Restore JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleRestore}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Filter bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama atau ID siswa..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">Semua Kelas</option>
            {availableClasses.map((c) => (
              <option key={c} value={c}>
                Kelas {c}
              </option>
            ))}
          </select>
        </div>

        {/* List of students */}
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {filteredStudents.length > 0 ? (
            filteredStudents.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800/80 rounded-xl p-3 hover:border-slate-700 transition"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-lg bg-slate-800 overflow-hidden flex items-center justify-center border border-slate-700/80 shrink-0">
                    {s.fotoWajah ? (
                      <img
                        src={s.fotoWajah}
                        alt={s.nama}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-sm">👤</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {s.nama}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {s.kelas} &bull; <span className="font-mono text-[10px]">{s.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onEditStudent(s)}
                    className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg transition"
                    title="Edit Data/Foto Siswa"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  {deletingStudentId === s.id ? (
                    <div className="flex items-center gap-1 bg-slate-900 border border-rose-500/50 rounded-lg p-1 animate-fadeIn">
                      <span className="text-[10px] text-rose-300 px-1">Hapus?</span>
                      <button
                        onClick={() => {
                          onDeleteStudent(s.id);
                          setDeletingStudentId(null);
                          showToast(`Siswa ${s.nama} telah dihapus.`);
                        }}
                        className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-semibold"
                      >
                        Ya
                      </button>
                      <button
                        onClick={() => setDeletingStudentId(null)}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-[10px]"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingStudentId(s.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                      title="Hapus Siswa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-6 text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800/50">
              Belum ada siswa terdaftar. Silakan daftarkan siswa baru di atas atau tarik data dari Google Sheets.
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
