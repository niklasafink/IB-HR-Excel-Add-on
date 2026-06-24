import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  userId: string;
  tenantId: string;
  /** Effektiver handelsregister.ai-Key für diese Anfrage (Mandanten- oder Default-Key). */
  apiKey: string;
}

/**
 * Trägt Nutzer-/Mandanten-Identität und den zu nutzenden API-Key durch die
 * gesamte Anfrage (auch über asynchrone Aufrufe hinweg), damit Upstream-Calls den
 * richtigen Key verwenden und der Verbrauch korrekt zugeordnet werden kann.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();
