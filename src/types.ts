export type AttendanceStatus = 'Hadir' | 'Sakit' | 'Izin' | 'Alpa';

export interface Siswa {
  id: string;
  nama: string;
  kelas: string;
  fotoWajah: string; // Base64 data URL
  createdAt: string;
}

export interface AbsensiRecord {
  id: string;
  siswaId: string;
  nama: string;
  kelas: string;
  tanggal: string; // YYYY-MM-DD
  jamDatang: string; // HH:mm or '-'
  jamPulang: string; // HH:mm or '-'
  status: AttendanceStatus;
}

export interface FaceDescriptorCache {
  siswa: Siswa;
  descriptor: Float32Array;
  descriptorMirrored: Float32Array;
}
