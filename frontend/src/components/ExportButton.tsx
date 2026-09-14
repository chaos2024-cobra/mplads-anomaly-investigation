import { useState } from 'react';
import { getExportCsvUrl } from '../api/client';

interface Props {
  state?: string;
  mpName?: string;
  minRiskScore?: number;
}

export function ExportButton({ state, mpName, minRiskScore }: Props) {
  const [open, setOpen] = useState(false);

  function downloadCsv() {
    const url = getExportCsvUrl({ state, mp_name: mpName, min_risk_score: minRiskScore });
    const a = document.createElement('a');
    a.href = url;
    a.download = `mplads-export-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setOpen(false);
  }

  return (
    <div className="export-btn-wrap">
      <button className="export-btn" onClick={() => setOpen(o => !o)}>
        ↓ Export
      </button>

      {open && (
        <>
          <div className="export-overlay" onClick={() => setOpen(false)} />
          <div className="export-dropdown">
            <div className="export-dropdown-header">Export Filtered Data</div>
            <div className="export-dropdown-meta">
              {state && <span className="export-chip">State: {state}</span>}
              {mpName && <span className="export-chip">MP: {mpName}</span>}
              {minRiskScore !== undefined && <span className="export-chip">Min Risk: {minRiskScore}</span>}
              {!state && !mpName && !minRiskScore && <span className="export-chip">All flagged works</span>}
            </div>
            <button className="export-action-btn" onClick={downloadCsv}>
              ↓ Download CSV (max 5,000 rows)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
