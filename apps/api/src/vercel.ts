import { handle } from 'hono/vercel';
import { bootstrap } from './bootstrap';
import { loadEnv } from './env';

// One app per warm function instance.
const { app } = bootstrap(loadEnv());

export const GET = handle(app);
export const POST = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
export const OPTIONS = handle(app);
