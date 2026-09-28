import { expect, test } from '@playwright/test';
import { addRecord, isMobile, signUp } from './helpers';

test('inicio, estadísticas, logros y perfil cargan con datos reales', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signUp(page);
  await addRecord(page, {
    artist: 'Pink Floyd',
    title: 'Animals',
    year: 1977,
    genre: 'Rock',
    price: 40,
  });
  await addRecord(page, {
    artist: 'Miles Davis',
    title: 'Kind of Blue',
    year: 1959,
    genre: 'Jazz',
    price: 60,
  });

  await page.goto('/');
  if (isMobile(info)) {
    await expect(page.getByText('Últimos agregados')).toBeVisible();
    await expect(page.getByText('vinilos', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText('Vinilos', { exact: true })).toBeVisible();
    await expect(page.getByText('Top artistas')).toBeVisible();
  }

  await page.goto('/estadisticas');
  await expect(page.getByRole('heading', { name: 'Estadísticas' })).toBeVisible();
  await expect(page.getByText('Gasto por año')).toBeVisible();

  await page.goto('/logros');
  await expect(page.getByRole('heading', { name: 'Logros' })).toBeVisible();
  await expect(page.getByText('Primer vinilo')).toBeVisible();
  await expect(page.getByText(/Desbloqueado el/).first()).toBeVisible();

  await page.goto('/perfil');
  await page.getByText('Moneda base y vista de Inicio').click();
  if (isMobile(info)) {
    // Switch the phone home to 1b ("Números").
    await page.getByRole('button', { name: 'Números' }).click();
    await page.goto('/');
    await expect(page.getByText('Tu colección', { exact: true })).toBeVisible();
    await expect(page.getByText('Por década')).toBeVisible();
  }

  expect(errors).toEqual([]);
});
