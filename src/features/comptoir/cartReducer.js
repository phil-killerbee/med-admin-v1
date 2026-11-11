/**
 * Logique de la commande en cours, isolée dans un REDUCER pur :
 * - toutes les transitions d'état au même endroit
 * - testable sans React (voir cartReducer.test.js)
 */
export const initialCart = {
  lignes: [],
  patientId: null, // fiche patient choisie (facultative)
  patientNom: '',
  ordonnanceRef: '',
  assure: false,
  assuranceId: '',
  numeroAssure: '',
};

const PATIENT_FIELDS = ['patientNom', 'ordonnanceRef', 'assuranceId', 'numeroAssure'];

export function cartReducer(state, action) {
  switch (action.type) {
    case 'ADD': {
      const { medicament } = action;
      const existante = state.lignes.find((l) => l.medicament.id === medicament.id);
      if (existante) {
        if (existante.quantite >= medicament.stock) return state; // pas plus que le stock
        return {
          ...state,
          lignes: state.lignes.map((l) =>
            l.medicament.id === medicament.id ? { ...l, quantite: l.quantite + 1 } : l,
          ),
        };
      }
      return { ...state, lignes: [...state.lignes, { medicament, quantite: 1 }] };
    }
    case 'SET_QTY': {
      const quantite = Math.floor(Number(action.quantite));
      if (!Number.isFinite(quantite)) return state;
      if (quantite <= 0) {
        return { ...state, lignes: state.lignes.filter((l) => l.medicament.id !== action.id) };
      }
      return {
        ...state,
        lignes: state.lignes.map((l) =>
          l.medicament.id === action.id ? { ...l, quantite: Math.min(quantite, l.medicament.stock) } : l,
        ),
      };
    }
    case 'REMOVE':
      return { ...state, lignes: state.lignes.filter((l) => l.medicament.id !== action.id) };
    case 'SET_FIELD':
      if (!PATIENT_FIELDS.includes(action.field)) throw new Error(`Champ inconnu : ${action.field}`);
      return { ...state, [action.field]: action.value };
    case 'SELECT_PATIENT': {
      // La fiche patient pré-remplit le nom et, si elle en a une ACTIVE, l'assurance.
      const { patient } = action;
      const assurance = patient.assuranceId && patient.assuranceActive;
      return {
        ...state,
        patientId: patient.id,
        patientNom: patient.nom,
        ...(assurance
          ? { assure: true, assuranceId: String(patient.assuranceId), numeroAssure: patient.numeroAssure ?? '' }
          : {}),
      };
    }
    case 'CLEAR_PATIENT':
      return { ...state, patientId: null, patientNom: '' };
    case 'SET_ASSURE':
      // Décocher "assuré" efface les infos d'assurance : pas de données incohérentes.
      return action.value ? { ...state, assure: true } : { ...state, assure: false, assuranceId: '', numeroAssure: '' };
    case 'CLEAR':
      return initialCart;
    default:
      throw new Error(`Action inconnue : ${action.type}`);
  }
}

export const cartTotal = (cart) => cart.lignes.reduce((s, l) => s + l.medicament.prixVente * l.quantite, 0);

/** Ce qui part vers l'API : uniquement des identifiants, quantités et infos patient. */
export function toCommandePayload(cart) {
  return {
    lignes: cart.lignes.map((l) => ({ medicamentId: l.medicament.id, quantite: l.quantite })),
    patientId: cart.patientId,
    patientNom: cart.patientNom,
    ordonnanceRef: cart.ordonnanceRef,
    assuranceId: cart.assure && cart.assuranceId ? Number(cart.assuranceId) : null,
    numeroAssure: cart.assure ? cart.numeroAssure : '',
  };
}
