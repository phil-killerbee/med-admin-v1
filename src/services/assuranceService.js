import { api } from './http';

export const listAssurances = () => api('/assurances');
export const createAssurance = (data) => api('/assurances', { method: 'POST', body: data });
export const updateAssurance = (id, changes) => api(`/assurances/${id}`, { method: 'PATCH', body: changes });
