import { useState } from 'react';
import { Modal, errorMessage } from '../../components/ui';
import type { Session, Settings } from '../../core/models';
import { addManual, type ScanResult } from '../../core/scan-engine';
export function ManualDialog({
  session,
  settings,
  onClose,
  onResult,
}: {
  session: Session;
  settings: Settings;
  onClose: () => void;
  onResult: (result: ScanResult) => void;
}) {
  const [code, setCode] = useState(''),
    [address, setAddress] = useState(session.activeAddress),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <Modal title="Entrada manual" onClose={onClose}>
      <p className="helper">
        Transcreva exatamente o que está na etiqueta. Não complete códigos
        ilegíveis.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onResult(await addManual(session.id, code, address, settings));
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Código do Produto
          <input
            autoFocus
            className="mono"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={128}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        <label>
          Endereço
          <input
            className="mono"
            required
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={128}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Adicionar registro'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
