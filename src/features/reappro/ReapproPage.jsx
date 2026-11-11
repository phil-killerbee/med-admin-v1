import { useMemo, useState } from 'react';
import { getReappro } from '../../services/caisseService';
import { useAsync } from '../../hooks/useAsync';
import { todayIso } from '../../domain/dates';
import { Badge, EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { formatDate } from '../../utils/format';
import { BoutonImprimer, EnteteOfficine } from '../commandes/Ticket';

function etat(m) {
  if (m.stock === 0) return <Badge tone="danger">Rupture</Badge>;
  if (m.stock <= m.seuil) return <Badge tone="warning">Sous le seuil</Badge>;
  if (m.proposition > 0) return <Badge tone="warning">Ventes rapides</Badge>;
  return <Badge tone="success">OK</Badge>;
}

/**
 * RÉAPPROVISIONNEMENT — alertes de stock + proposition de commande au fournisseur.
 * La quantité proposée vient d'une règle MÉTIER pure (quantiteAReapprovisionner, testée) ;
 * le pharmacien peut l'ajuster avant d'imprimer le bon de commande.
 */
export default function ReapproPage() {
  const { data, loading, error } = useAsync(getReappro);
  const [tous, setTous] = useState(false);
  const [quantites, setQuantites] = useState({}); // ajustements manuels

  const qte = (m) => (quantites[m.id] ?? m.proposition);
  const lignes = useMemo(
    () => (data ?? []).filter((m) => tous || m.proposition > 0 || m.stockProchePeremption > 0 || m.stockPerime > 0),
    [data, tous],
  );
  const bon = (data ?? []).filter((m) => Number(qte(m)) > 0);

  return (
    <>
      <PageHeader
        title="Réapprovisionnement"
        subtitle="Alertes de stock et proposition de commande fournisseur (30 jours de ventes + stock de sécurité)"
        actions={
          <BoutonImprimer className="btn btn-primary" label={`Bon de commande (${bon.length})`}>
            <BonDeCommande lignes={bon.map((m) => ({ ...m, quantite: Number(qte(m)) }))} />
          </BoutonImprimer>
        }
      />

      <div className="segmented" role="tablist" aria-label="Filtre">
        <button role="tab" aria-selected={!tous} className={!tous ? 'active' : ''} onClick={() => setTous(false)}>
          À traiter
        </button>
        <button role="tab" aria-selected={tous} className={tous ? 'active' : ''} onClick={() => setTous(true)}>
          Tous les produits
        </button>
      </div>

      <section className="card">
        {loading && <Loading />}
        <ErrorMessage error={error} />
        {data && lignes.length === 0 && <EmptyState>Rien à commander, aucun lot à surveiller 🎉</EmptyState>}
        {lignes.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Médicament</th>
                  <th className="num">Stock vendable</th>
                  <th className="num">Seuil</th>
                  <th className="num">Ventes 30 j</th>
                  <th className="num" title="Périme dans moins de 90 jours">Proche péremption</th>
                  <th className="num">Périmé à retirer</th>
                  <th>État</th>
                  <th className="num">À commander</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.nom}
                      <div className="muted small mono">{m.code}</div>
                    </td>
                    <td className="num">{m.stock}</td>
                    <td className="num">{m.seuil}</td>
                    <td className="num">{m.ventes30j}</td>
                    <td className="num">{m.stockProchePeremption ? <Badge tone="warning">{m.stockProchePeremption}</Badge> : '—'}</td>
                    <td className="num">{m.stockPerime ? <Badge tone="danger">{m.stockPerime}</Badge> : '—'}</td>
                    <td>{etat(m)}</td>
                    <td className="num">
                      <input
                        className="qty"
                        type="number"
                        min="0"
                        value={qte(m)}
                        onChange={(e) => setQuantites((q) => ({ ...q, [m.id]: e.target.value }))}
                        aria-label={`Quantité à commander ${m.nom}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function BonDeCommande({ lignes }) {
  return (
    <div className="print-doc">
      <EnteteOfficine />
      <h1 className="center">Bon de commande fournisseur</h1>
      <p className="center">Date : {formatDate(todayIso())}</p>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Désignation</th>
            <th>Forme</th>
            <th className="num">Quantité</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((m) => (
            <tr key={m.id}>
              <td className="mono">{m.code}</td>
              <td>{m.nom}</td>
              <td>{m.forme}</td>
              <td className="num">{m.quantite}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>Signature du pharmacien :</p>
    </div>
  );
}
