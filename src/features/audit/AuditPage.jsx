import { listAudit } from '../../services/userService';
import { useAsync } from '../../hooks/useAsync';
import { ROLE_LABELS } from '../../config/roles';
import { EmptyState, ErrorMessage, Loading, PageHeader } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function AuditPage() {
  const { data: entries, loading, error } = useAsync(listAudit);

  return (
    <>
      <PageHeader title="Journal d’audit" subtitle="Qui a fait quoi, et quand. Lecture seule, non modifiable." />
      <section className="card">
        {loading && <Loading />}
        <ErrorMessage error={error} />
        {entries?.length === 0 && <EmptyState>Aucun événement enregistré.</EmptyState>}
        {entries?.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.date)}</td>
                  <td>
                    {e.userNom} <span className="muted small">({ROLE_LABELS[e.role]})</span>
                  </td>
                  <td className="mono small">{e.action}</td>
                  <td>{e.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
