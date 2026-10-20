import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Scan,
  UserCheck,
  RefreshCw,
  FlipHorizontal,
  CheckCircle2,
  Clock,
  Sparkles,
  Search,
} from 'lucide-react';
import { Siswa, AbsensiRecord, AttendanceStatus, FaceDescriptorCache } from '../types';
import {
  extractFaceDescriptor,
  buildStudentsCache,
  compareFaceWithCachedStudent,
} from '../utils/faceRecognition';
import {
  getTodayDateString,
  getCurrentTimeString,
} from '../utils/sheets';
import { playDatangSound, playPulangSound, speakText } from '../utils/audio';
import {
  getAvailableCameras,
  requestCameraStream,
  attachStreamToVideo,
  CameraDeviceInfo,
} from '../utils/camera';

interface AttendanceTabProps {
  students: Siswa[];
  attendanceLogs: AbsensiRecord[];
  onRecordAttendance: (record: AbsensiRecord) => void;
  onUpdateStatus: (studentId: string, status: AttendanceStatus) => void;
  onPullFromSheet: () => void;
  showToast: (msg: string) => void;
}

export const AttendanceTab: React.FC<AttendanceTabProps> = ({
  students,
  attendanceLogs,
  onRecordAttendance,
  onUpdateStatus,
  onPullFromSheet,
  showToast,
}) => {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  // Default to true for front camera, matching standard camera apps!
  const [isMirrored, setIsMirrored] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  // AI Recognition states
  const [recognizedStudent, setRecognizedStudent] = useState<Siswa | null>(null);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [aiStatusMessage, setAiStatusMessage] = useState('Nyalakan kamera untuk pemindaian');
  const [isMatchLocked, setIsMatchLocked] = useState(false);

  // Manual mode states
  const [manualFilterKelas, setManualFilterKelas] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');

  // Table filter state
  const [tableFilterKelas, setTableFilterKelas] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionIntervalRef = useRef<number | null>(null);
  const studentsCacheRef = useRef<FaceDescriptorCache[]>([]);
  const lastAutoRecordTimeRef = useRef<number>(0);

  const todayStr = getTodayDateString();

  // Rebuild facial cache whenever students list changes
  useEffect(() => {
    let isMounted = true;
    buildStudentsCache(students).then((cache) => {
      if (isMounted) {
        studentsCacheRef.current = cache;
      }
    });
    return () => {
      isMounted = false;
    };
  }, [students]);

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }
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
    setConfidenceScore(0);
    setRecognizedStudent(null);
    setIsMatchLocked(false);
    setAiStatusMessage('Kamera dimatikan.');
  };

  // Ensure stream is attached to video element as soon as isCameraActive is true
  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      attachStreamToVideo(videoRef.current, streamRef.current);
    }
  }, [isCameraActive]);

  const handleAutoAbsen = useCallback(
    (student: Siswa, score: number) => {
      const now = Date.now();
      // 4-second debounce to prevent double-firing
      if (now - lastAutoRecordTimeRef.current < 4000) return;
      lastAutoRecordTimeRef.current = now;

      const existing = attendanceLogs.find(
        (a) => String(a.siswaId) === String(student.id) && a.tanggal === todayStr
      );

      const isComingIn = !existing || existing.jamDatang === '-' || !existing.jamDatang;
      const jenis = isComingIn ? 'Datang' : 'Pulang';

      const updatedRecord: AbsensiRecord = {
        id: existing?.id || 'ABS-' + Date.now(),
        siswaId: student.id,
        nama: student.nama,
        kelas: student.kelas,
        tanggal: todayStr,
        jamDatang: isComingIn ? getCurrentTimeString() : existing?.jamDatang || '-',
        jamPulang: !isComingIn ? getCurrentTimeString() : existing?.jamPulang || '-',
        status: existing?.status || 'Hadir',
      };

      onRecordAttendance(updatedRecord);

      if (isComingIn) {
        playDatangSound(student.nama);
      } else {
        playPulangSound(student.nama);
      }

      showToast(`AI Mengenali ${student.nama} (${score}%). Absen ${jenis} berhasil dicatat!`);
      setIsMatchLocked(true);
      setTimeout(() => setIsMatchLocked(false), 3000);
    },
    [attendanceLogs, todayStr, onRecordAttendance, showToast]
  );

  const startAIRecognitionLoop = useCallback(() => {
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
    }

    const interval = window.setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.paused || video.ended || !video.videoWidth) return;

      const liveDescriptor = await extractFaceDescriptor(video);
      if (!liveDescriptor) {
        setConfidenceScore(0);
        setAiStatusMessage('Mengarahkan kamera ke wajah...');
        setRecognizedStudent(null);
        return;
      }

      const cache = studentsCacheRef.current;
      if (!cache || cache.length === 0) {
        setAiStatusMessage('Belum ada data sampel siswa. Daftarkan siswa di tab Pendaftaran.');
        return;
      }

      let bestStudent: Siswa | null = null;
      let highestScore = 0;

      for (const item of cache) {
        // Compares both normal and mirrored representations for 100% invariance!
        const score = compareFaceWithCachedStudent(liveDescriptor, item);
        if (score > highestScore) {
          highestScore = score;
          bestStudent = item.siswa;
        }
      }

      setConfidenceScore(highestScore);

      if (highestScore >= 68 && bestStudent) {
        setRecognizedStudent(bestStudent);
        setAiStatusMessage(`Cocok dengan Wajah Tersimpan: ${bestStudent.nama} (${bestStudent.kelas})`);

        if (highestScore >= 74) {
          handleAutoAbsen(bestStudent, highestScore);
        }
      } else {
        setRecognizedStudent(null);
        if (highestScore >= 45) {
          setAiStatusMessage(`Mendeteksi wajah (${highestScore}%), belum cukup cocok dengan data tersimpan...`);
        } else {
          setAiStatusMessage('Posisikan wajah tepat di dalam bingkai oval.');
        }
      }
    }, 400);

    recognitionIntervalRef.current = interval;
  }, [handleAutoAbsen]);

  const startCamera = async (facing: 'user' | 'environment', deviceId?: string) => {
    stopCamera();
    setCameraError(null);
    setAiStatusMessage('Menghubungkan ke kamera...');
    try {
      const devId = deviceId !== undefined ? deviceId : selectedDeviceId;
      const { stream, activeFacingMode } = await requestCameraStream({
        deviceId: devId || undefined,
        facingMode: facing,
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      // Natural mirror behavior: standard front camera is mirrored, back camera is unmirrored
      setIsMirrored(activeFacingMode === 'user');
      setAiStatusMessage('Kamera aktif. Silakan hadapkan wajah ke kamera.');

      // Attach stream immediately and on next render
      if (videoRef.current) {
        attachStreamToVideo(videoRef.current, stream);
      } else {
        setTimeout(() => {
          if (videoRef.current && streamRef.current) {
            attachStreamToVideo(videoRef.current, streamRef.current);
          }
        }, 50);
      }

      startAIRecognitionLoop();

      // Refresh camera list with permission-granted labels
      getAvailableCameras().then((devs) => {
        if (devs.length > 0) setAvailableCameras(devs);
      });
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Kamera tidak dapat diakses.';
      setCameraError(msg);
      setAiStatusMessage('Gagal mengakses kamera.');
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

  const handleManualAction = (type: 'Datang' | 'Pulang') => {
    if (!selectedStudentId) {
      showToast('Pilih nama siswa terlebih dahulu.');
      speakText('Pilih nama siswa terlebih dahulu');
      return;
    }

    const student = students.find((s) => String(s.id) === String(selectedStudentId));
    if (!student) {
      showToast('Data siswa tidak ditemukan.');
      return;
    }

    const existing = attendanceLogs.find(
      (a) => String(a.siswaId) === String(student.id) && a.tanggal === todayStr
    );

    const record: AbsensiRecord = {
      id: existing?.id || 'ABS-' + Date.now(),
      siswaId: student.id,
      nama: student.nama,
      kelas: student.kelas,
      tanggal: todayStr,
      jamDatang: type === 'Datang' ? getCurrentTimeString() : existing?.jamDatang || '-',
      jamPulang: type === 'Pulang' ? getCurrentTimeString() : existing?.jamPulang || '-',
      status: existing?.status || 'Hadir',
    };

    onRecordAttendance(record);

    if (type === 'Datang') {
      playDatangSound(student.nama);
    } else {
      playPulangSound(student.nama);
    }

    showToast(`Absensi ${type} untuk ${student.nama} berhasil dicatat.`);
  };

  // Compute today's statistics
  const todayRecords = attendanceLogs.filter((a) => a.tanggal === todayStr);

  let totalDatang = 0;
  let totalSakit = 0;
  let totalIzin = 0;
  let totalAlpa = 0;

  students.forEach((s) => {
    const rec = todayRecords.find((a) => String(a.siswaId) === String(s.id));
    const st = rec?.status || 'Alpa';
    if (rec && (rec.jamDatang !== '-' || st === 'Hadir')) {
      totalDatang++;
    } else if (st === 'Sakit') {
      totalSakit++;
    } else if (st === 'Izin') {
      totalIzin++;
    } else {
      totalAlpa++;
    }
  });

  const availableClasses = Array.from(new Set(students.map((s) => s.kelas).filter(Boolean))).sort();

  const filteredManualStudents = students.filter(
    (s) => !manualFilterKelas || s.kelas === manualFilterKelas
  );

  const filteredTableStudents = students.filter((s) => {
    const matchClass = !tableFilterKelas || s.kelas === tableFilterKelas;
    const matchSearch =
      !tableSearch ||
      s.nama.toLowerCase().includes(tableSearch.toLowerCase()) ||
      s.id.toLowerCase().includes(tableSearch.toLowerCase());
    return matchClass && matchSearch;
  });

  return (
    <section className="space-y-5">
      {/* Method Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-medium pl-1">Metode Presensi:</span>
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => {
                setMode('ai');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                mode === 'ai'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Scan className="w-3.5 h-3.5" />
              <span>Scan Wajah AI</span>
            </button>
            <button
              onClick={() => {
                setMode('manual');
                stopCamera();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                mode === 'manual'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Input Manual</span>
            </button>
          </div>
        </div>

        <button
          onClick={onPullFromSheet}
          className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Spreadsheet</span>
        </button>
      </div>

      {/* Status Sinkronisasi Wajah Tersimpan */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Database Wajah Tersimpan:</span>
          <span className="font-semibold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-lg">
            {students.filter((s) => !!s.fotoWajah).length} Siswa Berfoto
          </span>
          <span className="text-slate-500">&bull;</span>
          <span className="text-slate-400">Total Siswa: {students.length}</span>
        </div>
        {students.filter((s) => !!s.fotoWajah).length === 0 ? (
          <span className="text-amber-400 text-[11px] font-medium flex items-center gap-1">
            ⚠️ Belum ada foto wajah siswa tersimpan. Silakan tambahkan di menu Pendaftaran.
          </span>
        ) : (
          <span className="text-blue-400 text-[11px] font-medium flex items-center gap-1">
            ✓ Siap memindai &amp; mencocokkan wajah tersimpan
          </span>
        )}
      </div>

      {/* Mode AI Camera Scanner */}
      {mode === 'ai' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col items-center justify-center min-h-[300px] relative overflow-hidden">
          {isCameraActive ? (
            <div className="w-full max-w-sm flex flex-col items-center">
              {/* Camera Viewport with Standard Mirror Support */}
              <div className="relative w-full h-72 rounded-2xl overflow-hidden border-2 border-slate-700 bg-black shadow-2xl mb-3">
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
                <canvas ref={canvasRef} className="hidden" />

                {/* Face Target Scanner Frame */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={`relative w-44 h-56 rounded-3xl border-2 border-dashed transition-all duration-300 ${
                      isMatchLocked || confidenceScore >= 72
                        ? 'border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.7)]'
                        : confidenceScore > 40
                        ? 'border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                        : 'border-blue-400/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]'
                    }`}
                  >
                    {/* Laser scan line animation */}
                    <div className="absolute left-1 right-1 h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent shadow-[0_0_8px_#38bdf8] animate-pulse top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Top Overlay Badge & Controls */}
                <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-20">
                  <div className="bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded-lg text-[10px] text-blue-300 font-mono border border-blue-500/30 flex items-center gap-1.5 shadow-md">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                    <span>AI FACE DETECTOR</span>
                  </div>

                  {/* Mirror & Facing Mode Toggles */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setIsMirrored(!isMirrored)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold backdrop-blur-md border flex items-center gap-1 transition ${
                        isMirrored
                          ? 'bg-blue-600/90 text-white border-blue-400 shadow-md'
                          : 'bg-black/60 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Klik untuk mengubah posisi cermin (seperti kamera selfie / kamera belakang)"
                    >
                      <FlipHorizontal className="w-3 h-3" />
                      <span>{isMirrored ? 'Cermin On' : 'Cermin Off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={switchFacing}
                      className="p-1.5 rounded-lg text-[10px] bg-black/60 backdrop-blur-md text-slate-300 border border-slate-700 hover:text-white transition"
                      title="Ganti Kamera Depan / Belakang"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Recognized Student Popup Badge with Saved Photo Comparison */}
                {recognizedStudent && confidenceScore >= 68 && (
                  <div className="absolute top-12 left-2.5 right-2.5 z-30 bg-slate-900/95 border-2 border-emerald-500 text-white p-2.5 rounded-2xl shadow-2xl flex items-center justify-between backdrop-blur-md animate-fadeIn">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {recognizedStudent.fotoWajah ? (
                        <div className="relative shrink-0">
                          <img
                            src={recognizedStudent.fotoWajah}
                            alt="Wajah Tersimpan"
                            className="w-12 h-12 rounded-xl object-cover border-2 border-emerald-400 shadow-md"
                          />
                          <span className="absolute -bottom-1 -right-1 bg-emerald-500 text-white rounded-full p-0.5 shadow">
                            <CheckCircle2 className="w-3 h-3" />
                          </span>
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 shrink-0">
                          <CheckCircle2 className="w-6 h-6" />
                        </div>
                      )}
                      <div className="min-w-0 text-left">
                        <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider flex items-center gap-1">
                          <span>Sesuai Wajah Tersimpan</span>
                        </div>
                        <div className="text-xs font-bold text-white truncate">{recognizedStudent.nama}</div>
                        <div className="text-[11px] text-slate-300 truncate">{recognizedStudent.kelas}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 pl-2">
                      <span className="inline-block text-xs font-mono font-black text-emerald-300 bg-emerald-950/80 px-2 py-1 rounded-lg border border-emerald-500/50 shadow">
                        {confidenceScore}%
                      </span>
                      <div className="text-[9px] text-emerald-400 mt-0.5">Cocok</div>
                    </div>
                  </div>
                )}

                {/* Bottom Real-time Status Bar */}
                <div className="absolute bottom-2 left-2 right-2 z-20 bg-slate-950/90 backdrop-blur-md px-3 py-2 rounded-xl text-[11px] border border-slate-800 flex items-center justify-between shadow-md">
                  <span className="text-blue-300 font-medium truncate mr-2">
                    {aiStatusMessage}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    Match: {confidenceScore}%
                  </span>
                </div>
              </div>

              {/* Camera Selector if multiple devices detected */}
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

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full mb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (recognizedStudent) {
                      handleAutoAbsen(recognizedStudent, confidenceScore);
                    } else {
                      showToast('Wajah belum dikenali. Hadapkan wajah ke kamera.');
                    }
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-lg shadow-emerald-600/30"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Catat Kehadiran Sekarang</span>
                </button>
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-medium"
                >
                  Matikan Kamera
                </button>
              </div>

              <p className="text-[11px] text-slate-400 text-center">
                Tip: Posisi kamera telah disesuaikan dengan <b>cermin standar kamera</b> agar Anda dapat mengarahkan wajah secara natural. AI mengenali wajah baik dalam mode cermin maupun normal.
              </p>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 shadow-inner">
                <Camera className="w-8 h-8" />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-white mb-1">
                Pemindai Wajah Otomatis
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Nyalakan kamera untuk verifikasi wajah otomatis. Posisi tampilan kamera telah disesuaikan layaknya kamera umum pada smartphone/webcam.
              </p>

              {cameraError && (
                <div className="w-full bg-rose-500/15 border border-rose-500/40 rounded-xl p-3 mb-4 text-left text-xs text-rose-300 space-y-1">
                  <div className="font-semibold text-rose-200 flex items-center gap-1">
                    <span>⚠️ Kendala Akses Kamera:</span>
                  </div>
                  <p>{cameraError}</p>
                  <ul className="list-disc list-inside text-[11px] text-slate-400 pt-1 space-y-0.5">
                    <li>Pastikan izin kamera di peramban telah diatur ke "Izinkan" (Allow).</li>
                    <li>Pastikan webcam tidak sedang digunakan oleh aplikasi lain (Zoom, Google Meet, dll).</li>
                    <li>Jika menggunakan kamera eksternal, periksa koneksi USB kamera.</li>
                  </ul>
                </div>
              )}

              {/* Camera device picker if detected */}
              {availableCameras.length > 1 && (
                <div className="w-full mb-3 text-left">
                  <label className="block text-[11px] text-slate-400 mb-1">Pilih Perangkat Kamera:</label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
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

              <button
                type="button"
                onClick={toggleCamera}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-blue-200" />
                <span>Nyalakan Pemindai Wajah</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Mode Manual Input */}
      {mode === 'manual' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Filter Berdasarkan Kelas
              </label>
              <select
                value={manualFilterKelas}
                onChange={(e) => {
                  setManualFilterKelas(e.target.value);
                  setSelectedStudentId('');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">Semua Kelas</option>
                {availableClasses.map((c) => (
                  <option key={c} value={c}>
                    Kelas {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Pilih Nama Siswa
              </label>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="">-- Pilih Nama Siswa --</option>
                {filteredManualStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama} ({s.kelas})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={() => handleManualAction('Datang')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>Absen Datang</span>
            </button>
            <button
              type="button"
              onClick={() => handleManualAction('Pulang')}
              className="bg-rose-600 hover:bg-rose-500 text-white py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-rose-600/30 cursor-pointer"
            >
              <Clock className="w-4 h-4" />
              <span>Absen Pulang</span>
            </button>
          </div>
        </div>
      )}

      {/* Tabel Status Kehadiran Hari Ini */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white">
                Tabel Status Kehadiran Hari Ini
              </h3>
              <p className="text-[11px] text-slate-400">
                Tanggal: <span className="font-mono text-white">{todayStr}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={tableFilterKelas}
              onChange={(e) => setTableFilterKelas(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="">Semua Kelas</option>
              {availableClasses.map((c) => (
                <option key={c} value={c}>
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search inside table */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            placeholder="Cari siswa dalam tabel hari ini..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 max-h-80 overflow-y-auto">
          <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
            <thead>
              <tr className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0 z-10">
                <th className="p-2.5 border-r border-slate-800 text-center w-10">No</th>
                <th className="p-2.5 border-r border-slate-800 min-w-[130px]">Nama Siswa</th>
                <th className="p-2.5 border-r border-slate-800 min-w-[70px]">Kelas</th>
                <th className="p-2.5 border-r border-slate-800 text-center min-w-[80px]">Indikator</th>
                <th className="p-2.5 border-r border-slate-800 text-center min-w-[80px]">Jam Datang</th>
                <th className="p-2.5 border-r border-slate-800 text-center min-w-[80px]">Jam Pulang</th>
                <th className="p-2.5 text-center min-w-[160px]">Atur Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-200">
              {filteredTableStudents.length > 0 ? (
                filteredTableStudents.map((s, idx) => {
                  const log = todayRecords.find((a) => String(a.siswaId) === String(s.id));
                  const isPresent = log && (log.jamDatang !== '-' || log.status === 'Hadir');
                  const currentStatus: AttendanceStatus = log?.status || 'Alpa';

                  return (
                    <tr key={s.id} className="hover:bg-slate-900/50 transition">
                      <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-2.5 font-medium text-white">{s.nama}</td>
                      <td className="p-2.5 text-slate-400">{s.kelas}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isPresent
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isPresent ? 'bg-emerald-400' : 'bg-rose-400'
                            }`}
                          />
                          <span>{isPresent ? 'Hadir' : 'Belum'}</span>
                        </span>
                      </td>
                      <td className="p-2.5 text-center font-mono text-emerald-400">
                        {log?.jamDatang || '-'}
                      </td>
                      <td className="p-2.5 text-center font-mono text-rose-400">
                        {log?.jamPulang || '-'}
                      </td>
                      <td className="p-2.5 text-center">
                        <select
                          value={currentStatus}
                          onChange={(e) => {
                            const val = e.target.value as AttendanceStatus;
                            onUpdateStatus(s.id, val);
                            speakText(`Status ${s.nama} diubah menjadi ${val}`);
                            showToast(`Status ${s.nama} diubah menjadi ${val}`);
                          }}
                          className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          <option value="Hadir">Hadir</option>
                          <option value="Sakit">Sakit</option>
                          <option value="Izin">Izin</option>
                          <option value="Alpa">Alpa</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-500 text-xs">
                    Tidak ada siswa untuk filter yang dipilih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 4 Statistik Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-500/30 text-center shadow">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              TOTAL DATANG
            </span>
            <span className="text-lg font-black text-emerald-400">{totalDatang}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-amber-500/30 text-center shadow">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              TOTAL SAKIT (S)
            </span>
            <span className="text-lg font-black text-amber-400">{totalSakit}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-blue-500/30 text-center shadow">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              TOTAL IZIN (I)
            </span>
            <span className="text-lg font-black text-blue-400">{totalIzin}</span>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-rose-500/30 text-center shadow">
            <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              TOTAL ALPA (A)
            </span>
            <span className="text-lg font-black text-rose-400">{totalAlpa}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
