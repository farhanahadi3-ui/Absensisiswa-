import React from 'react';
import { Volume2, VolumeX, FileSpreadsheet, LogOut, ShieldCheck } from 'lucide-react';

interface HeaderProps {
  isMuted: boolean;
  onToggleSound: () => void;
  onOpenScriptModal: () => void;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  isMuted,
  onToggleSound,
  onOpenScriptModal,
  onLogout,
}) => {
  return (
    <header className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-inner">
          <ShieldCheck className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm sm:text-base font-bold text-white tracking-wide">
              SMK FAJAR INDAH
            </h1>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Absensi AI
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400">
            Sistem Presensi Pemindaian Wajah &amp; Sinkronisasi Spreadsheet
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSound}
          className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-center border transition ${
            isMuted
              ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border-rose-500/30'
              : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border-blue-500/30'
          }`}
          title={isMuted ? 'Suara Dinonaktifkan (Klik untuk bunyikan)' : 'Suara Aktif (Klik untuk bisukan)'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          onClick={onOpenScriptModal}
          className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Setup Google Sheets</span>
        </button>

        <button
          onClick={onLogout}
          className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Keluar</span>
        </button>
      </div>
    </header>
  );
};
