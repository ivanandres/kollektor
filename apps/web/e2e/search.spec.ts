import { expect, test } from '@playwright/test';
import { addRecord, isMobile, signUp } from './helpers';

test('búsqueda global: un tema lleva a su disco', async ({ page }, info) => {
  await signUp(page);
  await addRecord(page, {
    artist: 'Pink Floyd',
    title: 'The Dark Side of the Moon',
    year: 1973,
    tracks: ['Speak to Me', 'Money', 'Time'],
  });

  if (isMobile(info)) {
    await page.goto('/buscar');
    await page.getByLabel('Buscar').fill('floyd money');
  } else {
    await page.goto('/');
    await page.getByRole('button', { name: /Buscar en tu colección/ }).click();
    await page.getByRole('dialog').getByLabel('Buscar').fill('floyd money');
  }
  await expect(page.getByText(/resultados? para “floyd money”/)).toBeVisible();
  await page.getByRole('button', { name: /Money/ }).first().click();
  await expect(page).toHaveURL(/\/coleccion\/[0-9a-f-]{36}\?tema=/);
  await expect(page.getByRole('heading', { name: 'The Dark Side of the Moon' })).toBeVisible();
});

test('sin resultados ofrece buscar en Discogs', async ({ page }, info) => {
  await signUp(page);
  if (isMobile(info)) {
    await page.goto('/buscar?q=zzzz');
    await expect(page.getByText('Nada en tu colección.')).toBeVisible();
  } else {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog').getByLabel('Buscar').fill('zzzz');
    await expect(page.getByText('Sin resultados en tu colección.')).toBeVisible();
  }
  await page.getByRole('button', { name: /Buscar en Discogs/ }).click();
  await expect(page).toHaveURL(/\/agregar\?q=zzzz/);
});
