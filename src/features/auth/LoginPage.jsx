import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { Alert, Field } from '../../components/ui';

// Comptes de test créés par `npm run db:init` (à supprimer en production !)
const DEMO_ACCOUNTS = [
  { login: 'admin', label: 'Administrateur' },
  { login: 'pharmacien', label: 'Pharmacien' },
  { login: 'preparateur', label: 'Préparateur' },
  { login: 'vendeuse', label: 'Vendeuse' },
  { login: 'vendeur', label: 'Vendeur' },
  { login: 'caissier', label: 'Caissier' },
  { login: 'caissiere', label: 'Caissière' },
  { login: 'ancien', label: 'Compte désactivé' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(form.login, form.password);
      // Retour à la page initialement demandée
      navigate(location.state?.from?.pathname ?? '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="card login-card" onSubmit={handleSubmit} noValidate>
        <h1>
          <span className="brand-cross">✚</span> PharmaCours
        </h1>
        <p className="muted">Logiciel de pharmacie — support de cours React</p>

        <Alert type="error">{error}</Alert>

        <Field label="Identifiant">
          <input
            autoFocus
            autoComplete="username"
            value={form.login}
            onChange={(e) => setForm({ ...form, login: e.target.value })}
          />
        </Field>
        <Field label="Mot de passe">
          <input
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>
        <button className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? 'Connexion…' : 'Se connecter'}
        </button>

        <div className="demo-box">
          <p>
            <strong>Comptes de test</strong> (mot de passe : <code>demo123</code>)
          </p>
          <div className="demo-buttons">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                type="button"
                key={a.login}
                className="btn btn-small"
                onClick={() => setForm({ login: a.login, password: 'demo123' })}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="muted small">
            Remettre les données de test à zéro : <code>npm run db:reset</code>
          </p>
        </div>
      </form>
    </div>
  );
}
