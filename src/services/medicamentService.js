import { api } from './http';

export const listMedicaments = () => api('/medicaments');
export const createMedicament = (data) => api('/medicaments', { method: 'POST', body: data });
export const updateMedicament = (id, data) => api(`/medicaments/${id}`, { method: 'PUT', body: data });
export const deleteMedicament = (id) => api(`/medicaments/${id}`, { method: 'DELETE' });
