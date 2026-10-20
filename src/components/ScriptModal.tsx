import React, { useState } from 'react';
import { X, Copy, Check, FileSpreadsheet, ExternalLink } from 'lucide-react';
import { APPS_SCRIPT_TEMPLATE } from '../utils/sheets';

interface ScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ScriptModal: React.FC<ScriptModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-5 space-y-4 max-h-[85vh] overflow-y-auto relative shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm sm:text-base font-bold text-white">
              Integrasi Google Sheets &amp; Apps Script
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-300">
          <p>
            Gunakan skrip Google Apps Script berikut di Google Spreadsheet Anda untuk mengaktifkan sinkronisasi otomatis kehadiran dan database siswa:
          </p>

          <ol className="list-decimal list-inside space-y-1 text-slate-400 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50">
            <li>Buka Spreadsheet Anda di Google Drive.</li>
            <li>Klik menu <b className="text-white">Ekstensi (Extensions)</b> &rarr; <b className="text-white">Apps Script</b>.</li>
            <li>Hapus semua kode lama, lalu tempel kode di bawah ini.</li>
            <li>Klik tombol <b className="text-white">Terapkan (Deploy)</b> &rarr; <b className="text-white">Deployment Baru (New deployment)</b>.</li>
            <li>Pilih jenis <b className="text-white">Aplikasi Web (Web app)</b>.</li>
            <li>Setel <b className="text-white">Who has access: Anyone</b> (Siapa saja).</li>
            <li>Salin URL Web App yang berakhiran <code className="text-emerald-300 bg-slate-900 px-1 py-0.5 rounded">/exec</code> lalu tempel di kolom URL aplikasi.</li>
          </ol>
        </div>

        <div className="relative">
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-[11px] font-semibold text-slate-400">Kode Google Apps Script:</span>
            <button
              onClick={handleCopy}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Semua Kode'}</span>
            </button>
          </div>
          <textarea
            readOnly
            value={APPS_SCRIPT_TEMPLATE}
            className="w-full h-56 bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] font-mono text-emerald-400 focus:outline-none select-all"
          />
        </div>

        <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
          <a
            href="https://script.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
          >
            <span>Buka Google Apps Script</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
