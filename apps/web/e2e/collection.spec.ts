import { expect, test } from '@playwright/test';
import { addRecord, isMobile, signUp } from './helpers';

test.beforeEach(async ({ page }) => {
  await signUp(page);
  await addRecord(page, {
    artist: 'Pink Floyd',
    title: 'Animals',
    year: 1977,
    genre: 'Rock',
    country: 'UK',
    price: 40,
  });
  await addRecord(page, {
    artist: 'Miles Davis',
    title: 'Kind of Blue',
    year: 1959,
    genre: 'Jazz',
    country: 'US',
    price: 60,
  });
  await addRecord(page, {
    artist: 'Charly García',
    title: 'Clics Modernos',
    year: 1983,
    genre: 'Rock',
    country: 'Argentina',
  });
});

test('filtros combinables en la URL', async ({ page }, info) => {
  await page.goto('/coleccion');
  await expect(page.getByText('Kind of Blue')).toBeVisible();

  if (isMobile(info)) {
    await page.getByRole('button', { name: /^Filtros/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Filtros' });
    await sheet.getByRole('button', { name: 'Jazz' }).click();
    await expect(sheet.getByRole('button', { name: /Ver 1 vinilo/ })).toBeVisible();
    await sheet.getByRole('button', { name: /Ver 1 vinilo/ }).click();
  } else {
    await page.getByRole('checkbox', { name: /Jazz/ }).click();
  }

  await expect(page).toHaveURL(/genre=Jazz/);
  await expect(page.getByText('Kind of Blue')).toBeVisible();
  await expect(page.getByText('Animals')).toHaveCount(0);

  // The filter survives a reload and can be removed from its chip.
  await page.reload();
  await expect(page.getByText('Animals')).toHaveCount(0);
  await page.getByRole('button', { name: 'Jazz ×' }).click();
  await expect(page.getByText('Animals')).toBeVisible();
});

test('buscar dentro de la colección', async ({ page }, info) => {
  await page.goto('/coleccion');
  const box = isMobile(info)
    ? page.getByLabel('Buscar en tu colección')
    : page.getByLabel('Filtrar por texto');
  await box.fill('garcia');
  await expect(page).toHaveURL(/q=garcia/);
  await expect(page.getByText('Clics Modernos')).toBeVisible();
  await expect(page.getByText('Kind of Blue')).toHaveCount(0);
});

test('mobile: vista lista y estante de lomos', async ({ page }, info) => {
  test.skip(!isMobile(info), 'solo en mobile');
  await page.goto('/coleccion');
  await page.getByRole('button', { name: 'Lista' }).click();
  await expect(page.getByText(/pagué 40/)).toBeVisible();
  await page.getByRole('button', { name: 'Estante' }).click();
  await expect(page.getByText('A–Z por artista')).toBeVisible();
  // "Charly García" files under C, before "Miles Davis" and "Pink Floyd".
  const spines = page.locator('button[aria-pressed]').filter({ hasText: ' — ' });
  await expect(spines.first()).toContainText('CHARLY GARCÍA — CLICS MODERNOS', {
    ignoreCase: true,
  });
});

test('web: vista tabla con diferencia', async ({ page }, info) => {
  test.skip(isMobile(info), 'solo en web');
  await page.goto('/coleccion');
  await page.getByRole('button', { name: 'Tabla' }).click();
  const row = page.getByRole('row', { name: /Animals/ });
  await expect(row).toContainText('Pink Floyd');
  await expect(row).toContainText('40');
});
