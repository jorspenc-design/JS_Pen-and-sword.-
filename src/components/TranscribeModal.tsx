import { useRef, useState } from 'react';
import { Modal, Progress, Says } from './ui';
import { decodeTo16kMono, transcribe, transcriptToParagraphs, WHISPER_MODELS } from '../lib/transcribe';
import { escapeHtml } from '../lib/util';

type Phase = 'choose' | 'working' | 'review';

export default function TranscribeModal({ open, onClose, onInsert, onNewChapter }: {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string, where: 'cursor' | 'end') => void;
  onNewChapter: (html: string, title: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [file, setFile] = useState<File | null>(null);
  const [model, setModel] = useState(WHISPER_MODELS[0].id);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const cancelRef = useRef<() => void>(() => {});

  const reset = () => {
    cancelRef.current();
    setPhase('choose');
    setFile(null);
    setText('');
    setError('');
    setProgress(undefined);
  };
  const close = () => { reset(); onClose(); };

  async function start() {
    if (!file) return;
    setPhase('working');
    setError('');
    setStatus('Preparing your audio…');
    try {
      const audio = await decodeTo16kMono(file);
      const job = transcribe(audio, model, 'english', { onStatus: (m, p) => { setStatus(m); setProgress(p); } });
      cancelRef.current = job.cancel;
      const result = await job.promise;
      setText(transcriptToParagraphs(result).join('\n\n'));
      setPhase('review');
    } catch (e) {
      setError((e as Error).message);
      setPhase('choose');
    }
  }

  const html = () => text.split(/\n\s*\n/).filter((p) => p.trim()).map((p) => `<p>${escapeHtml(p.trim())}</p>`).join('');

  return (
    <Modal open={open} onClose={close}>
      <div className="stack lg">
        <div>
          <h2>Transcribe a recording</h2>
          <p className="muted small" style={{ marginTop: '.4rem' }}>
            Voice memos, sermons, interviews, lectures. Wren listens right here in your browser; your audio is never uploaded.
          </p>
        </div>

        {phase === 'choose' && (
          <>
            <label className="card" style={{ padding: '1.5rem', textAlign: 'center', cursor: 'pointer', borderStyle: 'dashed' }}>
              <input type="file" hidden accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? <span className="serif">{file.name}</span> : <span className="muted">Choose an audio or video file</span>}
            </label>
            <div className="stack" style={{ gap: '.4rem' }}>
              {WHISPER_MODELS.map((m) => (
                <label key={m.id} className="check">
                  <input type="radio" name="model" checked={model === m.id} onChange={() => setModel(m.id)} />
                  {m.label} <span className="faint small">{m.size} download, once</span>
                </label>
              ))}
            </div>
            {error && <div className="warn-box">{error}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={!file} onClick={start}>Transcribe</button>
            </div>
          </>
        )}

        {phase === 'working' && (
          <>
            <Says stage="write">{status}</Says>
            {progress !== undefined ? <Progress value={progress} /> : <p className="faint small">Long recordings take a few minutes. You can keep this window open while Wren works.</p>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={reset}>Cancel</button>
            </div>
          </>
        )}

        {phase === 'review' && (
          <>
            <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'var(--serif)', fontSize: '1rem' }} />
            <p className="faint tiny" style={{ margin: 0 }}>Tidy anything you like before adding it. Elias can proofread it later.</p>
            <div className="row wrap" style={{ justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={reset}>Start over</button>
              <button className="btn" onClick={() => { onNewChapter(html(), file?.name.replace(/\.[^.]+$/, '') ?? 'Transcript'); reset(); }}>New chapter</button>
              <button className="btn" onClick={() => { onInsert(html(), 'end'); reset(); }}>Add to end</button>
              <button className="btn primary" onClick={() => { onInsert(html(), 'cursor'); reset(); }}>Insert at cursor</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
