"""
MPLADS Early-Warning Pipeline
==============================
SIH26102 — scores works that are still IN PROGRESS (Payment Status =
"Payment In-Progress" in the raw expenditure data) using the SAME
category cost-norms detect_anomalies.py already trusts for completed
works.

This is what "early warning" means concretely in this system: a project's
disbursed-so-far amount is compared against national category norms WHILE
it is still open, so a risky pattern can be reviewed before the work is
closed out and the money is fully gone — not only in a retrospective audit
afterwards. No new ML model: same robust-z approach as Signal 1, applied
to a slice of data the rest of the pipeline doesn't touch.

Depends on output/category_stats.csv — run detect_anomalies.py first.

Run:
    python3 detect_anomalies.py   # first, if not already run
    python3 early_warning.py

Output:
    output/early_warning.csv
"""

import os

import numpy as np
import pandas as pd

_ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(_ROOT, "data")
OUT_DIR = os.path.join(_ROOT, "output")

MIN_CATEGORY_PEER_GROUP = 10
COST_Z_BANDS = [(3.5, 40), (2.75, 25), (2.0, 13), (0, 0)]  # same bands as Signal 1


def band_score(value, bands):
    for threshold, points in bands:
        if value >= threshold:
            return points
    return 0


def fmt_inr(amount):
    if pd.isna(amount):
        return "N/A"
    amount = float(amount)
    if amount >= 1e7:
        return f"₹{amount:,.0f} (₹{amount/1e7:.2f} crore)"
    if amount >= 1e5:
        return f"₹{amount:,.0f} (₹{amount/1e5:.2f} lakh)"
    return f"₹{amount:,.0f}"


def main():
    cat_stats = pd.read_csv(f"{OUT_DIR}/category_stats.csv")

    trans = pd.read_csv(f"{DATA_DIR}/merged_mplads_transactions.csv")
    trans = trans.replace(r"^[\s\xa0]*$", np.nan, regex=True)
    trans = trans[~(trans["State"].isna() & trans["MP_Name"].isna())].copy()

    inprog = trans[
        (trans["Source"] == "Expenditure_On_Going_And_Completed")
        & (trans["Payment_Status"].astype(str).str.strip() == "Payment In-Progress")
    ].copy()
    inprog = inprog.dropna(subset=["Amount", "Work"])
    inprog = inprog.rename(columns={"Work": "Work_Type"})
    # Same District extraction detect_anomalies.py uses for completed works, so
    # early-warning records can be filtered/grouped by district exactly like
    # completed works (needed for the district-level dashboard).
    inprog["District"] = inprog["IDA"].str.extract(r"^(.*?)\(")

    inprog["log_amount"] = np.log(inprog["Amount"].replace(0, np.nan))
    inprog["log_amount"] = inprog["log_amount"].replace([np.inf, -np.inf], np.nan)

    inprog = inprog.merge(cat_stats, on="Work_Type", how="left")
    inprog["cost_eligible"] = inprog["nat_n"].fillna(0) >= MIN_CATEGORY_PEER_GROUP

    def z(row):
        if not row["cost_eligible"] or pd.isna(row["nat_mad"]) or row["nat_mad"] == 0:
            return 0.0
        return 0.6745 * (row["log_amount"] - row["nat_median"]) / row["nat_mad"]

    inprog["cost_z"] = inprog.apply(z, axis=1)
    inprog["cost_ratio"] = inprog["Amount"] / inprog["nat_median_amount"]
    inprog["early_warning_score"] = inprog["cost_z"].apply(lambda v: band_score(v, COST_Z_BANDS))
    inprog["early_warning_score"] = np.where(inprog["cost_eligible"], inprog["early_warning_score"], 0)
    inprog["early_warning_score"] = inprog["early_warning_score"].fillna(0).astype(int)

    def reason(row):
        if row["early_warning_score"] == 0:
            return "No early cost-pattern anomaly against completed-works category norms."
        return (f"Still IN PROGRESS — disbursed-so-far is {row['cost_ratio']:.1f}x the completed-works "
                f"median for '{row['Work_Type']}' ({fmt_inr(row['Amount'])} vs. median "
                f"{fmt_inr(row['nat_median_amount'])}, n={int(row['nat_n'])}) — worth reviewing before "
                f"final payment.")

    inprog["reason"] = inprog.apply(reason, axis=1)
    inprog["risk_level"] = inprog["early_warning_score"].apply(
        lambda s: "Critical - Priority Investigation" if s >= 40 else
        "High - Requires Investigation" if s >= 25 else
        "Medium - Worth Reviewing" if s >= 13 else "Low - Normal Pattern"
    )

    out_cols = ["State", "Constituency", "MP_Name", "IDA", "District", "Work_Type", "Date", "Amount",
                "Payment_Status", "cost_z", "cost_ratio", "early_warning_score", "risk_level", "reason"]
    result = inprog[out_cols].sort_values("early_warning_score", ascending=False).reset_index(drop=True)
    result.insert(0, "warning_id", [f"EW-{i+1:06d}" for i in range(len(result))])
    result.to_csv(f"{OUT_DIR}/early_warning.csv", index=False)

    n_flagged = int((result["early_warning_score"] > 0).sum())
    print(f"[early-warning] {len(result)} in-progress works scored (previously unused by the pipeline)")
    print(f"[early-warning] {n_flagged} flagged before completion -> {OUT_DIR}/early_warning.csv")


if __name__ == "__main__":
    main()
