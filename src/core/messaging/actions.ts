import { callRpc } from './client';

export async function openOptionsPage(): Promise<void> {
  await callRpc('options:open', undefined);
}

export async function openDashboard(): Promise<void> {
  await callRpc('dashboard:open', undefined);
}
