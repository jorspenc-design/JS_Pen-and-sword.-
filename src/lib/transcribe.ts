// Decodes an audio/video file to 16 kHz mono and hands it to the Whisper worker.

export const WHISPER_MODELS = [
  { id: 'Xenova/whisper-base.en', label: 'Quick (English)', size: '≈ 80 MB' },
  { id: 'Xenova/whisper-small.en', label: 'Accurate (English)', size: '≈ 250 MB' },
  { id: 'Xenova/whisper-small', label: 'Accurate (multilingual)', size: '≈ 250 MB' },
];

export async function decodeTo16kMono(file: Blob): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buf);
  await ctx.close();
  const length = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, length, 16000);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

export interface TranscribeEvents {
  onStatus: (message: string, progress?: number) => void;
}

export function transcribe(audio: Float32Array, model: string, language: string, ev: TranscribeEvents): { promise: Promise<string>; cancel: () => void } {
  const worker = new Worker(new URL('../workers/transcribe.worker.ts', import.meta.url), { type: 'module' });
  const promise = new Promise<string>((resolve, reject) => {
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'status') ev.onStatus(m.message);
      else if (m.type === 'progress') ev.onStatus(m.message, m.value);
      else if (m.type === 'done') { resolve(m.text); worker.terminate(); }
      else if (m.type === 'error') { reject(new Error(m.message)); worker.terminate(); }
    };
    worker.onerror = (e) => { reject(new Error(e.message || 'Transcription failed')); worker.terminate(); };
  });
  worker.postMessage({ audio, model, language }, [audio.buffer]);
  return { promise, cancel: () => worker.terminate() };
}

/** Breaks a raw transcript into readable paragraphs (~5 sentences each). */
export function transcriptToParagraphs(text: string): string[] {
  const sentences = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/);
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 5) paras.push(sentences.slice(i, i + 5).join(' '));
  return paras.filter(Boolean);
}
