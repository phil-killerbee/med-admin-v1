import { useState } from 'react';
import { formatMoney } from '../../utils/format';

/**
 * Graphiques du tableau de bord, en SVG / HTML simple (aucune librairie).
 * Couleurs : 2 teintes catégorielles validées (daltonisme, contraste) — voir styles.css (--series-*).
 * Le texte reste dans les couleurs de texte ; la couleur ne porte que l'identité de la série.
 */

const W = 640;
const H = 220;
const M = { top: 12, right: 8, bottom: 26, left: 56 };
const GAP = 2; // espace de 2 px entre segments empilés

const jourCourt = (iso) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};
const jourLong = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Arrondit le maximum de l'axe à une valeur « ronde » (1, 2, 5 × 10^n). */
function maxRond(v) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((k) => k * p).find((x) => x >= v);
}

/** Rectangle dont seul le haut est arrondi (rayon 4) : la base reste posée sur l'axe. */
function barreHautArrondi(x, y, w, h, r = 4) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

/** Ventes des 14 derniers jours : barres empilées part patient + part assurance. */
export function VentesParJour({ jours }) {
  const [survol, setSurvol] = useState(null);
  const [tableau, setTableau] = useState(false);
  const max = maxRond(Math.max(...jours.map((j) => j.patient + j.assurance)));
  const ih = H - M.top - M.bottom;
  const iw = W - M.left - M.right;
  const pas = iw / jours.length;
  const bw = Math.min(28, pas * 0.6);
  const y = (v) => M.top + ih - (v / max) * ih;
  const graduations = [0, max / 2, max];
  const actif = survol !== null ? jours[survol] : null;

  return (
    <figure className="chart">
      <div className="chart-head">
        <ul className="chart-legend">
          <li>
            <span className="swatch" style={{ background: 'var(--series-1)' }} /> Payé par les patients
          </li>
          <li>
            <span className="swatch" style={{ background: 'var(--series-2)' }} /> À facturer aux assurances
          </li>
        </ul>
        <button className="btn btn-small btn-ghost" onClick={() => setTableau((t) => !t)}>
          {tableau ? 'Voir le graphique' : 'Voir en tableau'}
        </button>
      </div>

      {tableau ? (
        <table>
          <thead>
            <tr>
              <th>Jour</th>
              <th className="num">Commandes</th>
              <th className="num">Patients</th>
              <th className="num">Assurances</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((j) => (
              <tr key={j.jour}>
                <td>{jourLong(j.jour)}</td>
                <td className="num">{j.nombre}</td>
                <td className="num">{formatMoney(j.patient)}</td>
                <td className="num">{formatMoney(j.assurance)}</td>
                <td className="num">{formatMoney(j.patient + j.assurance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-plot">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventes des 14 derniers jours, par jour">
            {graduations.map((g) => (
              <g key={g}>
                <line x1={M.left} x2={W - M.right} y1={y(g)} y2={y(g)} className="chart-grid" />
                <text x={M.left - 8} y={y(g)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
                  {g.toLocaleString('fr-FR')}
                </text>
              </g>
            ))}
            {jours.map((j, i) => {
              const cx = M.left + pas * i + pas / 2;
              const x = cx - bw / 2;
              const hp = (j.patient / max) * ih;
              const ha = (j.assurance / max) * ih;
              const base = M.top + ih;
              const aujourdhui = i === jours.length - 1;
              return (
                <g key={j.jour}>
                  {hp > 0 && (
                    <path
                      d={ha > 0 ? `M${x},${base} h${bw} v${-hp} h${-bw} Z` : barreHautArrondi(x, base - hp, bw, hp)}
                      fill="var(--series-1)"
                      opacity={survol === null || survol === i ? 1 : 0.45}
                    />
                  )}
                  {ha > 0 && (
                    <path
                      d={barreHautArrondi(x, base - hp - ha - (hp > 0 ? GAP : 0), bw, ha)}
                      fill="var(--series-2)"
                      opacity={survol === null || survol === i ? 1 : 0.45}
                    />
                  )}
                  {(i % 2 === 1 || aujourdhui) && (
                    <text x={cx} y={H - 8} className="chart-axis" textAnchor="middle">
                      {aujourdhui ? 'Auj.' : jourCourt(j.jour)}
                    </text>
                  )}
                  {/* Zone de survol : toute la colonne (plus grande que la barre) */}
                  <rect
                    x={M.left + pas * i}
                    y={M.top}
                    width={pas}
                    height={ih}
                    fill="transparent"
                    onMouseEnter={() => setSurvol(i)}
                    onMouseLeave={() => setSurvol(null)}
                  />
                </g>
              );
            })}
          </svg>
          {actif && (
            <div
              className="chart-tooltip"
              // Près des bords, l'infobulle s'aligne vers l'intérieur pour ne pas déborder
              style={{
                left: `${((M.left + pas * survol + pas / 2) / W) * 100}%`,
                transform: `translateX(${survol > jours.length - 4 ? '-100%' : survol < 3 ? '0' : '-50%'})`,
              }}
              role="status"
            >
              <strong>{jourLong(actif.jour)}</strong>
              <div className="tooltip-row">
                <span className="swatch" style={{ background: 'var(--series-1)' }} /> Patients
                <b>{formatMoney(actif.patient)}</b>
              </div>
              <div className="tooltip-row">
                <span className="swatch" style={{ background: 'var(--series-2)' }} /> Assurances
                <b>{formatMoney(actif.assurance)}</b>
              </div>
              <div className="tooltip-row muted">
                {actif.nombre} commande(s) <b>{formatMoney(actif.patient + actif.assurance)}</b>
              </div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/**
 * Barres horizontales (une seule série : le titre la nomme, pas de légende).
 * Chaque barre porte son libellé et sa valeur en clair : lisible sans survol ni couleur.
 */
export function BarresHorizontales({ items, libelle, valeur, detail }) {
  const max = Math.max(...items.map(valeur), 1);
  return (
    <ul className="hbars">
      {items.map((it) => (
        <li key={libelle(it)} title={`${libelle(it)} : ${formatMoney(valeur(it))}${detail ? ` — ${detail(it)}` : ''}`}>
          <div className="hbar-label">
            <span>{libelle(it)}</span>
            <span>
              <strong>{formatMoney(valeur(it))}</strong>
              {detail && <span className="muted small"> · {detail(it)}</span>}
            </span>
          </div>
          <div className="hbar-track">
            <span style={{ width: `${(valeur(it) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
