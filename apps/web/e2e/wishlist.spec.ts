import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('wishlist: sumar, pasar a Encontrado y comprarlo', async ({ page }) => {
  await signUp(page);
  await page.goto('/wishlist');
  await expect(page.getByText('Nada en este estado todavía.')).toBeVisible();

  // "+" → Discogs search; without Discogs, the manual form keeps the wishlist destination.
  await page.goto('/agregar/manual?destino=wishlist');
  await expect(page.getByText('Sumar a la wishlist')).toBeVisible();
  await page.locator('#m-artist').fill('Pink Floyd');
  await page.locator('#m-title').fill('Meddle');
  await page.locator('#m-year').fill('1971');
  await page.getByRole('button', { name: /Agregar a wishlist/ }).click();

  await expect(page).toHaveURL(/\/wishlist$/);
  await expect(page.getByRole('button', { name: 'Editar Meddle' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Quiero 1/ })).toBeVisible();

  await page.getByRole('button', { name: 'Editar Meddle' }).click();
  const sheet = page.getByRole('dialog', { name: 'Meddle' });
  await sheet.getByRole('button', { name: 'Encontrado' }).click();
  await sheet.getByLabel(/Precio objetivo/).fill('60');
  await sheet.getByRole('button', { name: /^Guardar/ }).click();

  await page.getByRole('tab', { name: /Encontrado/ }).click();
  await expect(page.getByText('USD 60')).toBeVisible();
  await page.getByRole('button', { name: /Agregar a mi colección/ }).click();
  const buy = page.getByRole('dialog', { name: 'Agregar a mi colección' });
  await buy.getByLabel('Precio pagado').fill('55');
  await buy.getByRole('button', { name: /Guardar en colección/ }).click();

  await expect(page).toHaveURL(/\/coleccion\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Meddle' })).toBeVisible();
  await expect(page.getByText('USD 55').first()).toBeVisible();

  await page.goto('/wishlist');
  await page.getByRole('tab', { name: /Comprado/ }).click();
  await expect(page.getByRole('link', { name: /Ver en mi colección/ })).toBeVisible();
});
