/** Erreurs typées : l'interface peut réagir différemment selon le type. */
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
  }
}

export class ValidationError extends AppError {
  constructor(message, fields = {}) {
    super(message, 422);
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Session expirée, veuillez vous reconnecter') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas les droits pour cette action") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Élément introuvable') {
    super(message, 404);
  }
}
