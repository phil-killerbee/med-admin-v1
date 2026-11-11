import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  List,
  Search,
} from 'lucide-react';

/**
 * Barre d'outils de liste : choix de vue (cartes / tableau), pagination, recherche.
 * Composant "contrôlé" : il n'a aucun état propre, tout vient des props.
 */
export function ListToolbar({ view, onViewChange, pagination, search, onSearchChange, placeholder, unit = 'élément(s)' }) {
  const { page, pageCount, pageSize, total, goTo } = pagination;

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-row">
          {onViewChange && (
            <div className="view-toggle" role="group" aria-label="Mode d'affichage">
              <button className={view === 'list' ? 'active' : ''} onClick={() => onViewChange('list')} aria-label="Vue tableau" aria-pressed={view === 'list'}>
                <List size={16} />
              </button>
              <button className={view === 'grid' ? 'active' : ''} onClick={() => onViewChange('grid')} aria-label="Vue cartes" aria-pressed={view === 'grid'}>
                <LayoutGrid size={16} />
              </button>
            </div>
          )}

          <nav className="pager" aria-label="Pagination">
            <button className="pager-btn" onClick={() => goTo(1)} disabled={page === 1} aria-label="Première page">
              <ChevronsLeft size={16} />
            </button>
            <button className="pager-btn" onClick={() => goTo(page - 1)} disabled={page === 1} aria-label="Page précédente">
              <ChevronLeft size={16} />
            </button>
            <span className="pager-info">
              {page} / {pageCount}
            </span>
            <button className="pager-btn" onClick={() => goTo(page + 1)} disabled={page === pageCount} aria-label="Page suivante">
              <ChevronRight size={16} />
            </button>
            <button className="pager-btn" onClick={() => goTo(pageCount)} disabled={page === pageCount} aria-label="Dernière page">
              <ChevronsRight size={16} />
            </button>
          </nav>
        </div>
        <span className="toolbar-count">
          {total} {unit} trouvé(s) — {pageCount} page(s), {pageSize} par page
        </span>
      </div>

      {onSearchChange && (
        <label className="search-box">
          <Search size={16} aria-hidden />
          <input type="search" placeholder={placeholder} value={search} onChange={(e) => onSearchChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}
