import { Link } from 'react-router-dom';
import { getDashboard } from '../../services/commandeService';
import { useAsync } from '../../hooks/useAsync';
import { useEvenements } from '../../services/evenements';
import { Badge, EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { formatDate, formatMoney } from '../../utils/format';
import { MODES_PAIEMENT } from '../../domain/commande';
import { BarresHorizontales, VentesParJour } from './Charts';

export default function DashboardPage() {
  const { data, loading, error, reload } = useAsync(getDashboard);
  useEvenements(() => reload()); // chiffres mis à jour en direct

  if (loading && !data) return <Loading />;
  if (error) return <ErrorMessage error={error} />;

  return (
    <>
      <PageHeader title={`Bonjour, ${data.utilisateur}`} subtitle="Le contenu de cette page dépend de vos permissions." />

      <div className="stats">
        {data.ventes && (
          <div className="stat card">
            <span className="stat-label">
              Encaissé aujourd’hui {data.ventes.portee === 'OWN' ? '(vos commandes)' : '(toute l’officine)'}
            </span>
            <span className="stat-value">{formatMoney(data.ventes.encaisse)}</span>
            <span className="muted">
              {data.ventes.nombre} commande(s) payée(s)
              {data.ventes.assurances > 0 && <> · {formatMoney(data.ventes.assurances)} à facturer aux assurances</>}
            </span>
          </div>
        )}
        {data.enAttente && (
          <div className="stat card">
            <span className="stat-label">En attente à la caisse</span>
            <span className="stat-value">{data.enAttente.nombre}</span>
            <span className="muted">{formatMoney(data.enAttente.montant)} à encaisser</span>
          </div>
        )}
        {data.alertesStock && (
          <div className="stat card">
            <span className="stat-label">Produits sous le seuil</span>
            <span className="stat-value">{data.alertesStock.length}</span>
            <Link to="/stock">Voir le stock →</Link>
          </div>
        )}
        {data.alertesPeremption && (
          <div className="stat card">
            <span className="stat-label">Lots périmés / proches</span>
            <span className="stat-value">{data.alertesPeremption.length}</span>
            <span className="muted">à retirer ou vendre en priorité</span>
          </div>
        )}
      </div>

      {data.ventes14j && (
        <section className="card">
          <h2>Ventes des 14 derniers jours (FCFA)</h2>
          <VentesParJour jours={data.ventes14j} />
        </section>
      )}

      {data.modes30j && (
        <div className="charts-row">
          <section className="card">
            <h2>Encaissements par moyen de paiement — 30 jours</h2>
            {data.modes30j.length === 0 ? (
              <EmptyState>Aucun encaissement.</EmptyState>
            ) : (
              <BarresHorizontales items={data.modes30j} libelle={(m) => MODES_PAIEMENT[m.mode]} valeur={(m) => m.montant} />
            )}
          </section>
          <section className="card">
            <h2>Top 5 des produits — 30 jours</h2>
            {data.top30j.length === 0 ? (
              <EmptyState>Aucune vente.</EmptyState>
            ) : (
              <BarresHorizontales
                items={data.top30j}
                libelle={(p) => p.nom}
                valeur={(p) => p.montant}
                detail={(p) => `${p.quantite} boîte(s)`}
              />
            )}
          </section>
        </div>
      )}

      {data.alertesStock && (
        <section className="card">
          <div className="item-row">
            <h2>Alertes de stock</h2>
            <Link to="/reapprovisionnement">Proposition de commande →</Link>
          </div>
          {data.alertesStock.length === 0 ? (
            <EmptyState>Aucune alerte 🎉</EmptyState>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th className="num">Stock vendable</th>
                  <th className="num">Seuil</th>
                  <th>État</th>
                </tr>
              </thead>
              <tbody>
                {data.alertesStock.map((m) => (
                  <tr key={m.id}>
                    <td>{m.nom}</td>
                    <td className="num">{m.stock}</td>
                    <td className="num">{m.seuil}</td>
                    <td>{m.stock === 0 ? <Badge tone="danger">Rupture</Badge> : <Badge tone="warning">Stock bas</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {data.alertesPeremption && data.alertesPeremption.length > 0 && (
        <section className="card">
          <h2>Péremptions</h2>
          <table>
            <thead>
              <tr>
                <th>Médicament</th>
                <th>Lot</th>
                <th className="num">Qté</th>
                <th>Péremption</th>
                <th>État</th>
              </tr>
            </thead>
            <tbody>
              {data.alertesPeremption.map((l) => (
                <tr key={l.id}>
                  <td>{l.medicamentNom}</td>
                  <td>{l.numeroLot}</td>
                  <td className="num">{l.quantite}</td>
                  <td>{formatDate(l.datePeremption)}</td>
                  <td>{l.statut === 'PERIME' ? <Badge tone="danger">Périmé</Badge> : <Badge tone="warning">&lt; 90 jours</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
