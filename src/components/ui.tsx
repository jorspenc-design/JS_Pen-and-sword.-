import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { persona as getPersona, type Persona, type StageId } from '../personas';

export function Avatar({ p, size = '', title }: { p: Persona; size?: '' | 'sm' | 'lg' | 'xl'; title?: string }) {
  return (
    <span className={`avatar ${size}`} style={{ '--persona': p.color } as CSSProperties} title={title ?? `${p.name}, ${p.role}`}>
      {p.monogram}
    </span>
  );
}

export function PersonaHeader({ stage, children, actions }: { stage: StageId; children?: ReactNode; actions?: ReactNode }) {
  const p = getPersona(stage);
  return (
    <header className="persona-head">
      <Avatar p={p} size="lg" />
      <div className="grow">
        <div className="name">
          {p.name}
          <span className="role">{p.role}</span>
        </div>
        <p className="intro">{children ?? p.intro}</p>
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

/** A short line "spoken" by a helper: used for status, guidance, and empty states. */
export function Says({ stage, children }: { stage: StageId; children: ReactNode }) {
  const p = getPersona(stage);
  return (
    <div className="speech">
      <Avatar p={p} size="sm" />
      <div className="grow">{children}</div>
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>
  );
}

type ToastFn = (msg: string, kind?: 'info' | 'error') => void;
const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: 'info' | 'error' } | null>(null);
  const timer = useRef<number>(undefined);
  const show = useCallback<ToastFn>((msg, kind = 'info') => {
    setToast({ msg, kind });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}

/** Debounced value — used to avoid re-paginating on every keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <span className="faint tiny">{hint}</span>}
    </label>
  );
}

export function NumberInput({ value, onChange, step = 0.05, min, max }: { value: number; onChange: (n: number) => void; step?: number; min?: number; max?: number }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return (
    <input
      type="number"
      value={text}
      step={step}
      min={min}
      max={max}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
  );
}
