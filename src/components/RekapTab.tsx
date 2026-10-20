import React, { useState } from 'react';
import { FileSpreadsheet, Download, Calendar, Filter, Users } from 'lucide-react';
import { Siswa, AbsensiRecord } from '../types';
import { exportRekapToExcel, exportRekapToCSV, getTodayDateString } from '../utils/sheets';

interface RekapTabProps {
  students: Siswa[];
  attendanceLogs: AbsensiRecord[];
  showToast: (msg: string) => void;
}

export const RekapTab: React.FC<RekapTabProps> = ({
  students,
  attendanceLogs,
  showToast,
}) => {
  const currentMonthStr = getTodayDateString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedClass, setSelectedClass] = useState('');

  const availableClasses = Array.from(new Set(students.map((s) => s.kelas).filter(Boolean))).sort();

  const filteredStudents = selectedClass
    ? students.filter((s) => s.kelas === selectedClass)
    : students;

  const handleExportExcel = () => {
    try {
      exportRekapToExcel(students, attendanceLogs, selectedMonth, selectedClass);
      showToast('Export Excel berhasil diunduh!');
    } catch (e) {
      console.error(e);
      showToast('Gagal mengekspor file Excel.');
    }
  };

  const handleExportCSV = () => {
    try {
      exportRekapToCSV(students, attendanceLogs, selectedMonth, selectedClass);
      showToast('Export CSV berhasil diunduh! Siap dibuka di Excel / Google Sheets.');
    } catch (e) {
      console.error(e);
      showToast('Gagal mengekspor file CSV.');
    }
  };

  return (
    <section className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-sm sm:text-base font-bold text-white">
              Rekapitulasi Kehadiran Bulanan
            </h2>
            <p className="text-[11px] text-slate-400">
              Pantau akumulasi kehadiran seluruh siswa dan unduh laporannya.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            >
              <option value="" className="bg-slate-900">Semua Kelas</option>
              {availableClasses.map((c) => (
                <option key={c} value={c} className="bg-slate-900">
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-white focus:outline-none"
            />
          </div>

          <button
            onClick={handleExportCSV}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-blue-600/30 cursor-pointer"
            title="Unduh laporan kehadiran bulanan format CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleExportExcel}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-md shadow-emerald-600/30 cursor-pointer"
            title="Unduh laporan kehadiran bulanan format Microsoft Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Recap List */}
      <div className="space-y-2.5">
        {filteredStudents.length > 0 ? (
          filteredStudents.map((s) => {
            const logs = attendanceLogs.filter((a) => {
              const matchSiswa =
                String(a.siswaId) === String(s.id) ||
                a.nama.toLowerCase().trim() === s.nama.toLowerCase().trim();
              const matchMonth = !selectedMonth || a.tanggal.startsWith(selectedMonth);
              return matchSiswa && matchMonth;
            });

            const hadirCount = logs.filter(
              (a) => a.status === 'Hadir' || (a.jamDatang && a.jamDatang !== '-')
            ).length;
            const sakitCount = logs.filter((a) => a.status === 'Sakit').length;
            const izinCount = logs.filter((a) => a.status === 'Izin').length;
            const alpaCount = logs.filter((a) => a.status === 'Alpa').length;

            return (
              <div
                key={s.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row justify-between sm:items-center gap-3 hover:border-slate-700 transition shadow"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                    {s.fotoWajah ? (
                      <img src={s.fotoWajah} alt={s.nama} className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-white">{s.nama}</div>
                    <div className="text-[11px] text-slate-400">
                      {s.kelas} &bull; <span className="font-mono text-[10px]">{s.id}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs bg-slate-950/70 p-2 sm:p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300">
                    Hadir: <b className="text-emerald-400 font-mono">{hadirCount}</b>
                  </span>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-slate-300">
                    Sakit: <b className="text-amber-400 font-mono">{sakitCount}</b>
                  </span>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-slate-300">
                    Izin: <b className="text-blue-400 font-mono">{izinCount}</b>
                  </span>
                  <span className="text-slate-600">&bull;</span>
                  <span className="text-slate-300">
                    Alpa: <b className="text-rose-400 font-mono">{alpaCount}</b>
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-8 text-xs text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
            Tidak ada siswa ditemukan untuk filter ini.
          </div>
        )}
      </div>
    </section>
  );
};
