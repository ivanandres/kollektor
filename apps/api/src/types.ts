import type { Core } from '@kollektor/core';
import type { Auth } from './auth';
import type { Env } from './env';

export interface AppDeps {
  core: Core;
  auth: Auth;
  env: Env;
}

export interface AppVariables {
  userId: string;
}

export type AppEnv = { Variables: AppVariables };
