import { api } from './http';

export const login = (login, password) => api('/auth/login', { method: 'POST', body: { login, password } });

export const logout = () => api('/auth/logout', { method: 'POST' });

export async function fetchCurrentUser() {
  try {
    return await api('/auth/me');
  } catch {
    return null;
  }
}
