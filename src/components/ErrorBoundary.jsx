import { Component } from 'react';

/** Attrape les erreurs de rendu pour éviter l'écran blanc. */
export class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // En production : envoyer à un outil de monitoring (Sentry…)
    console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="centered">
          <h1>Une erreur inattendue est survenue</h1>
          <p className="muted">{this.state.error.message}</p>
          <button className="btn" onClick={() => window.location.assign('/')}>
            Retour à l’accueil
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
