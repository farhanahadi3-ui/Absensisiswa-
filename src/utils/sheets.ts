import * as XLSX from 'xlsx';
import { Siswa, AbsensiRecord } from '../types';

const STORAGE_KEY_SISWA = 'absensi_smk_fajar_indah_siswa';
const STORAGE_KEY_ABSENSI = 'absensi_smk_fajar_indah_log';
const STORAGE_KEY_SHEET_URL = 'saved_sheet_url';

export const APPS_SCRIPT_TEMPLATE = `const SPREADSHEET_ID = "1NsKn8c2vLA_YCvAaPKoQLUgdIVLpGcNI4TC4KKRolzc";
const SISWA_HEADERS = ["ID", "Nama Siswa", "Kelas", "Foto Wajah Base64", "Tanggal Daftar"];
const ABSENSI_HEADERS = ["ID Absensi", "ID Siswa", "Nama", "Kelas", "Tanggal", "Jam Datang", "Jam Pulang", "Status"];

function spreadsheet_() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function sheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function dateText_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var s = String(v == null ? "" : v).trim();
  var iso = s.match(/^(\\d{4}-\\d{2}-\\d{2})/); if (iso) return iso[1];
  var d = s.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})$/);
  if (d) return d[3] + "-" + ("0" + d[2]).slice(-2) + "-" + ("0" + d[1]).slice(-2);
  return s;
}
function timeText_(v) {
  if (v === "" || v == null || v === "-") return "-";
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, Session.getScriptTimeZone(), "HH:mm");
  if (typeof v === "number" && v >= 0 && v < 1) {
    var mins = Math.round(v * 1440);
    return ("0" + (Math.floor(mins / 60) % 24)).slice(-2) + ":" + ("0" + (mins % 60)).slice(-2);
  }
  return String(v).replace(/^'/, "").trim() || "-";
}
function output_(data, e) {
  var cb = e && e.parameter ? String(e.parameter.callback || "") : "";
  if (cb) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,80}$/.test(cb)) {
      return ContentService.createTextOutput(JSON.stringify({status:"error", message:"Callback tidak valid"})).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(cb + "(" + JSON.stringify(data) + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function doGet(e) {
  try {
    var ss = spreadsheet_();
    var siswa = sheet_(ss, "Data_Siswa", SISWA_HEADERS);
    var absensi = sheet_(ss, "Data_Absensi", ABSENSI_HEADERS);
    var siswaValues = siswa.getLastRow() > 1 ? siswa.getRange(2, 1, siswa.getLastRow()-1, 5).getValues() : [];
    var absensiValues = absensi.getLastRow() > 1 ? absensi.getRange(2, 1, absensi.getLastRow()-1, 8).getValues() : [];
    var siswaData = siswaValues.filter(function(r){ return String(r[0] || "").trim() !== ""; }).map(function(r){
      return {id:String(r[0] || "").trim(), nama:String(r[1] || "").trim(), kelas:String(r[2] || "").trim(), fotoWajah:String(r[3] || ""), createdAt:r[4] instanceof Date ? r[4].toISOString() : String(r[4] || "")};
    });
    var absensiData = absensiValues.filter(function(r){ return String(r[0] || r[1] || "").trim() !== ""; }).map(function(r){
      return {id:String(r[0] || "").trim(), siswaId:String(r[1] || "").trim(), nama:String(r[2] || "").trim(), kelas:String(r[3] || "").trim(), tanggal:dateText_(r[4]), jamDatang:timeText_(r[5]), jamPulang:timeText_(r[6]), status:String(r[7] || "Hadir").trim()};
    });
    return output_({status:"success", message:"Koneksi Google Sheets berhasil", siswaData:siswaData, absensiData:absensiData, totalSiswa:siswaData.length, totalAbsensi:absensiData.length, today:Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd")}, e);
  } catch (err) { return output_({status:"error", message:String(err)}, e); }
}
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (!e || !e.postData || !e.postData.contents) throw new Error("Data kiriman kosong.");
    var data = JSON.parse(e.postData.contents);
    var ss = spreadsheet_();
    if (data.type === "siswa") {
      if (!data.id || !String(data.nama || "").trim() || !String(data.kelas || "").trim()) throw new Error("ID, nama, dan kelas siswa wajib diisi.");
      var sh = sheet_(ss, "Data_Siswa", SISWA_HEADERS);
      var photo = String(data.fotoWajah || "");
      if (photo.length > 49000) throw new Error("Foto terlalu besar untuk satu sel Google Sheets.");
      var last = sh.getLastRow(), rowNum = 0;
      if (last > 1) {
        var ids = sh.getRange(2,1,last-1,1).getDisplayValues();
        for (var i=0;i<ids.length;i++) if (String(ids[i][0]).trim() === String(data.id).trim()) { rowNum=i+2; break; }
      }
      var old = rowNum ? sh.getRange(rowNum,1,1,5).getValues()[0] : [];
      var row = [String(data.id), String(data.nama).trim(), String(data.kelas).trim(), photo || old[3] || "", data.createdAt || old[4] || new Date()];
      if (rowNum) sh.getRange(rowNum,1,1,5).setValues([row]); else sh.appendRow(row);
      return output_({status:"success", message:"Data siswa berhasil disimpan", id:String(data.id)}, null);
    }
    if (data.type === "absensi") {
      if (!data.siswaId || !data.tanggal) throw new Error("ID siswa dan tanggal absensi wajib diisi.");
      var as = sheet_(ss, "Data_Absensi", ABSENSI_HEADERS);
      var targetDate = dateText_(data.tanggal), lastA=as.getLastRow(), target=0, oldA=[];
      if (lastA > 1) {
        var rows=as.getRange(2,1,lastA-1,8).getValues();
        for (var j=0;j<rows.length;j++) if (String(rows[j][1] || "").trim()===String(data.siswaId).trim() && dateText_(rows[j][4])===targetDate) { target=j+2; oldA=rows[j]; break; }
      }
      var datang = (data.jamDatang && data.jamDatang !== "-") ? data.jamDatang : (oldA[5] || "-");
      var pulang = (data.jamPulang && data.jamPulang !== "-") ? data.jamPulang : (oldA[6] || "-");
      var rowA=[data.id || oldA[0] || ("ABS-"+Date.now()), String(data.siswaId), data.nama || oldA[2] || "", data.kelas || oldA[3] || "", targetDate, datang, pulang, data.status || oldA[7] || "Hadir"];
      if (target) as.getRange(target,1,1,8).setValues([rowA]); else as.appendRow(rowA);
      return output_({status:"success", message:"Data absensi berhasil disimpan", id:String(rowA[0])}, null);
    }
    throw new Error("Jenis data tidak dikenal.");
  } catch (err) { return output_({status:"error", message:String(err)}, null); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}`;

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentTimeString(): string {
  const d = new Date();
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function getSavedSheetUrl(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_SHEET_URL) || '';
  } catch {
    return '';
  }
}

