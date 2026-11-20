import { browser } from 'wxt/browser';

/** Permissão ampla usada pela ativação automática de sites que começam com "sei". */
export const BROAD_ORIGINS = ['*://*/*'];

export async function hasBroadSiteAccess(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ origins: BROAD_ORIGINS });
  } catch {
    return false;
  }
}

/** Precisa ser chamada a partir de um clique do usuário. */
export async function requestBroadSiteAccess(): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: BROAD_ORIGINS });
  } catch {
    return false;
  }
}
