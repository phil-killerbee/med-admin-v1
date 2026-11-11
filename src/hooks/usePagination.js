import { useMemo, useState } from 'react';

/**
 * Pagination côté client, réutilisable pour n'importe quelle liste.
 * La page courante est "bornée" : si la liste rétrécit (recherche),
 * on ne se retrouve jamais sur une page vide.
 */
export function usePagination(items, pageSize) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pageCount);

  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return {
    page: current,
    pageCount,
    pageSize,
    total,
    pageItems,
    goTo: (p) => setPage(Math.min(Math.max(1, p), pageCount)),
    reset: () => setPage(1),
  };
}
