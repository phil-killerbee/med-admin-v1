import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import {
  createMedicament,
  deleteMedicament,
  listMedicaments,
  updateMedicament,
} from '../../services/medicamentService';
import { useAsync } from '../../hooks/useAsync';
import { usePagination } from '../../hooks/usePagination';
import { usePersistentState } from '../../hooks/usePersistentState';
import { Can } from '../../auth/Can';
import { PERMISSIONS } from '../../config/roles';
import { Alert, Badge, EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { ListToolbar } from '../../components/ListToolbar';
import { formatMoney } from '../../utils/format';
import { MedicamentForm } from './MedicamentForm';
import { MedicamentCard } from './MedicamentCard';

const PAGE_SIZE = 6;

export default function MedicamentsPage() {
  const { data: medicaments, loading, error, reload } = useAsync(listMedicaments);
  const [search, setSearch] = useState('');
  const [view, setView] = usePersistentState('pharmacours-vue-medicaments', 'grid');
  const [editing, setEditing] = useState(null); // null | 'new' | medicament
  const [message, setMessage] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Donnée DÉRIVÉE : calculée à partir de l'état, pas stockée dans un autre useState.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return medicaments ?? [];
    return (medicaments ?? []).filter(
      (m) => m.nom.toLowerCase().includes(q) || m.dci.toLowerCase().includes(q) || m.code.includes(q),
    );
  }, [medicaments, search]);

  const pagination = usePagination(filtered, PAGE_SIZE);

  function handleSearch(value) {
    setSearch(value);
    pagination.reset(); // nouvelle recherche → retour page 1
  }

  function startEdit(target) {
    setMessage(null);
    setEditing(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(values) {
    if (editing === 'new') await createMedicament(values);
    else await updateMedicament(editing.id, values);
    setMessage(editing === 'new' ? 'Médicament ajouté' : 'Médicament modifié');
    setEditing(null);
    reload();
  }

  async function handleDelete(m) {
    if (!window.confirm(`Supprimer « ${m.nom} » ?`)) return;
    setActionError(null);
    try {
      await deleteMedicament(m.id);
      setMessage('Médicament supprimé');
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Gestion des médicaments"
        actions={
          <Can permission={PERMISSIONS.MEDICAMENT_CREATE}>
            <button className="btn btn-success" onClick={() => startEdit('new')}>
              <Plus size={16} /> Nouveau médicament
            </button>
          </Can>
        }
      />

      <Alert type="success">{message}</Alert>
      <ErrorMessage error={actionError} />

      {editing && (
        <MedicamentForm
          key={editing === 'new' ? 'new' : editing.id}
          initial={
            editing === 'new'
              ? null
              : { ...editing, prixVente: String(editing.prixVente), seuilAlerte: String(editing.seuilAlerte) }
          }
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      )}

      <ListToolbar
        view={view}
        onViewChange={setView}
        pagination={pagination}
        search={search}
        onSearchChange={handleSearch}
        placeholder="Nom, DCI ou code CIP…"
        unit="médicament(s)"
      />

      {loading && <Loading />}
      <ErrorMessage error={error} />
      {!loading && !error && filtered.length === 0 && <EmptyState>Aucun médicament trouvé.</EmptyState>}

      {!loading && pagination.pageItems.length > 0 &&
        (view === 'grid' ? (
          <div className="item-grid">
            {pagination.pageItems.map((m) => (
              <MedicamentCard key={m.id} medicament={m} onEdit={startEdit} onDelete={handleDelete} />
            ))}
          </div>
        ) : (
          <section className="card">
            <MedicamentTable items={pagination.pageItems} onEdit={startEdit} onDelete={handleDelete} />
          </section>
        ))}
    </>
  );
}

function MedicamentTable({ items, onEdit, onDelete }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Nom</th>
          <th>DCI</th>
          <th>Code CIP</th>
          <th>Liste</th>
          <th className="num">Prix</th>
          <th className="num">Stock</th>
          <th aria-label="Actions" />
        </tr>
      </thead>
      <tbody>
        {items.map((m) => (
          <tr key={m.id}>
            <td>
              <strong className="link-like">{m.nom}</strong>
              <div className="muted small">{m.forme}</div>
            </td>
            <td>{m.dci}</td>
            <td className="mono">{m.code}</td>
            <td>{m.ordonnance ? <Badge tone="info">Ordonnance</Badge> : <Badge>Libre</Badge>}</td>
            <td className="num">{formatMoney(m.prixVente)}</td>
            <td className="num">
              {m.stock === 0 ? (
                <Badge tone="danger">Rupture</Badge>
              ) : m.stock <= m.seuilAlerte ? (
                <Badge tone="warning">{m.stock}</Badge>
              ) : (
                m.stock
              )}
            </td>
            <td className="row-actions">
              <Can permission={PERMISSIONS.MEDICAMENT_UPDATE}>
                <button className="btn btn-small btn-primary" onClick={() => onEdit(m)}>
                  Modifier
                </button>
              </Can>
              <Can permission={PERMISSIONS.MEDICAMENT_DELETE}>
                <button className="btn btn-small btn-danger" onClick={() => onDelete(m)}>
                  Supprimer
                </button>
              </Can>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
