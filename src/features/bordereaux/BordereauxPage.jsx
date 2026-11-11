import { useMemo, useState } from 'react';
import { getBordereau } from '../../services/caisseService';
import { useAsync } from '../../hooks/useAsync';
import { todayIso } from '../../domain/dates';
import { EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { formatDate, formatMoney } from '../../utils/format';
import { BoutonImprimer, EnteteOfficine } from '../commandes/Ticket';

const nomMois = (mois) =>
  new Date(`${mois}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

/**
 * BORDEREAUX ASSURANCES — chaque mois, la pharmacie envoie à chaque assurance la liste
 * des ordonnances prises en charge pour se faire rembourser (tiers payant).
 * Les retours / avoirs sont déduits : on ne facture pas ce que le patient a rendu.
 */
export default function BordereauxPage() {
  const [mois, setMois] = useState(() => todayIso().slice(0, 7));
  const { data, loading, error } = useAsync(() => getBordereau(mois), [mois]);
  const [assuranceId, setAssuranceId] = useState(null);

  const parAssurance = useMemo(() => {
    const groupes = new Map();
    for (const l of data?.lignes ?? []) {
      if (!groupes.has(l.assuranceId)) groupes.set(l.assuranceId, { id: l.assuranceId, nom: l.assuranceNom, lignes: [] });
      groupes.get(l.assuranceId).lignes.push(l);
    }
    return [...groupes.values()].map((g) => ({
      ...g,
      total: g.lignes.reduce((s, l) => s + l.net, 0),
    }));
  }, [data]);

  const choisie = parAssurance.find((g) => g.id === assuranceId) ?? parAssurance[0];

  return (
    <>
      <PageHeader
        title="Bordereaux assurances"
        subtitle="Montants à facturer à chaque assurance (tiers payant), retours déduits"
        actions={
          <input
            type="month"
            value={mois}
            max={todayIso().slice(0, 7)}
            onChange={(e) => {
              setMois(e.target.value);
              setAssuranceId(null);
            }}
            aria-label="Mois"
          />
        }
      />
      {loading && <Loading />}
      <ErrorMessage error={error} />
      {data && parAssurance.length === 0 && (
        <div className="card">
          <EmptyState>Aucune prise en charge en {nomMois(mois)}.</EmptyState>
        </div>
      )}

      {parAssurance.length > 0 && (
        <>
          <div className="stats">
            {parAssurance.map((g) => (
              <button
                key={g.id}
                className={`stat card stat-button ${g.id === choisie.id ? 'active' : ''}`}
                onClick={() => setAssuranceId(g.id)}
              >
                <span className="stat-label">{g.nom}</span>
                <span className="stat-value">{formatMoney(g.total)}</span>
                <span className="muted">{g.lignes.length} ordonnance(s)</span>
              </button>
            ))}
          </div>

          <section className="card">
            <div className="item-row">
              <h2>
                {choisie.nom} — {nomMois(mois)}
              </h2>
              <BoutonImprimer className="btn btn-primary" label="Imprimer le bordereau">
                <DocumentBordereau groupe={choisie} mois={mois} />
              </BoutonImprimer>
            </div>
            <TableBordereau groupe={choisie} />
          </section>
        </>
      )}
    </>
  );
}

function TableBordereau({ groupe }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Commande</th>
            <th>Patient</th>
            <th>N° assuré</th>
            <th>Ordonnance</th>
            <th className="num">Total</th>
            <th className="num">Taux</th>
            <th className="num">Part assurance</th>
            <th className="num">Retours</th>
            <th className="num">À facturer</th>
          </tr>
        </thead>
        <tbody>
          {groupe.lignes.map((l) => (
            <tr key={l.id}>
              <td>{formatDate(l.date)}</td>
              <td>n°{l.id}</td>
              <td>{l.patientNom ?? '—'}</td>
              <td className="mono">{l.numeroAssure}</td>
              <td>{l.ordonnanceRef ?? '—'}</td>
              <td className="num">{formatMoney(l.total)}</td>
              <td className="num">{l.taux} %</td>
              <td className="num">{formatMoney(l.partAssurance)}</td>
              <td className="num">{l.retours ? `− ${formatMoney(l.retours)}` : '—'}</td>
              <td className="num">
                <strong>{formatMoney(l.net)}</strong>
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={9}>
              <strong>Total à facturer</strong>
            </td>
            <td className="num">
              <strong>{formatMoney(groupe.total)}</strong>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Version imprimable (A4) envoyée à l'assurance. */
function DocumentBordereau({ groupe, mois }) {
  return (
    <div className="print-doc">
      <EnteteOfficine />
      <h1 className="center">Bordereau de facturation — tiers payant</h1>
      <p className="center">
        <strong>{groupe.nom}</strong> — {nomMois(mois)} — {groupe.lignes.length} ordonnance(s)
      </p>
      <TableBordereau groupe={groupe} />
      <p>Arrêté le présent bordereau à la somme de {formatMoney(groupe.total)}.</p>
      <p>Cachet et signature du pharmacien :</p>
    </div>
  );
}
