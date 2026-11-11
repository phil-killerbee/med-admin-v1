import { describe, expect, it } from 'vitest';
import {
  calculerPaiement,
  canCancelCommande,
  computeTotal,
  hausseSurOrdonnance,
  libellePaiement,
  repartitionAssurance,
  resumerModification,
  validateInfosPatient,
} from './commande';
import { ROLES } from '../config/roles';

const user = (id, role) => ({ id, role, actif: true });

describe('Commandes — total et assurance', () => {
  it('calcule le total à partir des lignes', () => {
    expect(computeTotal([{ prixUnitaire: 2500, quantite: 2 }, { prixUnitaire: 1000, quantite: 1 }])).toBe(6000);
  });

  it('répartit entre assurance et patient', () => {
    expect(repartitionAssurance(6000, 80)).toEqual({ partAssurance: 4800, partPatient: 1200 });
    expect(repartitionAssurance(6000, 0)).toEqual({ partAssurance: 0, partPatient: 6000 });
    expect(repartitionAssurance(6000, 100)).toEqual({ partAssurance: 6000, partPatient: 0 });
  });

  it('la somme des parts est toujours égale au total (arrondi)', () => {
    const { partAssurance, partPatient } = repartitionAssurance(1001, 33);
    expect(partAssurance + partPatient).toBe(1001);
  });

  it('refuse un taux invalide', () => {
    expect(() => repartitionAssurance(1000, 120)).toThrow();
  });

  it('patient et ordonnance sont facultatifs', () => {
    expect(validateInfosPatient({})).toEqual({});
    expect(validateInfosPatient({ assuranceId: 1, numeroAssure: 'IPM-1' })).toEqual({});
  });

  it("l'assurance exige seulement le n° d'assuré", () => {
    expect(Object.keys(validateInfosPatient({ assuranceId: 1 }))).toEqual(['numeroAssure']);
  });
});

describe('Commandes — encaissement', () => {
  it('rend la monnaie en espèces', () => {
    expect(calculerPaiement(1200, [{ mode: 'ESPECES', montant: 2000 }])).toEqual({
      lignes: [{ mode: 'ESPECES', montant: 1200 }],
      mode: 'ESPECES',
      montantRecu: 2000,
      monnaie: 800,
    });
  });
  it('refuse un montant insuffisant', () => {
    expect(() => calculerPaiement(1200, [{ mode: 'ESPECES', montant: 1000 }])).toThrow(/insuffisant/);
  });
  it('mobile money : montant exact, pas de monnaie', () => {
    expect(calculerPaiement(1200, [{ mode: 'WAVE', montant: 1200 }])).toMatchObject({ mode: 'WAVE', monnaie: 0 });
  });
  it('prise en charge à 100 % : rien à encaisser', () => {
    expect(calculerPaiement(0, [])).toMatchObject({ lignes: [], montantRecu: 0, monnaie: 0 });
  });
});

