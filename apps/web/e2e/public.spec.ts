import { expect, test } from '@playwright/test';
import { addRecord, signUp, WEB } from './helpers';

test('perfil público: solo se ve cuando el dueño lo hace público', async ({ page, browser }) => {
  await signUp(page, 'Coleccionista Público');
  await addRecord(page, {
    artist: 'Soda Stereo',
    title: 'Canción Animal',
    year: 1990,
    genre: 'Rock',
  });
  const { username } = await (await page.request.get('/api/me/profile')).json();

  const visitor = await browser.newPage();
  await visitor.goto(`/u/${username}`);
  await expect(visitor.getByText('Este perfil es privado o no existe.')).toBeVisible();

  // Made public from Perfil → Privacidad.
  await page.goto('/perfil');
  await page.getByText('Todo es privado hasta que lo hagas público').click();
  for (const label of ['Perfil', 'Colección', 'Wishlist']) {
    await page.getByRole('group', { name: label }).getByRole('button', { name: 'Público' }).click();
    await expect(
      page.getByRole('group', { name: label }).getByRole('button', { name: 'Público' }),
    ).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.getByRole('link', { name: new RegExp(`/u/${username}`) })).toBeVisible();

  await visitor.goto(`${WEB}/u/${username}`);
  await expect(visitor.getByRole('heading', { name: 'Coleccionista Público' })).toBeVisible();
  await expect(visitor.getByText('Canción Animal')).toBeVisible();
  // Private data never shows up publicly (no prices unless the owner opts in).
  await expect(visitor.getByText(/USD/)).toHaveCount(0);
  await visitor.close();
});
