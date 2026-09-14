"""
Builds mplads.db from the anomaly-detection pipeline's output CSVs.

Run this AFTER detect_anomalies.py has produced ./output/*.csv, and
BEFORE starting the API (main.py reads only from the DB, never the CSVs
directly -- this keeps detection logic and serving logic fully separate).

Run:
    python3 db_setup.py
"""

import sqlite3
import pandas as pd
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mplads.db")
OUTPUT_DIR = os.path.join(ROOT, "output")
DATA_DIR = os.path.join(ROOT, "data")


def month_col(date_series):
    """'25-Mar-2026' -> '2026-03'. Used for every time-bucketed trend query,
    computed once here at build time (rather than per-request) so trend
    endpoints stay index-backed and fast."""
    return pd.to_datetime(date_series, errors="coerce", dayfirst=True).dt.to_period("M").astype(str)


def build():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = sqlite3.connect(DB_PATH)

    # ---- works: the core scored table, one row per Works_Completed project
    works = pd.read_csv(os.path.join(OUTPUT_DIR, "scored_works.csv"))
    works = works.rename(columns={
        "Work_ID": "work_id", "MP_Name": "mp_name", "State": "state",
        "Constituency": "constituency", "Work_Type": "work_type", "District": "district",
        "Date": "date", "Amount": "amount", "Payment_Status": "payment_status",
        "Declared_Work_Type": "declared_work_type", "Predicted_Work_Type": "predicted_work_type",
        "Confidence_In_Declared_Type": "declared_type_confidence",
    })
    works = works.drop(columns=["evidence"])  # rebuilt from flat columns at query time; avoids
                                               # parsing the Python-dict-repr string pandas wrote
    # work_month powers every "trend over time" endpoint (Signal 4 dup_score /
    # dup_similarity / duplicate_of_work_id / dup_amount_corroborated / dup_reason
    # and work_description ride through unchanged -- scored_works.csv already
    # has them, and this loader doesn't restrict columns, so no other change
    # was needed for the duplicate-detection signal to reach the DB).
    works["work_month"] = month_col(works["date"])
    works.to_sql("works", conn, if_exists="replace", index=False)

    # ---- mp_summary: allocation / utilization context per MP, plus the
    # (explicitly-not-a-forecast) pace band from trend_analysis.py if it has
    # been run. Optional merge -- db_setup.py still works if the person only
    # ran detect_anomalies.py, just without the pace_band/pace_note columns.
    summary = pd.read_csv(os.path.join(DATA_DIR, "merged_mplads_summary.csv"))
    pace_path = os.path.join(OUTPUT_DIR, "mp_utilization_pace.csv")
    if os.path.exists(pace_path):
        pace = pd.read_csv(pace_path)[["MP_Name", "pace_band", "pace_note"]]
        summary = summary.merge(pace, on="MP_Name", how="left")
    else:
        summary["pace_band"] = None
        summary["pace_note"] = None
        print("[db] WARNING: output/mp_utilization_pace.csv not found -- run trend_analysis.py "
              "first for utilization pace bands. mp_summary.pace_band will be NULL.")
    summary = summary.rename(columns={
        "MP_Name": "mp_name", "State": "state", "Constituency": "constituency",
        "Allocated_Amount": "allocated_amount", "Works_Completed_Count": "works_completed_count",
        "Works_Completed_Total_Amount": "works_completed_total_amount",
        "Expenditure_Total_Amount": "expenditure_total_amount",
        "Total_Fund_Utilized": "total_fund_utilized",
        "Balance_Allocated_Limit": "balance_allocated_limit",
        "Utilization_Percent": "utilization_percent",
    })
    keep = ["mp_name", "state", "constituency", "allocated_amount", "works_completed_count",
            "works_completed_total_amount", "expenditure_total_amount", "total_fund_utilized",
            "balance_allocated_limit", "utilization_percent", "pace_band", "pace_note"]
    summary[keep].to_sql("mp_summary", conn, if_exists="replace", index=False)

    # ---- mp_category_concentration: Signal 3 supporting table (peer comparisons)
    conc = pd.read_csv(os.path.join(OUTPUT_DIR, "mp_category_concentration.csv"))
    conc = conc.rename(columns={"MP_Name": "mp_name", "Work_Type": "work_type", "Amount": "amount"})
    conc.to_sql("mp_category_concentration", conn, if_exists="replace", index=False)

    # ---- transactions_raw: for the "relevant transactions" panel. Expenditure rows have
    # no Work_ID (see Phase 1 findings), so this is deliberately MP+category level context,
    # not a per-work link -- the API labels it that way rather than overclaiming.
    trans = pd.read_csv(os.path.join(DATA_DIR, "merged_mplads_transactions.csv"))
    trans = trans.replace(r"^[\s\xa0]*$", pd.NA, regex=True)
    trans = trans[~(trans["State"].isna() & trans["MP_Name"].isna())].copy()
    trans["work_type_or_desc"] = trans["Work"].str.extract(r"^WS/MP\d+/[\d\-]+/\d+-(.*)$")
    trans["work_type_or_desc"] = trans["work_type_or_desc"].fillna(trans["Work"])
    trans = trans.rename(columns={
        "Source": "source", "State": "state", "Constituency": "constituency",
        "MP_Name": "mp_name", "IDA": "ida", "Date": "date", "Amount": "amount",
        "Payment_Status": "payment_status",
    })
    keep_t = ["source", "state", "constituency", "mp_name", "work_type_or_desc", "ida",
              "date", "amount", "payment_status"]
    trans[keep_t].to_sql("transactions_raw", conn, if_exists="replace", index=False)

    # ---- early_warning: Signal from early_warning.py, scored IN-PROGRESS works
    # (a disjoint set of transaction rows from `works` -- these have no
    # Work_ID at all in the source data, see early_warning.py). Optional:
    # db_setup.py still runs without it, just with an empty table.
    ew_path = os.path.join(OUTPUT_DIR, "early_warning.csv")
    if os.path.exists(ew_path):
        ew = pd.read_csv(ew_path)
        ew = ew.rename(columns={
            "warning_id": "warning_id", "State": "state", "Constituency": "constituency",
            "MP_Name": "mp_name", "IDA": "ida", "District": "district", "Work_Type": "work_type",
            "Date": "date", "Amount": "amount", "Payment_Status": "payment_status",
        })
        ew["ew_month"] = month_col(ew["date"])
        ew.to_sql("early_warning", conn, if_exists="replace", index=False)
        n_ew = len(ew)
    else:
        conn.execute("""CREATE TABLE early_warning (
            warning_id TEXT, state TEXT, constituency TEXT, mp_name TEXT, ida TEXT,
            district TEXT, work_type TEXT, date TEXT, amount REAL, payment_status TEXT,
            cost_z REAL, cost_ratio REAL, early_warning_score INTEGER, risk_level TEXT,
            reason TEXT, ew_month TEXT)""")
        n_ew = 0
        print("[db] WARNING: output/early_warning.csv not found -- run early_warning.py first. "
              "early_warning table created empty.")

    # ---- trend_monthly: national month-bucketed series from trend_analysis.py.
    # Also optional for the same reason as above.
    tm_path = os.path.join(OUTPUT_DIR, "trend_monthly.csv")
    if os.path.exists(tm_path):
        tm = pd.read_csv(tm_path)
        tm.to_sql("trend_monthly", conn, if_exists="replace", index=False)
        n_tm = len(tm)
    else:
        conn.execute("""CREATE TABLE trend_monthly (
            month TEXT, works_completed INTEGER, amount_disbursed REAL, flagged INTEGER,
            avg_risk_score REAL, flagged_rate_pct REAL, in_progress_amount REAL,
            in_progress_flagged INTEGER)""")
        n_tm = 0
        print("[db] WARNING: output/trend_monthly.csv not found -- run trend_analysis.py first. "
              "trend_monthly table created empty.")

    # ---- indexes for the filters the dashboard will hit constantly
    cur = conn.cursor()
    for col in ["state", "mp_name", "work_type", "risk_score", "risk_level", "district",
                "work_month", "dup_score", "duplicate_of_work_id"]:
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_works_{col} ON works({col})")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_mpcat_mp ON mp_category_concentration(mp_name)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_trans_mp ON transactions_raw(mp_name)")
    for col in ["state", "mp_name", "district", "work_type", "risk_level", "ew_month"]:
        cur.execute(f"CREATE INDEX IF NOT EXISTS idx_ew_{col} ON early_warning({col})")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_trend_month ON trend_monthly(month)")
    conn.commit()

    print(f"[db] built {DB_PATH}")
    for t in ["works", "mp_summary", "mp_category_concentration", "transactions_raw",
              "early_warning", "trend_monthly"]:
        n = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"[db]   {t}: {n} rows")
    conn.close()


if __name__ == "__main__":
    build()
