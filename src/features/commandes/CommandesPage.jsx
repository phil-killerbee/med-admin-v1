import { useMemo, useState } from 'react';
import { annulerCommande, listCommandes } from '../../services/commandeService';
import { useAsync } from '../../hooks/useAsync';
import { usePagination } from '../../hooks/usePagination';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useAuth } from '../../auth/useAuth';
import { STATUT_LABELS, canCancelCommande } from '../../domain/commande';
import { Alert, EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { ListToolbar } from '../../components/ListToolbar';
import { formatDateTime, formatMoney } from '../../utils/format';
import { CommandeCard } from './CommandeCard';
import { RetourForm } from './Retour';
import { Modal } from '../../components/Modal';
import { useEvenements } from '../../services/evenements';
import { canRetourCommande } from '../../domain/caisse';
import { StatutBadge } from './CommandeDetails';

const PAGE_SIZE = 6;
const EMPTY = [];
const FILTRES = [['', 'Toutes'], ...Object.entries(STATUT_LABELS)];

export default function CommandesPage() {
  const { user } = useAuth();
  const [statut, setStatut] = useState('');
  // Le filtre de statut est envoyé à l'API : le serveur ne renvoie que ce qui est demandé.
  const { data, loading, error, reload } = useAsync(() => listCommandes(statut), [statut]);
  const [search, setSearch] = useState('');
  const [view, setView] = usePersistentState('pharmacours-vue-commandes', 'grid');
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);
  const [retour, setRetour] = useState(null); // commande en cours de retour (fenêtre)

  // En direct : une commande créée / payée / annulée ailleurs → la liste se met à jour.
  useEvenements(() => {
    if (!retour) reload();
  });

  const commandes = data?.commandes ?? EMPTY;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commandes;
    return commandes.filter((c) =>
      [String(c.id), c.vendeurNom, c.patientNom, c.ordonnanceRef, c.assurance?.nom, ...c.lignes.map((l) => l.nom)]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q)),
    );
  }, [commandes, search]);

  const pagination = usePagination(filtered, PAGE_SIZE);

  async function handleAnnuler(c) {
    const motif = window.prompt(
      c.statut === 'PAYEE'
        ? 'Commande DÉJÀ PAYÉE : le patient devra être remboursé.\nMotif de l’annulation :'
        : 'Motif de l’annulation :',
    );
    if (motif === null) return;
    setActionError(null);
    try {
      await annulerCommande(c.id, motif);
      setMessage(`Commande n°${c.id} annulée, stock réintégré dans les lots d’origine`);
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Commandes"
        subtitle={
          data &&
          ({
            ALL: 'Portée : toutes les commandes de l’officine',
            FILE_CAISSE: 'Portée : toutes les commandes en attente de paiement (file de la caisse)',
            OWN: 'Portée : les commandes que vous avez enregistrées ou encaissées (filtrage côté serveur)',
          }[data.portee])
        }
      />
      <Alert type="success">{message}</Alert>
      <ErrorMessage error={actionError} />

      <div className="segmented" role="tablist" aria-label="Filtrer par statut">
        {FILTRES.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            aria-selected={statut === value}
            className={statut === value ? 'active' : ''}
            onClick={() => {
              setStatut(value);
              pagination.reset();
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <ListToolbar
        view={view}
        onViewChange={setView}
        pagination={pagination}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          pagination.reset();
        }}
        placeholder="N°, vendeur, patient, assurance…"
        unit="commande(s)"
      />

      {loading && <Loading />}
      <ErrorMessage error={error} />
      {!loading && !error && filtered.length === 0 && <EmptyState>Aucune commande.</EmptyState>}

      {!loading && pagination.pageItems.length > 0 &&
        (view === 'grid' ? (
          <div className="item-grid">
            {pagination.pageItems.map((c) => (
              <CommandeCard key={c.id} commande={c} onAnnuler={handleAnnuler} onRetour={setRetour} />
            ))}
          </div>
        ) : (
          <section className="card">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Date</th>
                  <th>Vendeur</th>
                  <th>Patient / assurance</th>
                  <th className="num">Total</th>
                  <th className="num">Part patient</th>
                  <th>Statut</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((c) => (
                  <tr key={c.id} className={c.statut === 'ANNULEE' ? 'row-muted' : ''}>
                    <td>{c.id}</td>
                    <td>{formatDateTime(c.date)}</td>
                    <td>{c.vendeurNom}</td>
                    <td className="small">
                      {c.patientNom ?? '—'}
                      {c.assurance && (
                        <div className="muted">
                          {c.assurance.nom} ({c.assurance.taux} %)
                        </div>
                      )}
                    </td>
                    <td className="num">{formatMoney(c.total)}</td>
                    <td className="num">{formatMoney(c.partPatient)}</td>
                    <td>
                      <StatutBadge statut={c.statut} />
                    </td>
                    <td className="row-actions">
                      {canRetourCommande(user, c) && (
                        <button className="btn btn-small" onClick={() => setRetour(c)}>
                          Retour
                        </button>
                      )}
                      {canCancelCommande(user, c) && c.retours.length === 0 && (
                        <button className="btn btn-small btn-danger" onClick={() => handleAnnuler(c)}>
                          Annuler
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

      {retour && (
        <Modal title={`Retour / avoir — commande n°${retour.id}`} onClose={() => setRetour(null)}>
          <RetourForm
            commande={retour}
            onCancel={() => {
              setRetour(null);
              reload();
            }}
            onDone={(r) => setMessage(`Avoir n°${r.id} enregistré sur la commande n°${retour.id}`)}
          />
        </Modal>
      )}
    </>
  );
}
