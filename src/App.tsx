import React, { useState, useEffect, useCallback } from 'react';
import {
  Header,
} from './components/Header';
import { LoginScreen } from './components/LoginScreen';
import { RegistrationTab } from './components/RegistrationTab';
import { AttendanceTab } from './components/AttendanceTab';
import { RekapTab } from './components/RekapTab';
import { ScriptModal } from './components/ScriptModal';
import { EditSiswaModal } from './components/EditSiswaModal';
import { Siswa, AbsensiRecord, AttendanceStatus } from './types';
import {
  loadLocalSiswa,
  saveLocalSiswa,
  loadLocalAbsensi,
  saveLocalAbsensi,
  getSavedSheetUrl,
  setSavedSheetUrl,
  fetchFromSheetJSONP,
  sendPayloadToSheet,
  getTodayDateString,
  getCurrentTimeString,
} from './utils/sheets';
import {
  getAudioMuted,
  setAudioMuted,
  toggleAudio,
  speakText,
} from './utils/audio';
import { UserPlus, Scan, FileSpreadsheet, CheckCircle2 } from 'lucide-react';

const INITIAL_SAMPLE_STUDENTS: Siswa[] = [
  {
    id: 'SIS-101',
    nama: 'Angel Lee Majesty',
    kelas: 'X AKL',
    fotoWajah: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'SIS-102',
    nama: 'Budi Pratama',
    kelas: 'X TKJ',
    fotoWajah: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'SIS-103',
    nama: 'Citra Dewi Lestari',
    kelas: 'XI OTKP',
    fotoWajah: '',
    createdAt: new Date().toISOString(),
  },
];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState<'absensi' | 'pendaftaran' | 'rekap'>('absensi');
  const [students, setStudents] = useState<Siswa[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AbsensiRecord[]>([]);
  const [sheetUrl, setSheetUrlState] = useState('');
  const [isMuted, setIsMutedState] = useState(getAudioMuted());

  // Modals
  const [isScriptModalOpen, setIsScriptModalOpen] = useState(false);
  const [editingSiswa, setEditingSiswa] = useState<Siswa | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Initial load
  useEffect(() => {
    try {
      const logged =
        localStorage.getItem('isLoggedIn') === 'true' ||
        sessionStorage.getItem('isLoggedIn') === 'true';
      setIsLoggedIn(logged);
    } catch {}

    const localStudents = loadLocalSiswa();
    if (localStudents.length > 0) {
      setStudents(localStudents);
    } else {
      setStudents(INITIAL_SAMPLE_STUDENTS);
      saveLocalSiswa(INITIAL_SAMPLE_STUDENTS);
    }

    const localLogs = loadLocalAbsensi();
    setAttendanceLogs(localLogs);

    const savedUrl = getSavedSheetUrl();
    if (savedUrl) {
      setSheetUrlState(savedUrl);
    }
  }, []);

  const handleSetSheetUrl = (url: string) => {
    setSheetUrlState(url);
    setSavedSheetUrl(url);
  };

  const handleToggleSound = () => {
    const next = toggleAudio();
    setIsMutedState(next);
    showToast(next ? 'Suara dinonaktifkan.' : 'Suara diaktifkan.');
    if (!next) {
      speakText('Suara diaktifkan');
    }
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem('isLoggedIn');
      sessionStorage.removeItem('isLoggedIn');
    } catch {}
    setIsLoggedIn(false);
    showToast('Berhasil keluar dari sistem.');
  };

  const handlePullFromSheet = useCallback(
    async (silent = false) => {
      const url = sheetUrl.trim();
      if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
        if (!silent) {
          showToast('Masukkan URL Web App Apps Script (/exec) terlebih dahulu.');
        }
        return;
      }

      try {
        if (!silent) showToast('Menghubungi Google Sheets...');
        const data = await fetchFromSheetJSONP(url);

        if (Array.isArray(data.siswaData) && data.siswaData.length > 0) {
          setStudents(data.siswaData);
          saveLocalSiswa(data.siswaData);
        }
        if (Array.isArray(data.absensiData)) {
          setAttendanceLogs(data.absensiData);
          saveLocalAbsensi(data.absensiData);
        }

        if (!silent) {
          showToast(
            `Sinkron berhasil: ${data.siswaData.length} siswa, ${data.absensiData.length} catatan absensi.`
          );
        }
      } catch (err) {
        if (!silent) {
          showToast(err instanceof Error ? err.message : 'Gagal menarik data spreadsheet.');
        }
      }
    },
    [sheetUrl, showToast]
  );

  // Sync is triggered on-demand via the "Sync Spreadsheet" or "Tarik Data" buttons

  const handleAddStudent = (newStudent: Siswa) => {
    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== newStudent.id);
      const updated = [newStudent, ...filtered];
      saveLocalSiswa(updated);
      return updated;
    });

    sendPayloadToSheet(sheetUrl, {
      type: 'siswa',
      ...newStudent,
    });
  };

  const handleEditStudent = (updatedStudent: Siswa) => {
    setStudents((prev) => {
      const next = prev.map((s) => (s.id === updatedStudent.id ? updatedStudent : s));
      saveLocalSiswa(next);
      return next;
    });

    sendPayloadToSheet(sheetUrl, {
      type: 'siswa',
      ...updatedStudent,
    });
    showToast(`Data siswa ${updatedStudent.nama} berhasil diperbarui.`);
  };

  const handleDeleteStudent = (id: string) => {
    setStudents((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveLocalSiswa(next);
      return next;
    });
  };

  const handleRecordAttendance = (record: AbsensiRecord) => {
    setAttendanceLogs((prev) => {
      const filtered = prev.filter((a) => a.id !== record.id);
      const updated = [record, ...filtered];
      saveLocalAbsensi(updated);
      return updated;
    });

    sendPayloadToSheet(sheetUrl, {
      type: 'absensi',
      ...record,
    });
  };

  const handleUpdateStatus = (studentId: string, status: AttendanceStatus) => {
    const student = students.find((s) => String(s.id) === String(studentId));
    if (!student) return;

    const today = getTodayDateString();
    const existing = attendanceLogs.find(
      (a) => String(a.siswaId) === String(studentId) && a.tanggal === today
    );

    const updated: AbsensiRecord = {
      id: existing?.id || 'ABS-' + Date.now(),
      siswaId: student.id,
      nama: student.nama,
      kelas: student.kelas,
      tanggal: today,
      jamDatang: existing?.jamDatang || (status === 'Hadir' ? getCurrentTimeString() : '-'),
      jamPulang: existing?.jamPulang || '-',
      status: status,
    };

    handleRecordAttendance(updated);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4">
        <LoginScreen onLoginSuccess={() => setIsLoggedIn(true)} />
        {toastMessage && (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-blue-600 text-white px-4 py-3 rounded-xl shadow-2xl border border-blue-400/30 text-xs font-semibold animate-fadeIn">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center pb-12 selection:bg-blue-500 selection:text-white">
      {/* Container */}
      <div className="w-full max-w-3xl px-4 pt-6 space-y-4">
        {/* App Header */}
        <Header
          isMuted={isMuted}
          onToggleSound={handleToggleSound}
          onOpenScriptModal={() => setIsScriptModalOpen(true)}
          onLogout={handleLogout}
        />

        {/* Tab Navigation */}
        <nav className="bg-slate-900 p-1.5 rounded-2xl border border-slate-800 flex items-center gap-1 shadow-lg">
          <button
            onClick={() => setActiveTab('pendaftaran')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'pendaftaran'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Pendaftaran</span>
          </button>

          <button
            onClick={() => setActiveTab('absensi')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'absensi'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scan className="w-4 h-4" />
            <span>Absensi Wajah</span>
          </button>

          <button
            onClick={() => setActiveTab('rekap')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'rekap'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Rekap Bulanan</span>
          </button>
        </nav>

        {/* Active Tab View */}
        {activeTab === 'pendaftaran' && (
          <RegistrationTab
            students={students}
            onAddStudent={handleAddStudent}
            onEditStudent={(s) => setEditingSiswa(s)}
            onDeleteStudent={handleDeleteStudent}
            sheetUrl={sheetUrl}
            setSheetUrl={handleSetSheetUrl}
            onPullFromSheet={() => handlePullFromSheet(false)}
            onOpenScriptModal={() => setIsScriptModalOpen(true)}
            showToast={showToast}
          />
        )}

        {activeTab === 'absensi' && (
          <AttendanceTab
            students={students}
            attendanceLogs={attendanceLogs}
            onRecordAttendance={handleRecordAttendance}
            onUpdateStatus={handleUpdateStatus}
            onPullFromSheet={() => handlePullFromSheet(false)}
            showToast={showToast}
          />
        )}

        {activeTab === 'rekap' && (
          <RekapTab
            students={students}
            attendanceLogs={attendanceLogs}
            showToast={showToast}
          />
        )}
      </div>

      {/* Script Modal */}
      <ScriptModal
        isOpen={isScriptModalOpen}
        onClose={() => setIsScriptModalOpen(false)}
      />

      {/* Edit Student Modal */}
      <EditSiswaModal
        siswa={editingSiswa}
        isOpen={!!editingSiswa}
        onClose={() => setEditingSiswa(null)}
        onSave={handleEditStudent}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-slate-900 border border-blue-500/50 text-white px-4 py-3 rounded-2xl shadow-2xl text-xs sm:text-sm font-medium animate-fadeIn backdrop-blur-md">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
