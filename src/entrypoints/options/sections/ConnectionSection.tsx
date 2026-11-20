import { useEffect, useState } from 'react';
import type { AuthStatus } from '../../../core/auth/session';
import type { ConnectionInfo, Settings } from '../../../core/domain/types';
import { callRpc, errorMessage } from '../../../core/messaging/client';
import { Icon } from '../../../ui/icons';
import { ConfirmDialog } from '../../../ui/components/Modal';
import { SectionCard, Spinner, StatusPill, type Notice } from './shared';

export function ConnectionSection({
  settings,
  save,
  notify,
  reloadBoards,
  onLoginComplete,
  onLoggedOut,
}: {
  settings: Settings;
  save: (patch: Partial<Settings>) => Promise<Settings>;
  notify: (notice: Notice) => void;
  reloadBoards: () => Promise<Settings | null>;
  onLoginComplete?: (fresh: Settings | null) => void;
  onLoggedOut?: () => void;
}) {
  const [appKey, setAppKey] = useState(settings.appKey);
  const [appToken, setAppToken] = useState(settings.appToken);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [connection, setConnection] = useState<ConnectionInfo | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setAppKey(settings.appKey);
    setAppToken(settings.appToken);
  }, [settings.appKey, settings.appToken]);

  useEffect(() => {
    let active = true;
    callRpc('auth:status', undefined)
      .then((status) => {
        if (active) setAuth(status);
      })
      .catch(() => {
        if (active) setAuth(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const keyForUrl = appKey.trim();
  const tokenUrl = `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&name=SEI%20Flow&key=${encodeURIComponent(
    keyForUrl || '<APP KEY>',
  )}`;
  const dirty = appKey !== settings.appKey || appToken !== settings.appToken;
  const oauth = auth?.mode === 'oauth';
  const manual = auth?.mode === 'token';
  const connected = Boolean(auth?.connected);

  const openAuthorization = () => {
    if (!keyForUrl) {
      notify({ kind: 'warning', text: 'Informe a APP-KEY antes de autorizar no Trello.' });
      return;
    }
    window.open(tokenUrl, '_blank', 'noopener,noreferrer');
  };

  const login = async () => {
    setAuthBusy(true);
    try {
      const status = await callRpc('auth:login', undefined);
      setAuth(status);
      notify({
        kind: 'success',
        text: status.account
          ? `Conectado como ${status.account.fullName}.`
          : 'Login com o Trello concluído.',
      });
      // Navega para o próximo passo sem esperar o recarregamento dos quadros.
      const fresh = await callRpc('settings:get', undefined).catch(() => null);
      onLoginComplete?.(fresh);
      void reloadBoards();
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setAuthBusy(false);
    }
  };

  const logout = async () => {
    setAuthBusy(true);
    try {
      // Sempre limpa o login e as credenciais manuais; regras/destino/preferências ficam.
      const status = await callRpc('auth:logout', { clearManual: true });
      setAuth(status);
      setConnection(null);
      setLogoutOpen(false);
      notify(
        status.backupFailed
          ? {
              kind: 'warning',
              text: 'Sessão encerrada. Não foi possível salvar a configuração no Trello; ela foi guardada neste navegador e volta no próximo login.',
            }
          : { kind: 'success', text: 'Sessão encerrada e dados locais removidos.' },
      );
      await reloadBoards();
      onLoggedOut?.();
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setAuthBusy(false);
    }
  };

  const removeManual = async () => {
    setBusy(true);
    try {
      await save({ appKey: '', appToken: '' });
      setAppKey('');
      setAppToken('');
      setConfirmRemove(false);
      notify({ kind: 'success', text: 'Credenciais manuais removidas.' });
      setAuth(await callRpc('auth:status', undefined));
      await reloadBoards();
    } catch (cause) {
      notify({ kind: 'error', text: errorMessage(cause) });
    } finally {
      setBusy(false);
    }
  };

  const saveConnection = async () => {
    setBusy(true);
    try {
      await save({ appKey: appKey.trim(), appToken: appToken.trim() });
      notify({ kind: 'success', text: 'Credenciais salvas neste navegador.' });
      setAuth(await callRpc('auth:status', undefined));
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
      if (!oauth && dirty) {
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
        subtitle="Conecte sua conta do Trello. A sessão fica apenas neste navegador."
        icon="settings"
        footer={
          oauth ? (
            <>
              <button
                type="button"
                className="sfo-btn"
                onClick={() => void testConnection()}
                disabled={testing}
              >
                {testing ? <Spinner /> : <Icon name="refresh" size={14} />}
                Testar conexão
              </button>
              <button
                type="button"
                className="sfo-btn"
                onClick={() => setLogoutOpen(true)}
                disabled={authBusy}
              >
                {authBusy ? <Spinner /> : <Icon name="close" size={14} />}
                Sair
              </button>
              <span style={{ flex: 1 }} />
              <StatusPill tone="success">
                <Icon name="check" size={11} />
                Login ativo
              </StatusPill>
            </>
          ) : (
            <>
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
          )
        }
      >
        {oauth ? (
          <div className="sfo-alert sfo-alert--success">
            <Icon name="check" size={16} />
            <div style={{ flex: 1 }}>
              <strong>
                Conectado{auth?.account ? ` como ${auth.account.fullName}` : ' com o Trello'}.
              </strong>
              <div className="sfo-hint" style={{ marginTop: 4 }}>
                A renovação do acesso é automática. Use <strong>Sair</strong> para encerrar a sessão
                neste navegador.
              </div>
            </div>
          </div>
        ) : (
          <div className="sfo-alert">
            <Icon name="info" size={16} />
            <div style={{ flex: 1 }}>
              <strong>Conectar com o Trello (recomendado)</strong>
              <p style={{ margin: '4px 0 10px', color: 'var(--text-soft)', fontSize: 13 }}>
                Abre a tela oficial do Trello e autoriza somente a sua conta. Você pode revogar o
                acesso quando quiser nas configurações do Trello.
              </p>
              <button
                type="button"
                className="sfo-btn sfo-btn--primary"
                onClick={() => void login()}
                disabled={authBusy}
              >
                {authBusy ? <Spinner /> : <Icon name="external" size={14} />}
                Conectar com Trello
              </button>
              {manual && (
                <div className="sfo-hint" style={{ marginTop: 8 }}>
                  Há uma APP-KEY/TOKEN manual configurada. Ao entrar, o login passa a ser usado.
                </div>
              )}
            </div>
          </div>
        )}

        <details style={{ marginTop: 12 }}>
          <summary
            style={{ cursor: 'pointer', fontWeight: 700, color: 'var(--text-soft)', fontSize: 13 }}
          >
            Usar APP-KEY/TOKEN manual (alternativa)
          </summary>
          <div style={{ marginTop: 12 }}>
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
                    O Trello exibirá um <strong>TOKEN</strong>. Copie, cole no campo acima e clique
                    em “Testar conexão”.
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
                  O token fica apenas neste navegador. Use esta opção se preferir não usar o login.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
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
              {(settings.appKey || settings.appToken) && (
                <button
                  type="button"
                  className="sfo-btn sfo-btn--danger"
                  onClick={() => setConfirmRemove(true)}
                  disabled={busy}
                >
                  <Icon name="trash" size={14} />
                  Remover credenciais
                </button>
              )}
            </div>

            {dirty && (
              <p className="sfo-hint" style={{ margin: 0 }}>
                Há alterações não salvas nas credenciais.
              </p>
            )}
          </div>
        </details>

        {connection && (
          <div className="sfo-alert sfo-alert--success">
            <Icon name="check" size={16} />
            <div>
              Conectado como <strong>{connection.fullName}</strong> (@{connection.username}).{' '}
              {connection.boardCount} quadro(s) visível(is).
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Privacidade e segurança"
        subtitle="O SEI Flow não possui servidor próprio e não guarda dados fora do seu navegador."
        icon="info"
      >
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text-soft)', fontSize: 13 }}>
          <li>
            No login, os tokens ficam em <code>storage.local</code> e só são enviados para{' '}
            <code>api.trello.com</code> e para o próprio Trello/Atlassian durante a autenticação.
          </li>
          <li>
            No modo manual, a APP-KEY e o TOKEN também ficam em <code>storage.local</code> e nunca
            saem do navegador exceto para <code>api.trello.com</code>.
          </li>
          <li>Nenhum dado é vendido, compartilhado ou usado para publicidade.</li>
          <li>
            Para sincronizar entre navegadores, as regras e o destino são salvos em um quadro
            privado <strong>“SEI Flow - Configurações”</strong> na sua própria conta do Trello.
            Nenhum token é sincronizado.
          </li>
          <li>
            Você pode revogar o acesso a qualquer momento no{' '}
            <a href="https://trello.com/app-key" target="_blank" rel="noreferrer">
              Trello
            </a>
            .
          </li>
        </ul>
      </SectionCard>

      {logoutOpen && (
        <ConfirmDialog
          title="Sair do Trello"
          message="O login, as credenciais e os dados locais deste navegador serão removidos. Suas regras e destino ficam salvos na sua conta do Trello e voltam ao entrar de novo."
          confirmLabel="Sair"
          cancelLabel="Cancelar"
          busy={authBusy}
          onConfirm={() => void logout()}
          onClose={() => setLogoutOpen(false)}
        />
      )}

      {confirmRemove && (
        <ConfirmDialog
          title="Remover credenciais manuais"
          message="A APP-KEY e o TOKEN salvos neste navegador serão apagados. Se houver login OAuth ativo, ele não será afetado."
          confirmLabel="Remover"
          tone="danger"
          busy={busy}
          onConfirm={() => void removeManual()}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </>
  );
}
