"""
Backfill mp_summary with every MP that has a fund allocation.

detect_anomalies.build_mp_summary derives mp_summary from the *scored works*
universe, so only MPs that have recommended/sanctioned/completed works appear
(~265). MPs who hold an allocation but have no works yet were dropped, which
is why MP Analytics only ever listed those 265 instead of the full ~543.

This script adds the missing allocation-only MPs to mp_summary from the raw
"Allocated Limit" file, with zeroed work/risk metrics (they have no scored
works) and their real allocated_amount. It is idempotent: existing rows are
never overwritten (INSERT OR IGNORE on the mp_name primary key), so the scored
265 keep their computed figures and re-running is a no-op.

Run:
    python3 pipeline/backfill_mp_summary.py
"""

import csv
import os
import sqlite3

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "backend", "mplads.db")
ALLOC_CSV = os.path.join(ROOT, "data", "raw", "Allocated Limit for Honble MPs (2).csv")

NAME_COL = "Hon'ble Members of Parliaments"
AMT_COL = "Allocated AMOUNT ( ₹ )"


def load_allocated():
    """Return [(mp_name, state, constituency, allocated_amount)], deduped by name."""
    seen, rows = set(), []
    with open(ALLOC_CSV, encoding="utf-8-sig") as f:
        for raw in csv.DictReader(f):
            r = {(k or "").strip(): (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
            name = (r.get(NAME_COL) or "").strip()
            if not name or name in seen:
                continue
            seen.add(name)
            try:
                amount = float(r.get(AMT_COL) or 0) or None
            except ValueError:
                amount = None
            rows.append((name, r.get("State") or None, r.get("Constituency") or None, amount))
    return rows


def main():
    allocated = load_allocated()
    conn = sqlite3.connect(DB_PATH)
    try:
        before = conn.execute("SELECT COUNT(*) FROM mp_summary").fetchone()[0]
        conn.executemany(
            """INSERT OR IGNORE INTO mp_summary
                 (mp_name, state, constituency, total_works, total_amount,
                  total_fund_utilized, allocated_amount, utilization_rate,
                  avg_risk_score, max_risk_score, flagged_works)
               VALUES (?, ?, ?, 0, 0, NULL, ?, NULL, 0, 0, 0)""",
            allocated,
        )
        conn.commit()
        after = conn.execute("SELECT COUNT(*) FROM mp_summary").fetchone()[0]
        print(f"[backfill] allocated MPs in file: {len(allocated)}")
        print(f"[backfill] mp_summary rows: {before} -> {after} (+{after - before})")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
