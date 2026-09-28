import { expect, test } from '@playwright/test';
import { isMobile, signUp } from './helpers';

test('carga manual: guardar, ver en la colección, editar y borrar', async ({ page }, info) => {
  await signUp(page);
  await page.goto('/agregar/manual');
  await page.locator('#m-artist').fill('Pescado Rabioso');
  await page.locator('#m-title').fill('Artaud');
  await page.locator('#m-year').fill('1973');
  await page.locator('#m-genre').fill('Rock');
  await page
    .locator('#m-tracklist')
    .fill('A1 Todas las hojas son del viento 2:14\nA2 Cementerio club 4:02');
  await page.getByRole('button', { name: /Guardar en colección/ }).click();

  // Lands on the ficha, and the first record unlocks "Primer vinilo".
  await expect(page).toHaveURL(/\/coleccion\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Artaud' })).toBeVisible();
  await expect(page.getByText('Carga manual').first()).toBeVisible();
  await expect(page.getByText('Cementerio club')).toBeVisible();
  await expect(page.getByText(/Primer vinilo/)).toBeVisible();
  const itemUrl = page.url();

  if (isMobile(info)) {
    // Tapping a track reveals its links (none configured in e2e, so it says so).
    await page.getByRole('button', { name: /Cementerio club/ }).click();
    await expect(
      page.getByText('Los links de música no están disponibles por ahora.'),
    ).toBeVisible();
  }

  await page.goto('/coleccion');
  await expect(page.getByText('Artaud')).toBeVisible();

  await page.goto(`${itemUrl}/editar`);
  await page.getByLabel('Precio pagado').fill('45');
  await page.getByRole('radio', { name: 'VG+' }).first().click();
  await page.getByRole('button', { name: /Guardar cambios/ }).click();
  await expect(page).toHaveURL(itemUrl);
  await expect(page.getByText('USD 45').first()).toBeVisible();
  await expect(page.getByText('VG+').first()).toBeVisible();

  await page.goto(`${itemUrl}/editar`);
  await page.getByRole('button', { name: 'Borrar' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Borrar' }).click();
  await expect(page).toHaveURL(/\/coleccion$/);
  await expect(page.getByText('Tu colección está vacía.')).toBeVisible();
});

test('la carga manual pide artista y título', async ({ page }) => {
  await signUp(page);
  await page.goto('/agregar/manual');
  await page.getByRole('button', { name: /Guardar en colección/ }).click();
  await expect(page.getByText('Completá al menos artista y título.')).toBeVisible();
});

test('el borrador de la carga manual sobrevive a una recarga', async ({ page }) => {
  await signUp(page);
  await page.goto('/agregar/manual');
  await page.locator('#m-artist').fill('Spinetta Jade');
  await page.locator('#m-title').fill('Bajo Belgrano');
  await page.waitForTimeout(800); // debounced save
  await page.reload();
  await expect(page.getByText(/Borrador recuperado/)).toBeVisible();
  await expect(page.locator('#m-title')).toHaveValue('Bajo Belgrano');
});
