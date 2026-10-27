import { useEffect, useState } from 'react';
import type { ConnectionInfo, Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { SectionCard, Spinner, StatusPill, type Notice } from './shared';

export function ConnectionSection({
  settings,
  save,
  notify,
  reloadBoards,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
  reloadBoards: () => Promise<void>;
}) {
  const [appKey, setAppKey] = useState(settings.appKey);
  const [appToken, setAppToken] = useState(settings.appToken);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);

  useEffect(() => {
    setAppKey(settings.appKey);
    setAppToken(settings.appToken);
  }, [settings.appKey, settings.appToken]);

  const keyForUrl = appKey.trim();
  const tokenUrl = `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=SEI%20Flow&key=${encodeURIComponent(
    keyForUrl || '<APP KEY>',
  )}`;
  const dirty = appKey !== settings.appKey || appToken !== settings.appToken;
  const connected = Boolean(settings.appKey && settings.appToken);

  const openAuthorization = () => {
    if (!keyForUrl) {
      notify({ kind: 'warning', text: 'Informe a APP-KEY antes de autorizar no Trello.' });
      return;
    }
    window.open(tokenUrl, '_blank', 'noopener,noreferrer');
  };

  const saveConnection = async () => {
    setBusy(true);
    try {
      await save({ appKey: appKey.trim(), appToken: appToken.trim() });
      notify({ kind: 'success', text: 'Credenciais salvas neste navegador.' });
      await reloadBoards();
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setConnection(null);
    try {
      if (dirty) {
        await save({ appKey: appKey.trim(), appToken: appToken.trim() });
      }
      const info = await callRpc('settings:test-connection', undefined);
      setConnection(info);
      notify({ kind: 'success', text: `Conectado como ${info.fullName}.` });
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <SectionCard
        title="Conexão com o Trello"
        subtitle="As credenciais ficam apenas no seu navegador e são usadas para falar com a API oficial do Trello."
        icon="settings"
        footer={
          <>
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={() => void saveConnection()}
              disabled={busy || !appKey.trim() || !appToken.trim()}
            >
              {busy ? <Spinner /> : <Icon name="check" size={14} />}
              Salvar credenciais
            </button>
            <button
              type="button"
              className="sfo-btn"
              onClick={() => void testConnection()}
              disabled={testing || !appKey.trim() || !appToken.trim()}
            >
              {testing ? <Spinner /> : <Icon name="refresh" size={14} />}
              Testar conexão
            </button>
            <span style={{ flex: 1 }} />
            {connected ? (
              <StatusPill tone="success">
                <Icon name="check" size={11} />
                Configurado
              </StatusPill>
            ) : (
              <StatusPill tone="warning">
                <Icon name="alert" size={11} />
                Não configurado
              </StatusPill>
            )}
          </>
        }
      >
        <div className="sfo-grid-2">
          <div className="sfo-field">
            <label htmlFor="sfo-app-key">Trello APP-KEY</label>
            <input
              id="sfo-app-key"
              className="sfo-input"
              value={appKey}
              onChange={(event) => setAppKey(event.target.value)}
              placeholder="Sua APP-KEY"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="sfo-field">
            <label htmlFor="sfo-app-token">Trello TOKEN</label>
            <input
              id="sfo-app-token"
              className="sfo-input"
              value={appToken}
              onChange={(event) => setAppToken(event.target.value)}
              placeholder="Seu TOKEN"
              autoComplete="off"
              spellCheck={false}
              type="password"
            />
          </div>
        </div>

        <div className="sfo-alert">
          <Icon name="info" size={16} />
          <div style={{ flex: 1 }}>
            <strong>Como conectar em 3 passos:</strong>
            <ol style={{ margin: '6px 0 10px', paddingLeft: 18 }}>
              <li>
                Abra{' '}
                <a href="https://trello.com/app-key" target="_blank" rel="noreferrer">
                  trello.com/app-key
                </a>
                , copie a <strong>APP-KEY</strong> e cole no campo acima.
              </li>
              <li>Clique em “Autorizar no Trello” e aprove o acesso do SEI Flow.</li>
              <li>
                O Trello exibirá um <strong>TOKEN</strong>. Copie, cole no campo acima e clique em
                “Testar conexão”.
              </li>
            </ol>
            <button
              type="button"
              className="sfo-btn sfo-btn--primary"
              onClick={openAuthorization}
              disabled={!appKey.trim()}
            >
              <Icon name="external" size={14} />
              Autorizar no Trello
            </button>
            <div className="sfo-hint" style={{ marginTop: 8, overflowWrap: 'anywhere' }}>
              URL de autorização: <code>{tokenUrl}</code>
            </div>
            <div className="sfo-hint" style={{ marginTop: 6 }}>
              Não há outro método de conexão: o Trello exige APP-KEY + TOKEN para extensões sem
              servidor. O token fica apenas neste navegador.
            </div>
          </div>
        </div>

        {connection && (
          <div className="sfo-alert sfo-alert--success">
            <Icon name="check" size={16} />
            <div>
              Conectado como <strong>{connection.fullName}</strong> (@{connection.username}).{' '}
              {connection.boardCount} quadro(s) visível(is).
            </div>
          </div>
        )}

        {dirty && (
          <p className="sfo-hint" style={{ margin: 0 }}>
            Há alterações não salvas nas credenciais.
          </p>
        )}
      </SectionCard>

      <SectionCard
        title="Privacidade e segurança"
        subtitle="O SEI Flow não possui servidor próprio."
        icon="info"
      >
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-soft)', fontSize: 13 }}>
          <li>
            A APP-KEY e o TOKEN são salvos em <code>chrome.storage.local</code> e nunca são
            enviados para outro lugar além de <code>api.trello.com</code>.
          </li>
          <li>Nenhum dado é vendido, compartilhado ou usado para publicidade.</li>
          <li>
            Você pode revogar o token a qualquer momento em{' '}
            <a href="https://trello.com/app-key" target="_blank" rel="noreferrer">
              trello.com/app-key
            </a>
            .
          </li>
        </ul>
      </SectionCard>
    </>
  );
}
