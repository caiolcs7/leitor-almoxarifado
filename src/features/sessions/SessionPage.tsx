import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ClipboardList,
  Download,
  MapPin,
  PencilLine,
  ScanLine,
  Undo2,
  AlertTriangle,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  db,
  removeRecords,
  restoreRecords,
  updateSession,
} from '../../core/database';
import type { Session, Settings, Source } from '../../core/models';
import {
  confirmDuplicate,
  processScan,
  type DuplicateCandidate,
  type ScanResult,
} from '../../core/scan-engine';
import { statistics } from '../../core/statistics';
import {
  errorMessage,
  Loading,
  Modal,
  navigate,
  useNotice,
  useTask,
} from '../../components/ui';
import { ScannerPanel } from '../scanner/ScannerPanel';
import { ManualDialog } from '../scanner/ManualDialog';
import { ExportDialog } from '../export/ExportDialog';
import { RecordsView } from '../records/RecordsView';
import { feedback } from '../../services/feedback';

export function SessionPage({
  id,
  view,
  settings,
}: {
  id: string;
  view: string;
  settings: Settings;
}) {
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const records = useLiveQuery(
    () => db.records.where('sessionId').equals(id).sortBy('order'),
    [id],
  );
  const [manual, setManual] = useState(false),
    [exporting, setExporting] = useState(false),
    [finishing, setFinishing] = useState(false),
    [last, setLast] = useState<ScanResult | null>(null),
    [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null),
    [resolvingDuplicate, setResolvingDuplicate] = useState(false);
  const pendingDuplicate = useRef<DuplicateCandidate | null>(null),
    scanQueue = useRef(Promise.resolve()),
    duplicateLock = useRef(false);
  const notice = useNotice(),
    task = useTask();
  const blocked = manual || exporting || finishing || !!duplicate;
  function result(scan: ScanResult) {
    setLast(scan);
    feedback(scan.kind, settings);
    if (scan.duplicate) {
      pendingDuplicate.current = scan.duplicate;
      setDuplicate(scan.duplicate);
    }
  }
  async function receive(raw: string, source: Source) {
    scanQueue.current = scanQueue.current.then(async () => {
      if (pendingDuplicate.current) {
        notice(
          'Leitura pausada: resolva o aviso de repetição e leia a próxima etiqueta novamente.',
        );
        return;
      }
      try {
        result(await processScan(id, raw, source, settings));
      } catch (error) {
        notice(errorMessage(error), 'error');
      }
    });
    await scanQueue.current;
  }
  async function resolveRepeat(add: boolean) {
    const candidate = pendingDuplicate.current;
    if (!candidate || duplicateLock.current) return;
    duplicateLock.current = true;
    setResolvingDuplicate(true);
    try {
      if (add) result(await confirmDuplicate(candidate, settings));
      else {
        if (candidate.paired)
          await db.sessions.update(id, {
            pending: null,
            updatedAt: Date.now(),
          });
        setLast({
          kind: 'waiting',
          message: 'Repetição ignorada. Continue a leitura.',
        });
      }
      pendingDuplicate.current = null;
      setDuplicate(null);
    } finally {
      duplicateLock.current = false;
      setResolvingDuplicate(false);
    }
  }
  async function undo() {
    if (session?.status === 'archived') {
      notice('Desarquive o levantamento antes de editar.');
      return;
    }
    const latest = await db.records
      .where('[sessionId+order]')
      .between([id, 0], [id, Infinity])
      .last();
    if (!latest) {
      notice('Nenhum registro para desfazer.');
      return;
    }
    const removed = await removeRecords(id, [latest.id]);
    notice('Último registro removido.', 'info', {
      label: 'Restaurar',
      run: () => void task(() => restoreRecords(removed)),
    });
  }
  const actions = useRef({ undo, export: () => setExporting(true) });
  actions.current = { undo, export: () => setExporting(true) };
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable]',
        ) ||
        document.querySelector('dialog[open]')
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void actions.current.undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        actions.current.export();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        navigate(`/session/${id}/records`);
        setTimeout(
          () =>
            document.querySelector<HTMLInputElement>('#record-search')?.focus(),
          100,
        );
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [id]);
  if (!records) return <Loading />;
  if (!session)
    return (
      <main className="page">
        <h1>Levantamento não encontrado</h1>
        <p>Ele pode ter sido excluído neste dispositivo.</p>
        <button onClick={() => navigate('/')}>
          <ArrowLeft />
          Voltar aos levantamentos
        </button>
      </main>
    );
  const stats = statistics(records),
    currentCount = records.filter(
      (r) => r.address === session.activeAddress,
    ).length;
  const scanner = view !== 'records' && session.status !== 'archived';
  return (
    <main className="session-page page">
      <button className="back-link" onClick={() => navigate('/')}>
        <ArrowLeft />
        Levantamentos
      </button>
      <div className="page-heading session-heading">
        <div>
          <h1>{session.name}</h1>
          <p>
            {stats.total} registros <span>·</span> {stats.addresses} endereços{' '}
            <span>·</span> {stats.streets} ruas
          </p>
        </div>
        <div className="heading-actions">
          <button
            aria-label="Exportar levantamento"
            onClick={() => setExporting(true)}
          >
            <Download />
            <span>Exportar</span>
          </button>
          <button
            className="primary"
            aria-label="Finalizar levantamento"
            disabled={session.status === 'archived'}
            onClick={() => setFinishing(true)}
          >
            <CheckCheck />
            <span>Finalizar</span>
          </button>
        </div>
      </div>
      <div className="session-tabs tabs">
        <button
          className={scanner ? 'selected' : ''}
          disabled={session.status === 'archived'}
          onClick={() => navigate(`/session/${id}/scanner`)}
        >
          <ScanLine />
          Leitura
        </button>
        <button
          className={!scanner ? 'selected' : ''}
          onClick={() => navigate(`/session/${id}/records`)}
        >
          <ClipboardList />
          Registros <span>{records.length}</span>
        </button>
        <span className="saved-indicator">
          <Check />
          Salvo no dispositivo
        </span>
      </div>
      {scanner ? (
        <>
          <div className="workspace">
            <div className="active-address">
              <div className="address-heading">
                <span>
                  <MapPin />
                  Endereço atual
                </span>
                {session.activeAddress && (
                  <button
                    className="icon-button"
                    aria-label="Marcar endereço como concluído"
                    aria-pressed={session.completedAddresses.includes(
                      session.activeAddress,
                    )}
                    onClick={() =>
                      void task(() =>
                        updateSession(id, {
                          completedAddresses:
                            session.completedAddresses.includes(
                              session.activeAddress,
                            )
                              ? session.completedAddresses.filter(
                                  (a) => a !== session.activeAddress,
                                )
                              : [
                                  ...session.completedAddresses,
                                  session.activeAddress,
                                ],
                        }),
                      )
                    }
                  >
                    <CheckCircle2 />
                  </button>
                )}
              </div>
              <strong
                className={`address-value mono ${!session.activeAddress ? 'no-address' : ''}`}
              >
                {session.activeAddress || 'Leia um endereço'}
              </strong>
              <div className="address-detail">
                <span>
                  {session.activeAddress
                    ? `${currentCount} itens neste endereço`
                    : 'Depois, leia os produtos desta posição.'}
                </span>
                {session.completedAddresses.includes(session.activeAddress) && (
                  <span className="completed-label">
                    <Check />
                    Concluído
                  </span>
                )}
              </div>
              <div className="mode-select">
                <label htmlFor="session-mode">Modo de leitura</label>
                <select
                  id="session-mode"
                  value={session.mode}
                  disabled={!!duplicate}
                  onChange={(e) =>
                    void task(() =>
                      updateSession(id, {
                        mode: e.target.value as Session['mode'],
                      }),
                    )
                  }
                >
                  <option value="fixed">Endereço fixo</option>
                  <option value="product-address">
                    Pareado · produto → endereço
                  </option>
                  <option value="address-product">
                    Pareado · endereço → produto
                  </option>
                </select>
              </div>
              {session.mode !== 'fixed' && (
                <div className="pair-status">
                  <strong>{expected(session)}</strong>
                  {session.pending && (
                    <>
                      <code>{session.pending.value}</code>
                      <button
                        onClick={() =>
                          void task(() =>
                            db.sessions.update(id, {
                              pending: null,
                              updatedAt: Date.now(),
                            }),
                          )
                        }
                      >
                        <X />
                        Cancelar par
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="operation-feedback">
              <div
                className={`scan-feedback ${last?.kind ?? 'ready'}`}
                role="status"
                aria-live="polite"
              >
                {last?.kind === 'error' ? (
                  <AlertTriangle />
                ) : last?.kind === 'product' ? (
                  <CheckCircle2 />
                ) : (
                  <ScanLine />
                )}
                <div>
                  <strong>
                    {last?.message ?? 'Seu levantamento está pronto'}
                  </strong>
                  {last?.value ? (
                    <code>{last.value}</code>
                  ) : (
                    <p>Um endereço. Vários produtos. Sem confirmações.</p>
                  )}
                </div>
              </div>
              {duplicate && (
                <div className="duplicate-warning" role="alert">
                  <strong>Este item já foi registrado neste endereço.</strong>
                  <code>{duplicate.code}</code>
                  <code>{duplicate.address}</code>
                  <div>
                    <button
                      disabled={resolvingDuplicate}
                      onClick={() => void task(() => resolveRepeat(false))}
                    >
                      Ignorar
                    </button>
                    <button
                      className="primary"
                      disabled={resolvingDuplicate}
                      onClick={() => void task(() => resolveRepeat(true))}
                    >
                      Adicionar novamente
                    </button>
                  </div>
                </div>
              )}
            </div>
            <ScannerPanel
              settings={settings}
              blocked={blocked}
              onScan={receive}
            />
            <div className="scan-side">
              <div className="quick-actions">
                <button onClick={() => setManual(true)} disabled={!!duplicate}>
                  <PencilLine />
                  Entrada manual
                </button>
                <button
                  onClick={() => void task(undo)}
                  disabled={!records.length}
                >
                  <Undo2 />
                  Desfazer
                </button>
              </div>
              <div className="recent-scans">
                <div className="section-heading">
                  <h2>Últimos registros</h2>
                  <span>{records.length} no total</span>
                </div>
                {records.length ? (
                  <ol>
                    {records
                      .slice(-4)
                      .reverse()
                      .map((record) => (
                        <li key={record.id}>
                          <Check />
                          <div>
                            <code>{record.code}</code>
                            <span className="mono">{record.address}</span>
                          </div>
                          <span className="scan-order">
                            {record.order.toString().padStart(2, '0')}
                          </span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="recent-empty">
                    Os produtos aparecem aqui assim que forem registrados.
                  </p>
                )}
                <button
                  className="text-button"
                  onClick={() => navigate(`/session/${id}/records`)}
                >
                  Ver todos os registros
                  <ClipboardList />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <RecordsView session={session} records={records} settings={settings} />
      )}
      {manual && (
        <ManualDialog
          session={session}
          settings={settings}
          onClose={() => setManual(false)}
          onResult={result}
        />
      )}{' '}
      {exporting && (
        <ExportDialog
          session={session}
          defaultFormat={settings.exportFormat}
          onClose={() => setExporting(false)}
        />
      )}{' '}
      {finishing && (
        <Modal
          title="Finalizar levantamento"
          onClose={() => setFinishing(false)}
        >
          <p>Confira o resumo de {session.name}.</p>
          <dl className="finish-stats">
            <div>
              <dt>Produtos registrados</dt>
              <dd>{stats.total}</dd>
            </div>
            <div>
              <dt>Endereços encontrados</dt>
              <dd>{stats.addresses}</dd>
            </div>
            <div>
              <dt>Ruas encontradas</dt>
              <dd>{stats.streets}</dd>
            </div>
            <div>
              <dt>Possíveis duplicados</dt>
              <dd>{stats.duplicates}</dd>
            </div>
          </dl>
          {session.pending && (
            <p className="form-error">
              Há um par incompleto. Conclua ou cancele o par antes de finalizar.
            </p>
          )}
          <div className="modal-actions wrap">
            <button onClick={() => setFinishing(false)}>
              Continuar editando
            </button>
            <button
              onClick={() => {
                setFinishing(false);
                setExporting(true);
              }}
            >
              <Download />
              Exportar Excel
            </button>
            <button
              className="primary"
              disabled={!!session.pending}
              onClick={() =>
                void task(async () => {
                  await updateSession(id, { status: 'completed' });
                  setFinishing(false);
                  navigate('/');
                  notice('Levantamento concluído e salvo.', 'success');
                })
              }
            >
              <Check />
              Concluir
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
function expected(session: Session) {
  const type = session.pending
    ? session.pending.type === 'product'
      ? 'endereço'
      : 'produto'
    : session.mode === 'product-address'
      ? 'produto'
      : 'endereço';
  return `Aguardando ${type}`;
}
