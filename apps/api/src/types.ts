import type { Core } from '@kollektor/core';
import type { StorageService } from '@kollektor/integrations';
import type { Auth } from './auth';
import type { Env } from './env';

export interface AppDeps {
  core: Core;
  auth: Auth;
  env: Env;
  storage?: StorageService;
}

export interface AppVariables {
  userId: string;
}

export type AppEnv = { Variables: AppVariables };
