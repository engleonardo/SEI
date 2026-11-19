import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const PAGE = pathToFileURL(join(process.cwd(), 'site', 'oauth-callback.html')).href;

function state(value: { n: string; r: string }) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

test('callback devolve código para o Chrome/Edge', async ({ page }) => {
  await page.route('https://testid.chromiumapp.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' }),
  );

  await page.goto(
    `${PAGE}?code=abc&state=${state({ n: 'nonce', r: 'https://testid.chromiumapp.org/' })}`,
  );

  await expect
    .poll(() => page.url())
    .toContain('https://testid.chromiumapp.org/?code=abc&state=');
});

test('callback devolve código para o Firefox', async ({ page }) => {
  await page.route('https://uuid123.extensions.allizom.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<p>ok</p>' }),
  );

  await page.goto(
    `${PAGE}?code=abc&state=${state({
      n: 'nonce',
      r: 'https://uuid123.extensions.allizom.org/',
    })}`,
  );

  await expect
    .poll(() => page.url())
    .toContain('https://uuid123.extensions.allizom.org/?code=abc&state=');
});

test('callback bloqueia retorno fora da allowlist', async ({ page }) => {
  await page.goto(
    `${PAGE}?code=abc&state=${state({ n: 'nonce', r: 'https://evil.example.com/' })}`,
  );

  await expect(page.locator('#message')).toHaveText('Não foi possível concluir o login.');
  expect(page.url()).toContain('oauth-callback.html');
});

test('callback mostra erro quando o Trello nega', async ({ page }) => {
  await page.goto(
    `${PAGE}?error=access_denied&error_description=Usuario%20negou&state=${state({
      n: 'nonce',
      r: 'https://testid.chromiumapp.org/',
    })}`,
  );

  await expect(page.locator('#message')).toHaveText('O Trello não autorizou o acesso.');
  await expect(page.locator('#hint')).toContainText('Usuario negou');
});
