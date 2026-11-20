import { getSettings } from '../storage/settings';
import type { TrelloCredentials } from '../trello/client';
import { getAccessToken } from './oauth';
import { readSession } from './session';

/**
 * Fonte única das credenciais do Trello:
 * 1. se houver login OAuth, usa Bearer (renovando quando preciso);
 * 2. caso contrário, cai no APP-KEY/TOKEN manual.
 */
export async function loadTrelloCredentials(): Promise<TrelloCredentials> {
  const session = await readSession();
  if (session) return { accessToken: await getAccessToken() };
  const settings = await getSettings();
  return { key: settings.appKey, token: settings.appToken };
}
