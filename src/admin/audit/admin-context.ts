import { AsyncLocalStorage } from 'node:async_hooks';

export interface AdminRequestContext {
  actor: string;
  ip?: string;
}

/**
 * Atyare kayo admin, kai IP par thi kaam kari rahyo chhe.
 *
 * Kem AsyncLocalStorage: audit lakhvani jagya service ni ander chhe (jya
 * before/after na values hoy chhe), pan actor ane IP request par chhe. Aa be
 * ne jodva mate ek j biji rit chhe — dar service method ma `actor` parameter
 * ummervo. Tyare 20 signatures badlaay chhe, ane pachhi navu method lakhnaar
 * e parameter pass karvanu bhuli jaay chhe ane audit chup-chaap gum thai
 * jaay chhe. ALS ma bhulvanu kai chhe j nahi.
 */
export const adminContext = new AsyncLocalStorage<AdminRequestContext>();

/** Context na hoy (cron, test, startup) to pan audit lakhaavu joiye */
export function currentAdminContext(): AdminRequestContext {
  return adminContext.getStore() ?? { actor: 'system' };
}
