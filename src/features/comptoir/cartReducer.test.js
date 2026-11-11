import { describe, expect, it } from 'vitest';
import { cartReducer, cartTotal, initialCart, toCommandePayload } from './cartReducer';

const doliprane = { id: 1, prixVente: 1000, stock: 3, ordonnance: false };
const amox = { id: 2, prixVente: 2500, stock: 10, ordonnance: true };

describe('Commande en cours (reducer)', () => {
  it('ajoute puis incrémente la quantité', () => {
    let s = cartReducer(initialCart, { type: 'ADD', medicament: doliprane });
    s = cartReducer(s, { type: 'ADD', medicament: doliprane });
    expect(s.lignes).toHaveLength(1);
    expect(s.lignes[0].quantite).toBe(2);
    expect(cartTotal(s)).toBe(2000);
  });

  it('ne dépasse jamais le stock disponible', () => {
    let s = cartReducer(initialCart, { type: 'ADD', medicament: doliprane });
    s = cartReducer(s, { type: 'SET_QTY', id: 1, quantite: 99 });
    expect(s.lignes[0].quantite).toBe(3);
  });

  it('quantité 0 → retire la ligne', () => {
    let s = cartReducer(initialCart, { type: 'ADD', medicament: doliprane });
    s = cartReducer(s, { type: 'SET_QTY', id: 1, quantite: 0 });
    expect(s.lignes).toHaveLength(0);
  });

  it("décocher « assuré » efface l'assurance", () => {
    let s = cartReducer(initialCart, { type: 'SET_ASSURE', value: true });
    s = cartReducer(s, { type: 'SET_FIELD', field: 'assuranceId', value: '3' });
    s = cartReducer(s, { type: 'SET_ASSURE', value: false });
    expect(s.assuranceId).toBe('');
    expect(toCommandePayload(s).assuranceId).toBeNull();
  });

  it("n'envoie à l'API ni prix ni total", () => {
    const s = cartReducer(initialCart, { type: 'ADD', medicament: amox });
    const payload = toCommandePayload(s);
    expect(payload.lignes).toEqual([{ medicamentId: 2, quantite: 1 }]);
    expect(JSON.stringify(payload)).not.toContain('prix');
  });

  it("ne modifie jamais l'état précédent (immutabilité)", () => {
    const before = cartReducer(initialCart, { type: 'ADD', medicament: doliprane });
    const snapshot = structuredClone(before);
    cartReducer(before, { type: 'ADD', medicament: doliprane });
    expect(before).toEqual(snapshot);
  });
});

describe('Panier — fiche patient', () => {
  it('choisir un patient reprend son nom et son assurance active', () => {
    const s = cartReducer(initialCart, {
      type: 'SELECT_PATIENT',
      patient: { id: 3, nom: 'Khady Sarr', assuranceId: 1, assuranceActive: true, numeroAssure: 'IPM-1' },
    });
    expect(s).toMatchObject({ patientId: 3, patientNom: 'Khady Sarr', assure: true, assuranceId: '1', numeroAssure: 'IPM-1' });
    expect(toCommandePayload(s).patientId).toBe(3);
    expect(cartReducer(s, { type: 'CLEAR_PATIENT' })).toMatchObject({ patientId: null, patientNom: '' });
  });
  it('une assurance inactive n’est pas reprise', () => {
    const s = cartReducer(initialCart, {
      type: 'SELECT_PATIENT',
      patient: { id: 4, nom: 'X', assuranceId: 5, assuranceActive: false, numeroAssure: 'A' },
    });
    expect(s.assure).toBe(false);
  });
});
