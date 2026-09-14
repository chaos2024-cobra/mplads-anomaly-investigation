"""
MPLADS Trend & Pace Analysis
==============================
SIH26102 — two honest, non-black-box additions:

1. Monthly trend series: works completed, amount disbursed, flagged count/
   rate, and in-progress volume, bucketed by month. Plain aggregation, no
   modeling.

2. Per-MP utilization PACE CLASSIFICATION (output/mp_utilization_pace.csv):
   buckets each MP by their current Utilization_Percent into a pace band.
   This is deliberately NOT presented as a forecast or trained prediction —
   the source data has no scheme-cycle end date to project against, so a
   real "will finish on time" forecast isn't something this pipeline can
   honestly claim. What it IS: a defensible early-inefficiency signal
   (funds sitting unspent), consistent with the rest of this pipeline's
   "no black box, no faked signal" approach (see README "Design notes").

Depends on output/scored_works.csv (detect_anomalies.py) and, optionally,
output/early_warning.csv (early_warning.py).

Run:
    python3 trend_analysis.py

Output:
    output/trend_monthly.csv
    output/mp_utilization_pace.csv
"""

import os

import numpy as np
import pandas as pd

_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_ROOT, "data")
OUT_DIR = os.path.join(_ROOT, "output")


def month_bucket(series):
    return pd.to_datetime(series, errors="coerce", dayfirst=True).dt.to_period("M").astype(str)


def main():
    scored = pd.read_csv(f"{OUT_DIR}/scored_works.csv")
    scored["month"] = month_bucket(scored["Date"])
    scored = scored[scored["month"] != "NaT"]

    monthly = scored.groupby("month").agg(
        works_completed=("Work_ID", "count"),
        amount_disbursed=("Amount", "sum"),
        flagged=("risk_score", lambda s: int((s >= 25).sum())),
        avg_risk_score=("risk_score", "mean"),
    ).reset_index()
    monthly["flagged_rate_pct"] = (monthly["flagged"] / monthly["works_completed"] * 100).round(1)
    monthly["avg_risk_score"] = monthly["avg_risk_score"].round(1)

    ew_path = f"{OUT_DIR}/early_warning.csv"
    if os.path.exists(ew_path):
        ew = pd.read_csv(ew_path)
        ew["month"] = month_bucket(ew["Date"])
        ew_monthly = ew.groupby("month").agg(
            in_progress_amount=("Amount", "sum"),
            in_progress_flagged=("early_warning_score", lambda s: int((s > 0).sum())),
        ).reset_index()
        monthly = monthly.merge(ew_monthly, on="month", how="outer")
    else:
        monthly["in_progress_amount"] = 0
        monthly["in_progress_flagged"] = 0

    monthly[["works_completed", "flagged", "in_progress_flagged"]] = (
        monthly[["works_completed", "flagged", "in_progress_flagged"]].fillna(0).astype(int)
    )
    monthly[["amount_disbursed", "in_progress_amount"]] = (
        monthly[["amount_disbursed", "in_progress_amount"]].fillna(0)
    )
    monthly = monthly.sort_values("month").reset_index(drop=True)
    monthly.to_csv(f"{OUT_DIR}/trend_monthly.csv", index=False)
    print(f"[trend] {len(monthly)} monthly buckets -> {OUT_DIR}/trend_monthly.csv")

    # ---- Per-MP utilization pace classification (explicitly NOT a forecast) ----
    summary = pd.read_csv(f"{DATA_DIR}/merged_mplads_summary.csv")
    summary["Utilization_Percent"] = pd.to_numeric(summary["Utilization_Percent"], errors="coerce")
    pace = summary[["MP_Name", "State", "Constituency", "Allocated_Amount",
                     "Total_Fund_Utilized", "Balance_Allocated_Limit", "Utilization_Percent"]].copy()
    pace["pace_band"] = np.select(
        [
            pace["Utilization_Percent"].isna(),
            pace["Utilization_Percent"] < 30,
            pace["Utilization_Percent"] < 60,
            pace["Utilization_Percent"] < 90,
        ],
        ["No allocation on record", "Low utilization", "Moderate utilization", "Good utilization"],
        default="Near-full utilization",
    )
    pace["pace_note"] = np.select(
        [
            pace["Utilization_Percent"].isna(),
            pace["Utilization_Percent"] < 30,
            pace["Utilization_Percent"] < 60,
        ],
        [
            "No allocation record to assess.",
            "Large unspent balance relative to allocation — worth checking for delayed fund release "
            "or stalled project pipeline.",
            "Moderate unspent balance — normal at many points in a scheme cycle, but worth monitoring "
            "if it persists.",
        ],
        default="Utilization is on a healthy trajectory.",
    )
    pace = pace.sort_values("Utilization_Percent", na_position="last")
    pace.to_csv(f"{OUT_DIR}/mp_utilization_pace.csv", index=False)
    print(f"[trend] {len(pace)} MP utilization pace records -> {OUT_DIR}/mp_utilization_pace.csv")
    print(f"[trend] pace band breakdown:\n{pace['pace_band'].value_counts().to_string()}")


if __name__ == "__main__":
    main()
