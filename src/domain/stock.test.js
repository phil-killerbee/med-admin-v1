import { describe, expect, it } from 'vitest';
import { allocateFefo, lotStatus, quantiteDisponible } from './stock';

const TODAY = '2026-06-01';
const lots = [
  { id: 'tard', quantite: 50, datePeremption: '2027-12-31' },
  { id: 'tot', quantite: 10, datePeremption: '2026-07-01' },
  { id: 'perime', quantite: 99, datePeremption: '2026-05-01' },
];

describe('Stock — règle FEFO', () => {
  it('sort d’abord le lot qui périme le plus tôt', () => {
    expect(allocateFefo(lots, 5, TODAY)).toEqual([{ lotId: 'tot', quantite: 5 }]);
  });

  it('répartit sur plusieurs lots si nécessaire', () => {
    expect(allocateFefo(lots, 15, TODAY)).toEqual([
      { lotId: 'tot', quantite: 10 },
      { lotId: 'tard', quantite: 5 },
    ]);
  });

  it('ne vend JAMAIS un lot périmé', () => {
    expect(quantiteDisponible(lots, TODAY)).toBe(60);
    expect(() => allocateFefo(lots, 61, TODAY)).toThrow(/Stock insuffisant/);
  });

  it('refuse les quantités invalides', () => {
    expect(() => allocateFefo(lots, 0, TODAY)).toThrow();
    expect(() => allocateFefo(lots, 1.5, TODAY)).toThrow();
  });

  it('calcule le statut de péremption', () => {
    expect(lotStatus(lots[2], TODAY)).toBe('PERIME');
    expect(lotStatus(lots[1], TODAY)).toBe('PROCHE');
    expect(lotStatus(lots[0], TODAY)).toBe('OK');
  });
});
