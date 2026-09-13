import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, X, AlertCircle, LoaderCircle } from 'lucide-react';
type Tone = 'success' | 'error' | 'info';
type Notice = {
  message: string;
  tone: Tone;
  action?: { label: string; run: () => void };
};
const NoticeContext = createContext<
  (message: string, tone?: Tone, action?: Notice['action']) => void
>(() => {});
export const useNotice = () => useContext(NoticeContext);
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => setNotice(null),
      notice.action ? 10000 : 5500,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <NoticeContext.Provider
      value={(message, tone = 'info', action) =>
        setNotice({ message, tone, action })
      }
    >
      {children}
      {notice && (
        <div
          className={`toast ${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          {notice.tone === 'error' ? (
            <AlertCircle />
          ) : notice.tone === 'success' ? (
            <CheckCircle2 />
          ) : (
            <Info />
          )}
          <span>{notice.message}</span>
          {notice.action && (
            <button
              onClick={() => {
                const action = notice.action;
                setNotice(null);
                action?.run();
              }}
            >
              {notice.action.label}
            </button>
          )}
          <button
            className="icon-button"
            aria-label="Fechar aviso"
            onClick={() => setNotice(null)}
          >
            <X />
          </button>
        </div>
      )}
    </NoticeContext.Provider>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-heading">
        <h2 id="modal-title">{title}</h2>
        <button className="icon-button" aria-label="Fechar" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Confirm({
  title,
  message,
  onClose,
  onConfirm,
  strong,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  strong?: string;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      {strong && (
        <label>
          Digite {strong} para confirmar
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          className="danger"
          disabled={busy || (!!strong && text !== strong)}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm();
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Aguarde…' : 'Confirmar exclusão'}
        </button>
      </div>
    </Modal>
  );
}
export function Loading({ text = 'Carregando…' }: { text?: string }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" />
      {text}
    </div>
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente.';
}
export function useTask() {
  const notice = useNotice();
  return async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (error) {
      notice(errorMessage(error), 'error');
    }
  };
}
export function dateTime(timestamp: number) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp);
}
export function navigate(path: string) {
  window.location.hash = path;
}
