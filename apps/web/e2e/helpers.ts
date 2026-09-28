import { expect, type Page, type TestInfo } from '@playwright/test';

/** Must match `WEB_PORT` in playwright.config.ts; Better Auth checks the Origin header. */
export const WEB = 'http://localhost:3100';
const headers = { Origin: WEB };

export const isMobile = (info: TestInfo) => info.project.name === 'mobile';

/** Signs up a brand-new user through the API; the page's cookies carry the session. */
export async function signUp(page: Page, name = 'Tester') {
  const id = Math.random().toString(36).slice(2, 10);
  const email = `e2e-${Date.now()}-${id}@kollektor.test`;
  const password = 'vinilos-e2e-123';
  const res = await page.request.post('/api/auth/sign-up/email', {
    data: { name, email, password },
    headers,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return { email, password, username: `e2e_${id}` };
}

export interface ManualRecord {
  artist: string;
  title: string;
  year?: number;
  genre?: string;
  country?: string;
  price?: number;
  tracks?: string[];
}

/** Adds a manual record through the API (fast setup for tests about other screens). */
export async function addRecord(page: Page, r: ManualRecord): Promise<string> {
  const res = await page.request.post('/api/collection', {
    data: {
      manual: {
        album: {
          artists: [r.artist],
          title: r.title,
          originalReleaseYear: r.year ?? null,
          genres: r.genre ? [r.genre] : [],
        },
        release: { year: r.year ?? null, country: r.country ?? null },
        tracks: (r.tracks ?? []).map((t, i) => ({ position: `A${i + 1}`, title: t })),
      },
      ...(r.price != null ? { purchasePrice: r.price, purchaseCurrency: 'USD' } : {}),
    },
    headers,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()).item.id as string;
}
