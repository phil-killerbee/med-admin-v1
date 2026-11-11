import { api } from './http';

export const listPatients = (q = '') => api(`/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`);
export const getPatientCommandes = (id) => api(`/patients/${id}/commandes`);
export const createPatient = (data) => api('/patients', { method: 'POST', body: data });
export const updatePatient = (id, data) => api(`/patients/${id}`, { method: 'PUT', body: data });
