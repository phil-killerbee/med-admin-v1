import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="centered">
      <h1>403 — Accès refusé</h1>
      <p className="muted">Votre rôle ne vous permet pas d’accéder à cette page.</p>
      <Link className="btn" to="/">
        Retour à l’accueil
      </Link>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="centered">
      <h1>404 — Page introuvable</h1>
      <Link className="btn" to="/">
        Retour à l’accueil
      </Link>
    </div>
  );
}
