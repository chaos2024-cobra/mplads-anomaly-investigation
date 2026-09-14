interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = total ? page * limit + 1 : 0;
  const end = Math.min((page + 1) * limit, total);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="pagination-btns">
        <button
          className="pag-btn"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ◀ Previous
        </button>
        <span className="pagination-info">
          Page {page + 1} of {totalPages}
        </span>
        <button
          className="pag-btn"
          disabled={page + 1 >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ▶
        </button>
      </div>
    </div>
  );
}
