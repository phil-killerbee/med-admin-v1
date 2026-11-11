import { api } from './http';

export const listUsers = () => api('/users');
export const createUser = (data) => api('/users', { method: 'POST', body: data });
export const updateUser = (id, changes) => api(`/users/${id}`, { method: 'PATCH', body: changes });
export const listAudit = () => api('/audit');