describe('Commandes — paiement mixte', () => {
  it('Orange Money + espèces : les espèces couvrent le reste et la monnaie est rendue sur les espèces', () => {
    const r = calculerPaiement(4500, [
      { mode: 'ORANGE_MONEY', montant: 3000 },
      { mode: 'ESPECES', montant: 2000 },
    ]);
    expect(r).toEqual({
      lignes: [
        { mode: 'ORANGE_MONEY', montant: 3000 },
        { mode: 'ESPECES', montant: 1500 },
      ],
      mode: 'MIXTE',
      montantRecu: 5000,
      monnaie: 500,
    });
    expect(libellePaiement(r.lignes)).toMatch(/Orange Money 3.000 F \+ Espèces 1.500 F/);
  });
  it('deux moyens électroniques : la somme doit être exacte', () => {
    expect(() =>
      calculerPaiement(4500, [
        { mode: 'WAVE', montant: 2000 },
        { mode: 'ORANGE_MONEY', montant: 2000 },
      ]),
    ).toThrow(/reste 500/);
    expect(
      calculerPaiement(4500, [
        { mode: 'WAVE', montant: 2500 },
        { mode: 'ORANGE_MONEY', montant: 2000 },
      ]).mode,
    ).toBe('MIXTE');
  });
  it('pas de monnaie rendue sur un paiement électronique', () => {
    expect(() =>
      calculerPaiement(4500, [
        { mode: 'ORANGE_MONEY', montant: 5000 },
        { mode: 'ESPECES', montant: 0 },
      ]),
    ).toThrow(/dépassent/);
  });
  it('refuse un moyen en double, un mode inconnu ou un montant négatif', () => {
    expect(() =>
      calculerPaiement(1000, [
        { mode: 'WAVE', montant: 500 },
        { mode: 'WAVE', montant: 500 },
      ]),
    ).toThrow(/une fois/);
    expect(() => calculerPaiement(1000, [{ mode: 'CHEQUE', montant: 1000 }])).toThrow(/invalide/);
    expect(() => calculerPaiement(1000, [{ mode: 'WAVE', montant: -1000 }])).toThrow(/invalide/);
  });
});

describe('Commandes — modification en caisse', () => {
  const meds = { 1: { nom: 'Paracétamol', ordonnance: false }, 2: { nom: 'Amoxicilline', ordonnance: true } };
  const avant = [
    { medicamentId: 1, nom: 'Paracétamol', quantite: 3 },
    { medicamentId: 2, nom: 'Amoxicilline', quantite: 2 },
  ];

  it('réduire un médicament sur ordonnance est permis', () => {
    expect(hausseSurOrdonnance([{ medicamentId: 2, quantite: 1 }], avant, meds)).toEqual([]);
  });

  it('augmenter un médicament sur ordonnance est signalé', () => {
    expect(hausseSurOrdonnance([{ medicamentId: 2, quantite: 3 }], avant, meds)).toEqual(['Amoxicilline']);
  });

  it('résume les changements de façon lisible', () => {
    const resume = resumerModification(
      { lignes: avant, partPatient: 6500, assuranceNom: 'IPM' },
      {
        lignes: [
          { medicamentId: 1, nom: 'Paracétamol', quantite: 2 },
          { medicamentId: 3, nom: 'Vitamine C', quantite: 1 },
        ],
        partPatient: 2800,
        assuranceNom: null,
      },
    );
    expect(resume).toEqual([
      'Paracétamol : 3 → 2',
      'Retrait Amoxicilline (× 2)',
      'Ajout Vitamine C × 1',
      'Assurance : IPM → aucun(e)',
      expect.stringMatching(/^Part patient : 6.500 F → 2.800 F$/),
    ]);
  });

  it('aucun changement → résumé vide', () => {
    const c = { lignes: avant, partPatient: 100 };
    expect(resumerModification(c, c)).toEqual([]);
  });
});

describe('Commandes — qui peut annuler ?', () => {
  const enAttente = { statut: 'EN_ATTENTE', vendeurId: 10 };
  const payee = { statut: 'PAYEE', vendeurId: 10 };

  it('la vendeuse annule SA commande en attente, pas celle des autres', () => {
    expect(canCancelCommande(user(10, ROLES.VENDEUR), enAttente)).toBe(true);
    expect(canCancelCommande(user(11, ROLES.VENDEUR), enAttente)).toBe(false);
  });
  it('la vendeuse ne peut plus annuler une commande payée', () => {
    expect(canCancelCommande(user(10, ROLES.VENDEUR), payee)).toBe(false);
  });
  it('le pharmacien peut annuler une commande payée', () => {
    expect(canCancelCommande(user(1, ROLES.PHARMACIEN), payee)).toBe(true);
  });
  it('le caissier ne peut pas annuler', () => {
    expect(canCancelCommande(user(10, ROLES.CAISSIER), enAttente)).toBe(false);
  });
});
