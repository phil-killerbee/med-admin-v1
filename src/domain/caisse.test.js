import { describe, expect, it } from 'vitest';
import { calculerCloture, calculerRetour, canRetourCommande, libelleEcart, quantitesRetournables } from './caisse';
import { quantiteAReapprovisionner } from './stock';
import { trouverParCode } from './medicament';
import { validatePatient } from './patient';
import { ROLES } from '../config/roles';

const user = (id, role) => ({ id, role, actif: true });

// Commande payée : 3 × 1000 + 2 × 2500 = 8000, assurance 80 %
const commande = {
  statut: 'PAYEE',
  taux: 80,
  paiement: { caissierId: 6 },
  lignes: [
    { id: 1, nom: 'Paracétamol', quantite: 3, prixUnitaire: 1000 },
    { id: 2, nom: 'Amoxicilline', quantite: 2, prixUnitaire: 2500 },
  ],
  retours: [],
};

describe('Retour / avoir', () => {
  it('rembourse au patient sa part, et réduit la part assurance', () => {
    expect(calculerRetour(commande, [{ ligneId: 2, quantite: 1 }])).toEqual({
      lignes: [{ ligneId: 2, nom: 'Amoxicilline', quantite: 1, prixUnitaire: 2500 }],
      montant: 2500,
      partAssurance: 2000,
      partPatient: 500,
    });
  });

  it('refuse de retourner plus que ce qui reste', () => {
    const avecRetour = {
      ...commande,
      retours: [{ montant: 2000, partAssurance: 1600, lignes: [{ ligneId: 1, quantite: 2 }] }],
    };
    expect(quantitesRetournables(avecRetour.lignes, avecRetour.retours)).toEqual({ 1: 1, 2: 2 });
    expect(() => calculerRetour(avecRetour, [{ ligneId: 1, quantite: 2 }])).toThrow(/1 boîte/);
    expect(() => calculerRetour(commande, [])).toThrow(/au moins une/);
  });

  it('plusieurs retours partiels rendent EXACTEMENT les montants d’origine (pas d’erreur d’arrondi)', () => {
    const c = { ...commande, taux: 33, lignes: [{ id: 1, nom: 'X', quantite: 3, prixUnitaire: 1001 }] };
    const r1 = calculerRetour(c, [{ ligneId: 1, quantite: 1 }]);
    const r2 = calculerRetour({ ...c, retours: [{ ...r1, lignes: [{ ligneId: 1, quantite: 1 }] }] }, [
      { ligneId: 1, quantite: 2 },
    ]);
    expect(r1.partAssurance + r2.partAssurance).toBe(Math.round((3003 * 33) / 100));
    expect(r1.montant + r2.montant).toBe(3003);
  });

  it('le caissier ne traite que SES encaissements ; le pharmacien tous ; la vendeuse aucun', () => {
    expect(canRetourCommande(user(6, ROLES.CAISSIER), commande)).toBe(true);
    expect(canRetourCommande(user(7, ROLES.CAISSIER), commande)).toBe(false);
    expect(canRetourCommande(user(2, ROLES.PHARMACIEN), commande)).toBe(true);
    expect(canRetourCommande(user(4, ROLES.VENDEUR), commande)).toBe(false);
    expect(canRetourCommande(user(6, ROLES.CAISSIER), { ...commande, statut: 'EN_ATTENTE' })).toBe(false);
  });
});

describe('Clôture de caisse', () => {
  const paiements = [
    { mode: 'ESPECES', montant: 5000 },
    { mode: 'ESPECES', montant: 1200 },
    { mode: 'ORANGE_MONEY', montant: 3000 },
  ];
  it('totalise par moyen de paiement, avoirs déduits', () => {
    const z = calculerCloture({ paiements, remboursements: [{ mode: 'ESPECES', montant: 500 }], especesComptees: 5700 });
    expect(z.parMode.ESPECES).toEqual({ encaisse: 6200, rembourse: 500, net: 5700 });
    expect(z.parMode.ORANGE_MONEY.net).toBe(3000);
    expect(z.totalNet).toBe(8700);
    expect(z.ecart).toBe(0);
    expect(libelleEcart(z.ecart)).toBe('Caisse juste');
  });
  it('calcule l’écart (manque ou excédent)', () => {
    expect(calculerCloture({ paiements, especesComptees: 6000 }).ecart).toBe(-200);
    expect(libelleEcart(-200)).toMatch(/Manque de 200/);
    expect(libelleEcart(300)).toMatch(/Excédent de 300/);
    expect(calculerCloture({ paiements, especesComptees: '' }).ecart).toBeNull();
  });
});

describe('Réapprovisionnement', () => {
  it('ne commande rien si le stock est confortable', () => {
    expect(quantiteAReapprovisionner({ stock: 100, seuil: 20, ventes30j: 30 })).toBe(0);
  });
  it('sous le seuil : de quoi tenir 30 jours + le stock de sécurité', () => {
    expect(quantiteAReapprovisionner({ stock: 10, seuil: 20, ventes30j: 60 })).toBe(70);
  });
  it('rupture sans ventes récentes : au moins 2 × le seuil', () => {
    expect(quantiteAReapprovisionner({ stock: 0, seuil: 10, ventes30j: 0 })).toBe(20);
  });
  it('stock au-dessus du seuil mais qui ne couvre pas 15 jours de ventes', () => {
    expect(quantiteAReapprovisionner({ stock: 25, seuil: 20, ventes30j: 80 })).toBe(75);
  });
});

describe('Lecteur de code-barres', () => {
  const meds = [{ id: 1, code: '3400930000011' }];
  it('trouve le médicament par son code exact', () => {
    expect(trouverParCode(meds, ' 3400930000011 ')?.id).toBe(1);
    expect(trouverParCode(meds, '34009300')).toBeNull();
    expect(trouverParCode(meds, 'paracétamol')).toBeNull();
  });
});

describe('Fiche patient', () => {
  it('nom obligatoire, téléphone valide, n° d’assuré si assurance', () => {
    expect(validatePatient({ nom: 'Khady Sarr', telephone: '77 123 45 67' })).toEqual({});
    expect(Object.keys(validatePatient({ nom: '', telephone: 'abc', assuranceId: 1 }))).toEqual([
      'nom',
      'telephone',
      'numeroAssure',
    ]);
  });
});
