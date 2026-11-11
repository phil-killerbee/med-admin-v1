/** Erreurs HTTP typées : le gestionnaire d'erreurs les traduit en réponse JSON. */
export class HttpError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const badRequest = (message, fields) => new HttpError(422, message, fields);
export const unauthorized = (message = 'Session expirée, veuillez vous reconnecter') => new HttpError(401, message);
export const forbidden = (message = "Vous n'avez pas les droits pour cette action") => new HttpError(403, message);
export const notFound = (message = 'Élément introuvable') => new HttpError(404, message);

/** Lève une erreur 422 si l'objet d'erreurs de validation n'est pas vide. */
export function assertNoErrors(errors, message = 'Formulaire invalide') {
  if (Object.keys(errors).length) throw badRequest(message, errors);
}
