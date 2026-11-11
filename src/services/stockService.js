import { api } from './http';

export const listLots = () => api('/lots');
export const receptionnerLot = (data) => api('/lots', { method: 'POST', body: data });