export function setSavedSheetUrl(url: string): void {
  try {
    localStorage.setItem(STORAGE_KEY_SHEET_URL, url.trim());
  } catch {}
}

export function loadLocalSiswa(): Siswa[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SISWA);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalSiswa(list: Siswa[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_SISWA, JSON.stringify(list));
  } catch {}
}

export function loadLocalAbsensi(): AbsensiRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ABSENSI);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalAbsensi(list: AbsensiRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_ABSENSI, JSON.stringify(list));
  } catch {}
}

export async function fetchFromSheetJSONP(url: string): Promise<{ siswaData: Siswa[]; absensiData: AbsensiRecord[] }> {
  // 1. Try standard fetch first (CORS allowed on Apps Script redirected responses)
  try {
    const res = await fetch(url, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.status === 'success') {
        return {
          siswaData: Array.isArray(data.siswaData) ? data.siswaData : [],
          absensiData: Array.isArray(data.absensiData) ? data.absensiData : [],
        };
      }
    }
  } catch {
    // Fallback to JSONP if fetch was blocked by CORS
  }

  // 2. Safe JSONP fallback
  return new Promise((resolve, reject) => {
    const callbackName = '__sheetCb_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
    const script = document.createElement('script');
    let finished = false;

    const cleanup = () => {
      try {
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch (_) {}
      try {
        // @ts-expect-error dynamic window prop
        delete window[callbackName];
      } catch (_) {}
    };

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error('Koneksi Google Sheets timeout. Pastikan Web App disetel "Who has access: Anyone".'));
    }, 7000);

    // @ts-expect-error dynamic window callback
    window[callbackName] = (data: { status?: string; message?: string; siswaData?: Siswa[]; absensiData?: AbsensiRecord[] }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      if (!data || data.status !== 'success') {
        reject(new Error(data?.message || 'Respons Google Sheets tidak valid.'));
      } else {
        resolve({
          siswaData: Array.isArray(data.siswaData) ? data.siswaData : [],
          absensiData: Array.isArray(data.absensiData) ? data.absensiData : [],
        });
      }
    };

    script.onerror = (e) => {
      if (typeof e === 'object' && e !== null && 'stopPropagation' in e) {
        (e as Event).stopPropagation();
      }
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error('Gagal menghubungi Google Apps Script. Periksa URL /exec Anda.'));
    };

    try {
      const sep = url.includes('?') ? '&' : '?';
      script.src = `${url}${sep}callback=${encodeURIComponent(callbackName)}&_=${Date.now()}`;
      document.head.appendChild(script);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export async function sendPayloadToSheet(
  url: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!url || !url.startsWith('https://script.google.com/macros/s/')) {
    return; // local only
  }
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn('POST to Apps Script returned with notice (no-cors mode):', err);
  }
}

