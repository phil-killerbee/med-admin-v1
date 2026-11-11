import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError, AppError } from './errors';

/** Émis quand l'API répond 401 : l'interface se déconnecte (voir AuthContext). */
export const AUTH_EXPIRED_EVENT = 'auth:expired';

/**
 * Client HTTP unique de l'application.
 * - le cookie de session (HttpOnly) est envoyé automatiquement par le navigateur
 * - les erreurs HTTP sont converties en erreurs typées
 */
export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new AppError('Serveur injoignable. L’API est-elle démarrée (npm run dev) ?', 0);
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return data;

  const message = data?.message ?? `Erreur ${response.status}`;
  switch (response.status) {
    case 401:
      if (!path.startsWith('/auth/')) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      throw new UnauthorizedError(message);
    case 403:
      throw new ForbiddenError(message);
    case 404:
      throw new NotFoundError(message);
    case 400:
    case 409:
    case 422:
      throw new ValidationError(message, data?.fields ?? {});
    default:
      throw new AppError(message, response.status);
  }
}
