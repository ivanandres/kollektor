import { expect, test, type Page } from '@playwright/test';
import { WEB } from './helpers';

const newCreds = () => {
  const id = Math.random().toString(36).slice(2, 10);
  return {
    email: `e2e-${Date.now()}-${id}@kollektor.test`,
    password: 'vinilos-e2e-123',
    username: `e2e_${id}`,
  };
};

async function login(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: /^Entrar/ }).click();
}

test('registro, cierre de sesión y vuelta a entrar', async ({ page }) => {
  const c = newCreds();
  await page.goto('/login?modo=registro');
  await page.getByLabel('Username').fill(c.username);
  await page.getByLabel('Email').fill(c.email);
  await page.getByLabel('Contraseña').fill(c.password);
  await expect(page.getByText('Tu colección es privada por defecto.')).toBeVisible();
  await page.getByRole('button', { name: /Crear cuenta\s*→/ }).click();

  // New accounts start empty and are invited to add or import.
  await expect(page.getByText('Todavía no hay discos.')).toBeVisible();
  await expect(page).toHaveURL(`${WEB}/`);

  const profile = await (await page.request.get('/api/me/profile')).json();
  expect(profile.username).toBe(c.username);

  await page.goto('/perfil');
  await page.getByText('Cerrar sesión o borrar tu cuenta').click();
  await page.getByRole('button', { name: /^Cerrar sesión\s*→/ }).click();
  await expect(page).toHaveURL(/\/login/);

  await login(page, c.email, c.password);
  await expect(page.getByText('Todavía no hay discos.')).toBeVisible();
});

test('una ruta privada pide login y después vuelve a donde estabas', async ({ page }) => {
  const c = newCreds();
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Tester', email: c.email, password: c.password },
    headers: { Origin: WEB },
  });
  await page.context().clearCookies();

  await page.goto('/wishlist');
  await expect(page).toHaveURL(/\/login\?next=%2Fwishlist/);
  await login(page, c.email, c.password);
  await expect(page).toHaveURL(`${WEB}/wishlist`);
  await expect(page.getByText('Quiero comprar')).toBeVisible();
});

test('el destino después del login no puede ser otro sitio', async ({ page }) => {
  const c = newCreds();
  await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Tester', email: c.email, password: c.password },
    headers: { Origin: WEB },
  });
  await page.context().clearCookies();

  await page.goto('/login?next=/%5Cevil.example');
  await login(page, c.email, c.password);
  await expect(page).toHaveURL(`${WEB}/`);
});

test('contraseña incorrecta muestra un error en español', async ({ page }) => {
  await page.goto('/login');
  await login(page, 'nadie@kollektor.test', 'incorrecta-123');
  // Next's route announcer is also role=alert; ours is the one with text.
  await expect(page.getByRole('alert').filter({ hasText: /\w/ }).first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
