// Audio synthesizer & Indonesian SpeechSynthesis voice narrator

let isMuted = false;

export function getAudioMuted(): boolean {
  return isMuted;
}

export function setAudioMuted(val: boolean): void {
  isMuted = val;
  if (isMuted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function toggleAudio(): boolean {
  setAudioMuted(!isMuted);
  return isMuted;
}

export function playBeep(freq1: number, freq2?: number): void {
  if (isMuted || typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';

    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    if (freq2) {
      osc.frequency.setValueAtTime(freq2, ctx.currentTime + 0.12);
    }

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio playback not allowed or failed:', err);
  }
}

export function speakText(text: string): void {
  if (isMuted || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'id-ID';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const idVoice = voices.find(v => v.lang.includes('id') || v.lang.includes('ID'));
    if (idVoice) {
      utterance.voice = idVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech synthesis failed:', e);
  }
}

export function playDatangSound(namaSiswa = ''): void {
  playBeep(587.33, 880.0);
  if (namaSiswa) {
    setTimeout(() => speakText(`${namaSiswa}, absen datang berhasil dicatat.`), 350);
  } else {
    setTimeout(() => speakText('Absen datang berhasil dicatat.'), 350);
  }
}

export function playPulangSound(namaSiswa = ''): void {
  playBeep(880.0, 587.33);
  if (namaSiswa) {
    setTimeout(() => speakText(`${namaSiswa}, absen pulang berhasil dicatat. Hati-hati di jalan.`), 350);
  } else {
    setTimeout(() => speakText('Absen pulang berhasil dicatat.'), 350);
  }
}

export function playRegSound(namaSiswa = ''): void {
  playBeep(523.25, 659.25);
  if (namaSiswa) {
    setTimeout(() => speakText(`Pendaftaran ${namaSiswa} berhasil disimpan.`), 350);
  } else {
    setTimeout(() => speakText('Pendaftaran siswa baru berhasil.'), 350);
  }
}
