import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { db } from '../../core/database';
import type { Session } from '../../core/models';
import type { ExportOptions } from '../../services/export';
import { Modal, errorMessage, useNotice } from '../../components/ui';
export function ExportDialog({
  session,
  onClose,
  defaultFormat = 'xlsx',
}: {
  session: Session;
  onClose: () => void;
  defaultFormat?: ExportOptions['format'];
}) {
  const [options, setOptions] = useState<ExportOptions>({
    sort: 'order',
    splitStreets: false,
    format: defaultFormat,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const notice = useNotice();
  return (
    <Modal title="Exportar levantamento" onClose={onClose}>
      <div className="export-summary">
        <FileSpreadsheet size={32} />
        <div>
          <strong>{session.name}</strong>
          <p>{session.count} registros · 2 colunas de dados</p>
        </div>
      </div>
      <label>
        Ordenar registros
        <select
          value={options.sort}
          onChange={(e) =>
            setOptions({
              ...options,
              sort: e.target.value as ExportOptions['sort'],
            })
          }
        >
          <option value="order">Ordem de leitura</option>
          <option value="address">Por endereço</option>
          <option value="code">Por código do produto</option>
        </select>
      </label>
      <label>
        Formato
        <select
          value={options.format}
          onChange={(e) =>
            setOptions({
              ...options,
              format: e.target.value as ExportOptions['format'],
            })
          }
        >
          <option value="xlsx">Excel (.xlsx) — relatório formatado</option>
          <option value="csv">CSV (.csv) — dados em texto</option>
        </select>
      </label>
      {options.format === 'xlsx' && (
        <label className="check">
          <input
            type="checkbox"
            checked={options.splitStreets}
            onChange={(e) =>
              setOptions({ ...options, splitStreets: e.target.checked })
            }
          />
          Separar também em abas por rua
        </label>
      )}
      <p className="helper">
        Código do Produto e Endereço. Seu levantamento continua salvo após a
        exportação.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancelar</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { exportSession } = await import('../../services/export');
              const records = await db.records
                .where('sessionId')
                .equals(session.id)
                .toArray();
              await exportSession(session, records, options);
              notice(
                'Arquivo gerado. Confira os downloads do dispositivo.',
                'success',
              );
              onClose();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download />
          {busy ? 'Gerando arquivo…' : 'Exportar arquivo'}
        </button>
      </div>
    </Modal>
  );
}
