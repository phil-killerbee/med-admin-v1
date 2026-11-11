import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { createUser, listUsers, updateUser } from '../../services/userService';
import { useAsync } from '../../hooks/useAsync';
import { usePagination } from '../../hooks/usePagination';
import { usePersistentState } from '../../hooks/usePersistentState';
import { ListToolbar } from '../../components/ListToolbar';
import { UserCard } from './UserCard';
import { useAuth } from '../../auth/useAuth';
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  ROLES,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from '../../config/roles';
import { Alert, Badge, EmptyState, ErrorMessage, Field, Loading, PageHeader } from '../../components/ui';

const PAGE_SIZE = 6;
const EMPTY = [];

export default function UsersPage() {
  const { user: me } = useAuth();
  const { data, loading, error, reload } = useAsync(listUsers);
  const [search, setSearch] = useState('');
  const [view, setView] = usePersistentState('pharmacours-vue-utilisateurs', 'grid');
  const [showForm, setShowForm] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [message, setMessage] = useState(null);

  const users = data ?? EMPTY;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.nom.toLowerCase().includes(q) ||
        u.login.includes(q) ||
        ROLE_LABELS[u.role].toLowerCase().includes(q),
    );
  }, [users, search]);

  const pagination = usePagination(filtered, PAGE_SIZE);

  async function handleUpdate(u, changes) {
    setActionError(null);
    try {
      await updateUser(u.id, changes);
      setMessage(`Utilisateur ${u.login} mis à jour`);
      reload();
    } catch (err) {
      setActionError(err);
    }
  }

  return (
    <>
      <PageHeader
        title="Utilisateurs & rôles"
        subtitle="Un changement de rôle prend effet immédiatement (les droits sont revérifiés à chaque action)"
        actions={
          <button className="btn btn-success" onClick={() => setShowForm(true)}>
            <Plus size={16} /> Nouvel utilisateur
          </button>
        }
      />
      <Alert type="success">{message}</Alert>
      <ErrorMessage error={actionError} />

      {showForm && (
        <UserForm
          onDone={() => {
            setShowForm(false);
            setMessage('Utilisateur créé');
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ListToolbar
        view={view}
        onViewChange={setView}
        pagination={pagination}
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          pagination.reset();
        }}
        placeholder="Nom, identifiant ou rôle…"
        unit="utilisateur(s)"
      />

      {loading && <Loading />}
      <ErrorMessage error={error} />
      {!loading && !error && filtered.length === 0 && <EmptyState>Aucun utilisateur trouvé.</EmptyState>}

      {!loading && pagination.pageItems.length > 0 && view === 'grid' && (
        <div className="item-grid section-gap">
          {pagination.pageItems.map((u) => (
            <UserCard key={u.id} user={u} isMe={u.id === me.id} onUpdate={handleUpdate} />
          ))}
        </div>
      )}

      {!loading && pagination.pageItems.length > 0 && view === 'list' && (
        <section className="card">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Identifiant</th>
                <th>Rôle</th>
                <th>Statut</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map((u) => {
                const isMe = u.id === me.id;
                return (
                  <tr key={u.id} className={u.actif ? '' : 'row-muted'}>
                    <td>
                      {u.nom} {isMe && <Badge tone="info">vous</Badge>}
                    </td>
                    <td className="mono">{u.login}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={isMe}
                        onChange={(e) => handleUpdate(u, { role: e.target.value })}
                        aria-label={`Rôle de ${u.login}`}
                      >
                        {Object.values(ROLES).map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{u.actif ? <Badge tone="success">Actif</Badge> : <Badge tone="danger">Désactivé</Badge>}</td>
                    <td>
                      {!isMe && (
                        <button className="btn btn-small" onClick={() => handleUpdate(u, { actif: !u.actif })}>
                          {u.actif ? 'Désactiver' : 'Réactiver'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <PermissionMatrix />
    </>
  );
}

/** Matrice générée À PARTIR DE LA CONFIG : la documentation est toujours à jour. */
function PermissionMatrix() {
  const roles = Object.values(ROLES);
  return (
    <section className="card">
      <h2>Matrice des permissions</h2>
      <p className="muted small">Générée automatiquement depuis src/config/roles.js</p>
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr>
              <th>Permission</th>
              {roles.map((r) => (
                <th key={r} className="center">
                  {ROLE_LABELS[r]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.values(PERMISSIONS).map((p) => (
              <tr key={p}>
                <td>
                  {PERMISSION_LABELS[p]} <span className="mono muted small">{p}</span>
                </td>
                {roles.map((r) => (
                  <td key={r} className="center">
                    {ROLE_PERMISSIONS[r].includes(p) ? '✅' : '·'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserForm({ onDone, onCancel }) {
  const [values, setValues] = useState({ nom: '', login: '', role: ROLES.CAISSIER, password: '' });
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const set = (f) => (e) => setValues({ ...values, [f]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setGlobalError(null);
    try {
      await createUser(values);
      onDone();
    } catch (err) {
      setErrors(err.fields ?? {});
      setGlobalError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={handleSubmit} noValidate>
      <h2 className="span-2">Nouvel utilisateur</h2>
      <div className="span-2">
        <Alert type="error">{globalError}</Alert>
      </div>
      <Field label="Nom complet" error={errors.nom}>
        <input value={values.nom} onChange={set('nom')} />
      </Field>
      <Field label="Identifiant" error={errors.login}>
        <input value={values.login} onChange={set('login')} autoComplete="off" />
      </Field>
      <Field label="Rôle" error={errors.role}>
        <select value={values.role} onChange={set('role')}>
          {Object.values(ROLES).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mot de passe initial" error={errors.password}>
        <input type="password" value={values.password} onChange={set('password')} autoComplete="new-password" />
      </Field>
      <div className="span-2 form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={submitting}>
          Créer
        </button>
      </div>
    </form>
  );
}