export function exportRekapToExcel(
  students: Siswa[],
  attendance: AbsensiRecord[],
  selectedMonth: string,
  selectedClass: string
): void {
  const filtered = selectedClass ? students.filter(s => s.kelas === selectedClass) : students;

  const dataRows = filtered.map((s, idx) => {
    const logs = attendance.filter(a => {
      const matchSiswa = String(a.siswaId) === String(s.id) || a.nama.toLowerCase().trim() === s.nama.toLowerCase().trim();
      const matchMonth = !selectedMonth || selectedMonth === 'All' || a.tanggal.startsWith(selectedMonth);
      return matchSiswa && matchMonth;
    });

    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;

    logs.forEach(l => {
      const st = l.status;
      if (st === 'Hadir') hadir++;
      else if (st === 'Sakit') sakit++;
      else if (st === 'Izin') izin++;
      else if (st === 'Alpa') alpa++;
    });

    return {
      'No': idx + 1,
      'ID Siswa': s.id,
      'Nama Siswa': s.nama,
      'Kelas': s.kelas,
      'Hadir (H)': hadir,
      'Sakit (S)': sakit,
      'Izin (I)': izin,
      'Alpa (A)': alpa,
      'Total Kehadiran': hadir + sakit + izin + alpa,
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(dataRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap_Kehadiran');
  const filename = `Rekap_Absensi_SMK_Fajar_Indah_${selectedMonth || 'Semua'}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

export function exportRekapToCSV(
  students: Siswa[],
  attendance: AbsensiRecord[],
  selectedMonth: string,
  selectedClass: string
): void {
  const filtered = selectedClass ? students.filter(s => s.kelas === selectedClass) : students;

  const headers = [
    'No',
    'ID Siswa',
    'Nama Siswa',
    'Kelas',
    'Bulan',
    'Hadir (H)',
    'Sakit (S)',
    'Izin (I)',
    'Alpa (A)',
    'Total Hari Kehadiran',
  ];

  const escapeCSV = (value: string | number) => {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = filtered.map((s, idx) => {
    const logs = attendance.filter(a => {
      const matchSiswa = String(a.siswaId) === String(s.id) || a.nama.toLowerCase().trim() === s.nama.toLowerCase().trim();
      const matchMonth = !selectedMonth || selectedMonth === 'All' || a.tanggal.startsWith(selectedMonth);
      return matchSiswa && matchMonth;
    });

    let hadir = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;

    logs.forEach(l => {
      const st = l.status;
      if (st === 'Hadir') hadir++;
      else if (st === 'Sakit') sakit++;
      else if (st === 'Izin') izin++;
      else if (st === 'Alpa') alpa++;
    });

    const total = hadir + sakit + izin + alpa;

    return [
      idx + 1,
      s.id,
      s.nama,
      s.kelas,
      selectedMonth || 'Semua',
      hadir,
      sakit,
      izin,
      alpa,
      total,
    ].map(escapeCSV).join(',');
  });

  // Include UTF-8 BOM (\uFEFF) so Excel, Google Sheets, and LibreOffice read accents/Indonesian characters properly
  const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Rekap_Absensi_SMK_Fajar_Indah_${selectedMonth || 'Semua'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

