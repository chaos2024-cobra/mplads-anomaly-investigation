"""
MPLADS Anomaly Detection Pipeline — v2 Full Rebuild
=====================================================
All 6 raw CSV files contribute to the risk score.

Scoring universe (union of all work stages):
  - Works Completed          → cost anomaly, duplicates, concentration, stall
  - Works Sanctioned (no completion record) → stall, unaccounted disbursement
  - Works Recommended (never sanctioned)    → recommendation delay signal

Signals:
  1. cost_anomaly        — completed amount vs category peers (z-score / ratio fallback)
  2. rec_delay           — recommended→sanction delay >180 days (from Recommended)
  3. stall               — sanctioned but stuck at early Work_Status for too long
  4. unaccounted_funds   — expenditure disbursed but work not completed
  5. duplicate           — same MP + similar description + same amount
  6. concentration       — MP heavily concentrated in one category (multi-cat MPs only)
  7. calamity_misuse     — MP received calamity consent but works not in calamity category

Output: backend/mplads.db  (tables: works, mp_summary, mp_category_concentration)
"""

import re
import os
import math
import sqlite3
import warnings
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

warnings.filterwarnings("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
RAW  = os.path.join(ROOT, "data", "raw")
DB_PATH = os.path.join(ROOT, "backend", "mplads.db")

TODAY = datetime.now()

# ─── helpers ──────────────────────────────────────────────────────────────────

def parse_work_id(s: str) -> str | None:
    if not isinstance(s, str):
        return None
    m = re.search(r"WS/\s*MP\d+/\d{4}-\d{4}/\d+", s)
    return re.sub(r"\s+", "", m.group(0)) if m else None


def robust_zscore(values: pd.Series) -> pd.Series:
    """Median/MAD z-score on log-transformed amounts. Returns NaN series for fixed-rate categories."""
    log_v = np.log1p(values)
    med = log_v.median()
    mad = (log_v - med).abs().median()
    if mad < 0.01:
        return pd.Series([np.nan] * len(values), index=values.index)
    return (log_v - med) / (1.4826 * mad)


def ratio_score_series(values: pd.Series) -> pd.Series:
    med = values.median()
    if med == 0:
        return pd.Series([1.0] * len(values), index=values.index)
    return values / med


# ─── loaders ──────────────────────────────────────────────────────────────────

def load_recommended():
    df = pd.read_csv(os.path.join(RAW, "Works Recommended (1).csv"))
    df.columns = df.columns.str.strip()
    df["Work_ID"] = df["WORK"].apply(parse_work_id)
    amt_col = [c for c in df.columns if "RECOMMENDED AMOUNT" in c.upper()][0]
    df = df.rename(columns={
        "Work category": "Work_Category",
        "Hon'ble Members of Parliament": "MP_Name",
        "Work description": "Work_Description",
        "Recommended date": "Recommended_Date",
        amt_col: "Recommended_Amount",
        "Sanction Date": "Sanction_Date_Rec",
    })
    df["Recommended_Amount"] = pd.to_numeric(df["Recommended_Amount"], errors="coerce")
    df["Recommended_Date"] = pd.to_datetime(df["Recommended_Date"], dayfirst=True, errors="coerce")
    return df[df["Work_ID"].notna()].drop_duplicates("Work_ID")


def load_sanctioned():
    df = pd.read_csv(os.path.join(RAW, "Works Sanctioned.csv"))
    df.columns = df.columns.str.strip()
    df["Work_ID"] = df["Work"].apply(parse_work_id)
    df = df.rename(columns={
        "Work category": "Work_Category",
        "Hon'ble Members of Parliament": "MP_Name",
        "Work description": "Work_Description",
        "Recommended date": "Recommended_Date_San",
        "Sanction Date": "Sanction_Date",
        "Sanction Amount ( ₹ )": "Sanction_Amount",
        "Work Status": "Work_Status",
    })
    df["Sanction_Amount"] = pd.to_numeric(df["Sanction_Amount"], errors="coerce")
    df["Sanction_Date"] = pd.to_datetime(df["Sanction_Date"], dayfirst=True, errors="coerce")
    return df[df["Work_ID"].notna()].drop_duplicates("Work_ID")


def load_completed():
    df = pd.read_csv(os.path.join(RAW, "Works Completed (1).csv"))
    df.columns = df.columns.str.strip()
    df["Work_ID"] = df["Work"].apply(parse_work_id)
    df = df.rename(columns={
        "Work Category": "Work_Category",
        "Hon'ble Members of Parliament": "MP_Name",
        "Work Description": "Work_Description",
        "Completion Date": "Completion_Date",
        "Amount Disbursed ( ₹ )": "Completed_Amount",
        "Image": "Image",
    })
    df["Completed_Amount"] = pd.to_numeric(df["Completed_Amount"], errors="coerce")
    df["Completion_Date"] = pd.to_datetime(df["Completion_Date"], dayfirst=True, errors="coerce")
    # has_image: True when a photo was uploaded (NaN means nothing uploaded)
    df["has_image"] = df["Image"].notna() & (df["Image"].str.strip() != "")
    return df[df["Work_ID"].notna()].drop_duplicates("Work_ID")


def load_expenditure():
    df = pd.read_csv(os.path.join(RAW, "Expenditure on Completed and On-going Works as on Date (1).csv"))
    df.columns = df.columns.str.strip()
    df["Work_ID"] = df["Work ID"].astype(str).str.strip()
    df["Work_ID"] = df["Work_ID"].apply(lambda x: x if re.match(r"WS/MP", x) else None)
    df = df.rename(columns={
        "Hon'ble Members of Parliament": "MP_Name",
        "Fund Disbursed Amount ( ₹ )": "Fund_Disbursed",
        "Payment Status": "Payment_Status",
        "Vendor Name": "Vendor_Name",
        "Expenditure Date": "Exp_Date",
    })
    df["Fund_Disbursed"] = pd.to_numeric(df["Fund_Disbursed"], errors="coerce")
    return df[df["Work_ID"].notna()]


def load_allocated():
    df = pd.read_csv(os.path.join(RAW, "Allocated Limit for Honble MPs (2).csv"))
    df.columns = df.columns.str.strip()
    df = df.rename(columns={
        "Hon'ble Members of Parliaments": "MP_Name",
        "Allocated AMOUNT ( ₹ )": "Allocated_Amount",
    })
    df["Allocated_Amount"] = pd.to_numeric(df["Allocated_Amount"], errors="coerce")
    return df[["MP_Name", "State", "Constituency", "Allocated_Amount"]].drop_duplicates("MP_Name")


def load_calamity():
    df = pd.read_csv(os.path.join(RAW, "Amount consented for Calamity.csv"))
    df.columns = df.columns.str.strip()
    df = df.rename(columns={
        "Hon'ble Members of Parliament": "MP_Name",
        "Consent Amount ( ₹ )": "Consent_Amount",
        "Calamity Type": "Calamity_Type",
        "Calamity Name": "Calamity_Name",
        "Date of Consent": "Consent_Date",
    })
    # Drop grand total row
    df = df[df["MP_Name"].notna() & (df["MP_Name"].str.strip() != "")]
    df["Consent_Amount"] = pd.to_numeric(df["Consent_Amount"], errors="coerce")
    return df[df["Consent_Amount"].notna()]


# ─── build scoring universe ────────────────────────────────────────────────────

STALL_STATUS_WEIGHTS = {
    "Physical Inspection": 1.0,
    "Vendor Identification": 0.8,
    "Time Estimation": 0.6,
    "Sanction": 0.4,
    "Work partially Completed": 0.2,
    "Work Completed": 0.0,
}

# Calamity-related work categories (keywords that indicate disaster relief)
CALAMITY_KEYWORDS = ["calamity", "flood", "disaster", "relief", "cyclone", "earthquake",
                     "landslide", "drought", "repair", "restoration", "rehabilitation"]

# Subcategory keyword mapping — first match wins (ordered most→least specific)
SUBCATEGORY_RULES = [
    ("lighting",       ["high mast", "semi high mast", "street light", "solar light", "led light", "led pole", "ms pole", "light installation"]),
    ("education",      ["book", "library", "school", "laboratory", "lab equipment", "educational", "student"]),
    ("medical",        ["hospital", "medical", "health", "ambulance", "dead body", "freezer", "ot light", "delivery table", "autoclave", "stretcher", "wheelchair"]),
    ("water_supply",   ["water tank", "water tanker", "tanker", "drinking water", "borewell", "hand pump", "pipeline", "water supply"]),
    ("construction",   ["construction", "cc road", "road", "drain", "drainage", "street", "building", "hall", "room", "boundary wall", "rcc", "footpath", "bridge"]),
    ("gym_sports",     ["gym", "open gym", "garden gym", "sports", "playground", "park equipment", "children park"]),
    ("cctv_security",  ["cctv", "cc tv", "camera", "surveillance", "security"]),
    ("furniture",      ["bench", "chair", "furniture", "table", "stool", "sitting"]),
    ("fire_equipment", ["fire fighter", "fire fighting", "fire engine"]),
    ("sanitation",     ["toilet", "sanitation", "sewage", "garbage", "dustbin", "solid waste"]),
    ("solar",          ["solar panel", "solar pump", "solar energy", "solar power"]),
    ("it_equipment",   ["computer", "laptop", "printer", "projector", "digital"]),
]


def classify_subcategory(desc: str) -> str:
    if not isinstance(desc, str):
        return "other"
    d = desc.lower()
    for label, keywords in SUBCATEGORY_RULES:
        if any(kw in d for kw in keywords):
            return label
    return "other"


def build_universe(san: pd.DataFrame, comp: pd.DataFrame) -> pd.DataFrame:
    """
    Scoring universe: sanctioned works (money committed) + completed works.
    Never-sanctioned recommendations are excluded — no money involved.
    Stage priority: Completed > Sanctioned_Not_Completed
    """
    comp_ids = set(comp["Work_ID"])

    # ── Completed works ──
    completed = comp[[
        "Work_ID", "Work_Category", "State", "IDA", "MP_Name", "Constituency",
        "Work_Description", "Completion_Date", "Completed_Amount", "has_image",
    ]].copy()
    completed["pipeline_stage"] = "Completed"
    completed["Amount"] = completed["Completed_Amount"]
    completed["Date"] = completed["Completion_Date"]
    # Bring in sanction date for completed works (for phantom-completion check)
    completed = completed.merge(
        san[["Work_ID", "Sanction_Date"]],
        on="Work_ID", how="left",
    )

    # ── Sanctioned but never completed ──
    san_only = san[~san["Work_ID"].isin(comp_ids)].copy()
    san_only["pipeline_stage"] = "Sanctioned_Not_Completed"
    san_only["Amount"] = san_only["Sanction_Amount"]
    san_only["Date"] = san_only["Sanction_Date"]
    san_only["Completed_Amount"] = np.nan
    san_only["Completion_Date"] = pd.NaT
    san_only["has_image"] = False
    san_only = san_only[[
        "Work_ID", "Work_Category", "State", "IDA", "MP_Name", "Constituency",
        "Work_Description", "Completion_Date", "Completed_Amount", "has_image",
        "pipeline_stage", "Amount", "Date", "Sanction_Date",
    ]]

    universe = pd.concat([completed, san_only], ignore_index=True)
    universe["work_subcategory"] = universe["Work_Description"].apply(classify_subcategory)
    return universe


# ─── signal 1: cost anomaly (completed works only) ────────────────────────────

def signal_cost(universe: pd.DataFrame) -> pd.DataFrame:
    universe = universe.copy()
    universe["cost_z"] = np.nan
    universe["cost_ratio"] = np.nan
    universe["cost_score"] = 0.0
    universe["cost_flag_type"] = "none"

    completed_mask = universe["pipeline_stage"] == "Completed"
    comp = universe[completed_mask].copy()

    for cat, grp in comp.groupby("Work_Category"):
        amounts = grp["Completed_Amount"].dropna()
        if len(amounts) < 3:
            continue
        zscores = robust_zscore(amounts)
        if zscores.isna().all():
            ratios = ratio_score_series(amounts)
            universe.loc[ratios.index, "cost_ratio"] = ratios
            universe.loc[ratios.index, "cost_flag_type"] = "ratio"
            scores = ratios.apply(lambda r: min(45.0, max(0.0, (r - 1.0) * 45.0)) if r > 1.05 else 0.0)
            universe.loc[scores.index, "cost_score"] = scores
        else:
            med = amounts.median()
            universe.loc[zscores.index, "cost_z"] = zscores
            universe.loc[zscores.index, "cost_ratio"] = amounts / med if med > 0 else np.nan
            universe.loc[zscores.index, "cost_flag_type"] = "zscore"
            # Smooth continuous curve: 0 at z=2, approaches 45 asymptotically.
            # tanh((z-2)/2) maps z=2→0, z=4→~0.76, z=6→~0.96
            scores = zscores.apply(lambda z: (
                round(45.0 * max(0.0, math.tanh((abs(z) - 2.0) / 2.0)), 2)
            ) if not math.isnan(z) else 0.0)
            universe.loc[scores.index, "cost_score"] = scores

    return universe


# ─── signal 1b: phantom completion (completed ≤ 3 days after sanction) ────────
# Category medians for context — a ₹50L building "completed" in 1 day is fraud.
# We only apply this to completed works where both dates are known.

PHANTOM_DAYS_THRESHOLD = 3   # 0-3 days is implausible for any physical work
PHANTOM_AMOUNT_FLOOR   = 50_000  # ignore tiny/administrative works


def signal_phantom_completion(universe: pd.DataFrame) -> pd.DataFrame:
    universe = universe.copy()
    universe["phantom_score"] = 0.0
    universe["phantom_days"] = np.nan

    mask = (
        (universe["pipeline_stage"] == "Completed") &
        universe["Sanction_Date"].notna() &
        universe["Completion_Date"].notna() &
        (universe["Amount"] >= PHANTOM_AMOUNT_FLOOR)
    )
    if not mask.any():
        return universe

    days = (universe.loc[mask, "Completion_Date"] - universe.loc[mask, "Sanction_Date"]).dt.days
    universe.loc[mask, "phantom_days"] = days

    def score(row):
        d = row["phantom_days"]
        if pd.isna(d) or d > PHANTOM_DAYS_THRESHOLD:
            return 0.0
        amt = row["Amount"] or 0
        if amt < PHANTOM_AMOUNT_FLOOR:
            return 0.0
        # 0 days = max score; 1 day = 80%; 2 days = 60%; 3 days = 40%
        # Scale also by amount (log): ₹50K→ base, ₹50L→ roughly double
        amt_factor = min(2.0, max(1.0, math.log10(max(amt, 1)) / math.log10(50_000)))
        base = max(0.0, (PHANTOM_DAYS_THRESHOLD + 1 - d) / (PHANTOM_DAYS_THRESHOLD + 1))
        return min(20.0, base * amt_factor * 15.0)

    universe.loc[mask, "phantom_score"] = universe[mask].apply(score, axis=1)
    return universe


# ─── signal 2: recommendation delay ──────────────────────────────────────────

def signal_rec_delay(universe: pd.DataFrame, rec: pd.DataFrame, san: pd.DataFrame) -> pd.DataFrame:
    """Days from recommendation to sanction.
    High end (>180d): bureaucratic delay — supporting signal, max 10pts.
    Low end (0-1d): suspiciously fast approval — max 8pts (near-rubber-stamp).
    """
    rec_dates = rec[["Work_ID", "Recommended_Date"]].copy()
    san_dates = san[["Work_ID", "Sanction_Date"]].copy()
    delay = rec_dates.merge(san_dates, on="Work_ID", how="inner")
    delay["rec_to_san_days"] = (delay["Sanction_Date"] - delay["Recommended_Date"]).dt.days.clip(lower=0)

    def delay_score(days):
        if pd.isna(days):
            return 0.0
        if days < 2:
            # 0d → 8.0, 1d → 5.0, interpolated continuously
            return round(8.0 - days * 3.0, 2)
        if days < 180:
            return 0.0
        return min(10.0, (days - 180) / 185.0 * 10.0)

    delay["rec_delay_score"] = delay["rec_to_san_days"].apply(delay_score)
    universe = universe.merge(
        delay[["Work_ID", "rec_to_san_days", "rec_delay_score"]],
        on="Work_ID", how="left",
    )
    universe["rec_delay_score"] = universe["rec_delay_score"].fillna(0.0)
    universe["rec_to_san_days"] = universe["rec_to_san_days"].fillna(0.0)
    return universe


# ─── signal 3: stall ──────────────────────────────────────────────────────────

STALL_THRESHOLD_DAYS = 180


def signal_stall(universe: pd.DataFrame, san: pd.DataFrame) -> pd.DataFrame:
    san_subset = san[["Work_ID", "Work_Status", "Sanction_Date"]].copy()
    san_subset["stall_days"] = (TODAY - san_subset["Sanction_Date"]).dt.days.clip(lower=0)
    san_subset["stall_status_weight"] = san_subset["Work_Status"].map(STALL_STATUS_WEIGHTS).fillna(0.3)

    def stall_score(row):
        if row["stall_status_weight"] == 0.0:
            return 0.0
        days = row["stall_days"]
        if pd.isna(days) or days < STALL_THRESHOLD_DAYS:
            return 0.0
        # Steeper curve — max at 730 days (2 years), not 550
        day_factor = min(1.0, (days - STALL_THRESHOLD_DAYS) / 730.0)
        return 20.0 * row["stall_status_weight"] * day_factor

    san_subset["stall_score"] = san_subset.apply(stall_score, axis=1)

    universe = universe.merge(
        san_subset[["Work_ID", "Work_Status", "stall_days", "stall_score"]],
        on="Work_ID", how="left",
    )
    universe["Work_Status"] = universe["Work_Status"].fillna(
        universe["pipeline_stage"].map({
            "Completed": "Work Completed",
            "Sanctioned_Not_Completed": "Sanctioned",
            "Recommended_Not_Sanctioned": "Not Sanctioned",
        })
    )
    universe["stall_score"] = universe["stall_score"].fillna(0.0)
    universe["stall_days"] = universe["stall_days"].fillna(0.0)
    return universe


# ─── signal 4: unaccounted funds ─────────────────────────────────────────────

def signal_unaccounted(universe: pd.DataFrame, exp: pd.DataFrame) -> pd.DataFrame:
    """
    Two sub-signals:
    a) Expenditure on works NOT in completed file (funds released, nothing to show)
    b) Expenditure >> Completed amount on completed works (over-payment)
    """
    comp_ids = set(universe[universe["pipeline_stage"] == "Completed"]["Work_ID"])

    exp_per_work = (
        exp.groupby("Work_ID")["Fund_Disbursed"]
        .sum()
        .reset_index()
        .rename(columns={"Fund_Disbursed": "total_exp"})
    )

    universe = universe.merge(exp_per_work, on="Work_ID", how="left")

    def unaccounted_score(row):
        exp_amt = row.get("total_exp")
        stage = row.get("pipeline_stage", "")
        comp_amt = row.get("Completed_Amount")

        if pd.isna(exp_amt) or exp_amt <= 0:
            return 0.0

        if stage == "Completed":
            # Over-payment: expenditure significantly exceeds completed amount
            if pd.isna(comp_amt) or comp_amt <= 0:
                return 0.0
            ratio = exp_amt / comp_amt
            if ratio < 1.4:
                return 0.0
            return min(35.0, (ratio - 1.0) * 25.0)
        else:
            # Funds disbursed but work never completed — strongest fraud signal
            log_amt = math.log10(max(exp_amt, 1))
            return min(45.0, max(0.0, (log_amt - 4.0) * 15.0))

    universe["unaccounted_score"] = universe.apply(unaccounted_score, axis=1)
    universe["total_exp"] = universe["total_exp"].fillna(0.0)
    return universe


# ─── signal 5: duplicate works ────────────────────────────────────────────────

def signal_duplicates(universe: pd.DataFrame, threshold: float = 0.82) -> pd.DataFrame:
    universe = universe.copy()
    universe["dup_score"] = 0.0
    universe["dup_pair"] = None
    universe["dup_cluster_size"] = 0  # >0 means this is the cluster representative

    for mp, grp in universe.groupby("MP_Name"):
        if len(grp) < 2:
            continue
        descs = grp["Work_Description"].fillna("").astype(str).tolist()
        if all(d.strip() == "" for d in descs):
            continue
        try:
            vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1, max_features=5000)
            tfidf = vec.fit_transform(descs)
            sim = cosine_similarity(tfidf)
        except Exception:
            continue

        indices = grp.index.tolist()
        amounts = grp["Amount"].values

        # Union-find to cluster all mutual duplicates
        parent = {idx: idx for idx in indices}
        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        best_score: dict = {}  # idx -> best dup score seen
        best_pair: dict = {}   # idx -> work_id of closest match

        for i in range(len(indices)):
            for j in range(i + 1, len(indices)):
                if sim[i, j] < threshold:
                    continue
                ai, aj = amounts[i], amounts[j]
                if pd.notna(ai) and pd.notna(aj) and ai > 0 and aj > 0:
                    if min(ai, aj) / max(ai, aj) < 0.95:
                        continue
                score = min(30.0, (sim[i, j] - threshold) / (1.0 - threshold) * 30.0)
                parent[find(indices[i])] = find(indices[j])
                for idx, other in [(indices[i], indices[j]), (indices[j], indices[i])]:
                    if score > best_score.get(idx, 0):
                        best_score[idx] = score
                        best_pair[idx] = universe.loc[other, "Work_ID"]

        # Secondary pass: merge clusters that share the same subcategory and near-identical
        # amounts even if text similarity fell just below threshold (e.g. "Cc tv camera" vs
        # "Cc tv camera (30)"). Only merges pairs where BOTH sides already have ≥2 members,
        # so it doesn't silently pull in unrelated singletons.
        from collections import defaultdict
        pre_clusters: dict = defaultdict(list)
        for idx in indices:
            pre_clusters[find(idx)].append(idx)

        cluster_roots = list(pre_clusters.keys())
        for ci in range(len(cluster_roots)):
            for cj in range(ci + 1, len(cluster_roots)):
                ri, rj = cluster_roots[ci], cluster_roots[cj]
                mi, mj = pre_clusters[ri], pre_clusters[rj]
                # Only merge clusters that both have multiple members
                if len(mi) < 2 or len(mj) < 2:
                    continue
                # Check subcategory match and amount proximity across all member pairs
                subcats_i = set(universe.loc[mi, "work_subcategory"].fillna("").values)
                subcats_j = set(universe.loc[mj, "work_subcategory"].fillna("").values)
                if not subcats_i & subcats_j:
                    continue
                amts_i = universe.loc[mi, "Amount"].dropna().values
                amts_j = universe.loc[mj, "Amount"].dropna().values
                if len(amts_i) == 0 or len(amts_j) == 0:
                    continue
                med_i = float(pd.Series(amts_i).median())
                med_j = float(pd.Series(amts_j).median())
                if med_i > 0 and med_j > 0 and min(med_i, med_j) / max(med_i, med_j) >= 0.90:
                    parent[find(ri)] = find(rj)

        clusters: dict = defaultdict(list)
        for idx in indices:
            clusters[find(idx)].append(idx)

        for members in clusters.values():
            if len(members) < 2:
                continue
            rep = max(members, key=lambda idx: (
                universe.loc[idx, "cost_score"] +
                universe.loc[idx, "rec_delay_score"] +
                universe.loc[idx, "stall_score"] +
                universe.loc[idx, "unaccounted_score"]
            ))
            for idx in members:
                universe.loc[idx, "dup_pair"] = best_pair.get(idx)
                if idx == rep:
                    universe.loc[idx, "dup_score"] = best_score.get(idx, 0)
                    universe.loc[idx, "dup_cluster_size"] = len(members)
                else:
                    universe.loc[idx, "dup_score"] = 0.0  # secondary: signal already counted on rep
                    universe.loc[idx, "dup_cluster_size"] = 0

    return universe[["Work_ID", "dup_score", "dup_pair", "dup_cluster_size"]]


# ─── signal 6: MP concentration ───────────────────────────────────────────────

def signal_concentration(universe: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    mp_cat = (
        universe.groupby(["MP_Name", "Work_Category"])["Amount"]
        .sum()
        .reset_index()
        .rename(columns={"Amount": "mp_cat_total"})
    )
    peer_median = (
        mp_cat.groupby("Work_Category")["mp_cat_total"]
        .median()
        .reset_index()
        .rename(columns={"mp_cat_total": "peer_median"})
    )
    mp_cat = mp_cat.merge(peer_median, on="Work_Category", how="left")
    mp_total = (
        universe.groupby("MP_Name")["Amount"]
        .sum()
        .reset_index()
        .rename(columns={"Amount": "mp_total"})
    )
    mp_cat = mp_cat.merge(mp_total, on="MP_Name", how="left")
    mp_cat["portfolio_share"] = mp_cat["mp_cat_total"] / mp_cat["mp_total"].replace(0, np.nan)
    mp_cat["conc_ratio"] = mp_cat["mp_cat_total"] / mp_cat["peer_median"].replace(0, np.nan)

    # Guard: only fire for MPs with 2+ categories
    mp_num_cats = mp_cat.groupby("MP_Name")["Work_Category"].count().reset_index()
    mp_num_cats.columns = ["MP_Name", "num_categories"]
    mp_cat = mp_cat.merge(mp_num_cats, on="MP_Name", how="left")

    def conc_score(row):
        if row.get("num_categories", 1) < 2:
            return 0.0
        ratio = row["conc_ratio"] if pd.notna(row["conc_ratio"]) else 1.0
        share = row["portfolio_share"] if pd.notna(row["portfolio_share"]) else 0.0
        if ratio < 2.0 or share < 0.5:
            return 0.0
        return min(25.0, (ratio - 2.0) * 8.0 + share * 10.0)

    mp_cat["conc_score"] = mp_cat.apply(conc_score, axis=1)

    work_conc = universe[["Work_ID", "MP_Name", "Work_Category"]].merge(
        mp_cat[["MP_Name", "Work_Category", "conc_score", "conc_ratio", "portfolio_share",
                "peer_median", "mp_cat_total"]],
        on=["MP_Name", "Work_Category"], how="left",
    )
    return work_conc, mp_cat


# ─── signal 7: calamity fund misuse ──────────────────────────────────────────

def signal_calamity(universe: pd.DataFrame, cal: pd.DataFrame) -> pd.DataFrame:
    """
    MPs who received calamity consent should have works tied to disaster-relief.
    Flag MPs with calamity consent whose works are NOT in calamity-related categories.
    """
    cal_mps = set(cal["MP_Name"].str.strip().str.upper())

    # Normalise MP names for matching
    universe["_mp_upper"] = universe["MP_Name"].str.strip().str.upper()

    def is_calamity_work(desc):
        if not isinstance(desc, str):
            return False
        d = desc.lower()
        return any(kw in d for kw in CALAMITY_KEYWORDS)

    universe["_is_calamity_work"] = universe["Work_Description"].apply(is_calamity_work)
    universe["_is_calamity_work"] |= universe["Work_Category"].str.lower().apply(
        lambda c: any(kw in c for kw in CALAMITY_KEYWORDS) if isinstance(c, str) else False
    )

    # Calamity consent amount per MP
    cal_lookup = cal.groupby(cal["MP_Name"].str.strip().str.upper())["Consent_Amount"].sum().to_dict()

    def calamity_score(row):
        mp = row["_mp_upper"]
        if mp not in cal_mps:
            return 0.0
        # MP got calamity consent but this specific work has no calamity keywords
        if row["_is_calamity_work"]:
            return 0.0
        # Score proportional to consent amount (bigger consent = more suspicious to spend elsewhere)
        consent = cal_lookup.get(mp, 0)
        if consent <= 0:
            return 0.0
        log_consent = math.log10(max(consent, 1))
        return min(25.0, (log_consent - 5.0) * 12.5)  # ₹1L → 0, ₹10L → ~12.5, ₹1Cr → ~25

    universe["calamity_score"] = universe.apply(calamity_score, axis=1)
    universe = universe.drop(columns=["_mp_upper", "_is_calamity_work"])
    return universe


# ─── risk classification ──────────────────────────────────────────────────────

RISK_LEVELS = [
    (75, "Critical - Priority Investigation"),
    (40, "High - Requires Investigation"),
    (20, "Medium - Worth Reviewing"),
    (0,  "Low - Normal Pattern"),
]


def classify_risk(score: float) -> str:
    for threshold, label in RISK_LEVELS:
        if score >= threshold:
            return label
    return "Low - Normal Pattern"


def build_reason(row: dict) -> str:
    parts = []
    if row.get("fin_score", 0) > 0:
        ft = row.get("cost_flag_type", "")
        ratio = row.get("cost_ratio")
        z = row.get("cost_z")
        conc_share = row.get("portfolio_share", 0) or 0
        cat = row.get("Work_Category", "category")
        cost_part = ""
        if ft == "ratio" and ratio and not math.isnan(ratio):
            cost_part = f"Cost {ratio:.1f}x fixed rate"
        elif z and not math.isnan(z):
            cost_part = f"Cost z={z:.1f} ({ratio:.1f}x median)" if ratio and not math.isnan(ratio) else f"Cost z={z:.1f}"
        conc_part = f"{cat}: {conc_share*100:.0f}% of MP portfolio" if row.get("conc_score", 0) > 0 else ""
        fin_part = "; ".join(p for p in [cost_part, conc_part] if p)
        if fin_part:
            parts.append(fin_part)
    if row.get("rec_delay_score", 0) > 0:
        days = row.get("rec_to_san_days", 0)
        if days <= 1:
            parts.append(f"Approved {int(days)}d after recommendation — rubber-stamp")
        else:
            parts.append(f"Rec→sanction delayed {int(days)}d")
    if row.get("stall_score", 0) > 0:
        status = row.get("Work_Status", "")
        days = row.get("stall_days", 0)
        parts.append(f"Stalled at '{status}' for {int(days)}d")
    if row.get("unaccounted_score", 0) > 0:
        exp = row.get("total_exp", 0)
        stage = row.get("pipeline_stage", "")
        if stage == "Completed":
            parts.append(f"Overpaid: ₹{exp/1e5:.1f}L disbursed vs completed")
        else:
            parts.append(f"₹{exp/1e5:.1f}L disbursed, work not completed")
    if row.get("phantom_score", 0) > 0:
        days = row.get("phantom_days")
        amt = row.get("Amount", 0)
        day_str = "same day" if days == 0 else f"{int(days)}d"
        parts.append(f"Marked complete {day_str} after sanction (₹{amt/1e5:.1f}L — implausible)")
    if row.get("dup_score", 0) > 0:
        pair = row.get("dup_pair")
        parts.append(f"Duplicate of {pair}" if pair else "Potential duplicate work")
    if row.get("calamity_score", 0) > 0:
        parts.append("Calamity-consent MP, non-relief work")
    return "; ".join(parts) if parts else "No significant anomalies"


# ─── assemble ─────────────────────────────────────────────────────────────────

def build_scored_works(rec, san, comp, exp, cal):
    print("  Building scoring universe …")
    universe = build_universe(san, comp)
    print(f"  Universe: {len(universe):,} works "
          f"({(universe['pipeline_stage']=='Completed').sum():,} completed, "
          f"{(universe['pipeline_stage']=='Sanctioned_Not_Completed').sum():,} sanctioned-incomplete)")

    print("  Signal 1: cost anomaly …")
    universe = signal_cost(universe)

    print("  Signal 1b: phantom completion …")
    universe = signal_phantom_completion(universe)
    universe["phantom_score"] = universe["phantom_score"].fillna(0.0)
    universe["has_image"] = universe["has_image"].fillna(False)

    print("  Signal 2: recommendation delay …")
    universe = signal_rec_delay(universe, rec, san)

    print("  Signal 3: stall …")
    universe = signal_stall(universe, san)

    print("  Signal 4: unaccounted funds …")
    universe = signal_unaccounted(universe, exp)

    print("  Signal 5: duplicates …")
    dup_df = signal_duplicates(universe)
    universe = universe.merge(dup_df, on="Work_ID", how="left")
    universe["dup_score"] = universe["dup_score"].fillna(0.0)
    universe["dup_cluster_size"] = universe["dup_cluster_size"].fillna(0).astype(int)

    print("  Signal 6: financial anomaly (cost + concentration) …")
    conc_work_df, conc_mp_df = signal_concentration(universe)
    universe = universe.merge(
        conc_work_df[["Work_ID", "conc_score", "conc_ratio", "portfolio_share",
                      "peer_median", "mp_cat_total"]],
        on="Work_ID", how="left",
    )
    universe["conc_score"] = universe["conc_score"].fillna(0.0)
    # Combine cost outlier + MP concentration into one financial anomaly signal
    universe["fin_score"] = (universe["cost_score"] + universe["conc_score"]).clip(upper=50)

    print("  Signal 7: calamity misuse …")
    universe = signal_calamity(universe, cal)

    raw = (
        universe["fin_score"]           / 50  * 25 +   # max 25 pts
        universe["rec_delay_score"]     / 10  * 10 +   # max 10 pts
        universe["stall_score"]         / 20  * 20 +   # max 20 pts
        universe["unaccounted_score"]   / 45  * 20 +   # max 20 pts
        universe["phantom_score"]       / 20  * 10 +   # max 10 pts (phantom completion)
        universe["dup_score"]           / 30  * 10 +   # max 10 pts
        universe["calamity_score"]      / 25  *  5     # max  5 pts
    )                                                   # theoretical max = 100

    # Scale so the empirical worst case in this dataset maps to 90,
    # preserving relative ordering while keeping the score interpretable.
    raw_max = float(raw.max())
    if raw_max > 0:
        universe["risk_score"] = (raw / raw_max * 90).clip(upper=100).round(2)
    else:
        universe["risk_score"] = 0.0

    universe["risk_level"] = universe["risk_score"].apply(classify_risk)
    universe["reason"] = universe.apply(lambda r: build_reason(r.to_dict()), axis=1)

    return universe, conc_mp_df


# ─── mp summary ───────────────────────────────────────────────────────────────

def build_mp_summary(universe, allocated, exp):
    agg = universe.groupby(["MP_Name", "State", "Constituency"]).agg(
        total_works=("Work_ID", "count"),
        total_amount=("Amount", "sum"),
        avg_risk_score=("risk_score", "mean"),
        max_risk_score=("risk_score", "max"),
        flagged_works=("risk_score", lambda x: (x >= 20).sum()),
    ).reset_index()
    exp_agg = (
        exp.groupby("MP_Name")["Fund_Disbursed"].sum().reset_index()
        .rename(columns={"Fund_Disbursed": "total_fund_utilized"})
    )
    summary = agg.merge(exp_agg, on="MP_Name", how="left")
    summary = summary.merge(
        allocated[["MP_Name", "Allocated_Amount"]].rename(columns={"Allocated_Amount": "allocated_amount"}),
        on="MP_Name", how="left",
    )
    summary["utilization_rate"] = summary["total_fund_utilized"] / summary["allocated_amount"].replace(0, np.nan)
    summary["avg_risk_score"] = summary["avg_risk_score"].round(1)
    return summary


# ─── database ─────────────────────────────────────────────────────────────────

def write_db(universe, mp_summary, conc_mp_df):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    c.executescript("""
        DROP TABLE IF EXISTS works;
        DROP TABLE IF EXISTS mp_summary;
        DROP TABLE IF EXISTS mp_category_concentration;
        DROP TABLE IF EXISTS transactions_raw;
    """)

    c.execute("""
        CREATE TABLE works (
            work_id             TEXT PRIMARY KEY,
            mp_name             TEXT,
            state               TEXT,
            constituency        TEXT,
            district            TEXT,
            work_type           TEXT,
            work_subcategory    TEXT,
            amount              REAL,
            date                TEXT,
            pipeline_stage      TEXT,
            risk_score          REAL,
            risk_level          TEXT,
            reason              TEXT,
            cost_score          REAL,
            cost_z              REAL,
            cost_ratio          REAL,
            cost_flag_type      TEXT,
            rec_delay_score     REAL,
            rec_to_san_days     REAL,
            stall_score         REAL,
            stall_days          REAL,
            work_status         TEXT,
            unaccounted_score   REAL,
            total_exp           REAL,
            dup_score           REAL,
            dup_pair            TEXT,
            dup_cluster_size    INTEGER,
            fin_score           REAL,
            conc_ratio          REAL,
            portfolio_share     REAL,
            calamity_score      REAL,
            phantom_score       REAL,
            phantom_days        REAL,
            has_image           INTEGER,
            work_description    TEXT
        )
    """)

    c.execute("""
        CREATE TABLE mp_summary (
            mp_name                 TEXT PRIMARY KEY,
            state                   TEXT,
            constituency            TEXT,
            total_works             INTEGER,
            total_amount            REAL,
            total_fund_utilized     REAL,
            allocated_amount        REAL,
            utilization_rate        REAL,
            avg_risk_score          REAL,
            max_risk_score          REAL,
            flagged_works           INTEGER
        )
    """)

    c.execute("""
        CREATE TABLE mp_category_concentration (
            mp_name         TEXT,
            work_type       TEXT,
            amount          REAL,
            conc_score      REAL,
            conc_ratio      REAL,
            portfolio_share REAL,
            peer_median_spend REAL,
            PRIMARY KEY (mp_name, work_type)
        )
    """)

    def safe(v, default=None):
        if v is None:
            return default
        try:
            if isinstance(v, float) and math.isnan(v):
                return default
        except Exception:
            pass
        return v

    def fmt_date(v):
        try:
            if pd.isna(v):
                return None
        except Exception:
            pass
        if hasattr(v, "strftime"):
            return v.strftime("%Y-%m-%d")
        return str(v) if v else None

    rows = []
    for _, r in universe.iterrows():
        rows.append((
            r["Work_ID"], r.get("MP_Name"), r.get("State"), r.get("Constituency"),
            None,  # district
            r.get("Work_Category"),
            r.get("work_subcategory", "other"),
            safe(r.get("Amount")),
            fmt_date(r.get("Date")),
            r.get("pipeline_stage"),
            safe(r.get("risk_score", 0.0), 0.0),
            r.get("risk_level", "Low - Normal Pattern"),
            r.get("reason", ""),
            safe(r.get("cost_score", 0.0), 0.0),
            safe(r.get("cost_z")),
            safe(r.get("cost_ratio")),
            r.get("cost_flag_type", "none"),
            safe(r.get("rec_delay_score", 0.0), 0.0),
            safe(r.get("rec_to_san_days", 0.0), 0.0),
            safe(r.get("stall_score", 0.0), 0.0),
            safe(r.get("stall_days", 0.0), 0.0),
            r.get("Work_Status", ""),
            safe(r.get("unaccounted_score", 0.0), 0.0),
            safe(r.get("total_exp", 0.0), 0.0),
            safe(r.get("dup_score", 0.0), 0.0),
            r.get("dup_pair"),
            int(r.get("dup_cluster_size", 0)),
            safe(r.get("fin_score", 0.0), 0.0),
            safe(r.get("conc_ratio")),
            safe(r.get("portfolio_share")),
            safe(r.get("calamity_score", 0.0), 0.0),
            safe(r.get("phantom_score", 0.0), 0.0),
            safe(r.get("phantom_days")),
            int(bool(r.get("has_image", False))),
            str(r.get("Work_Description", ""))[:500] if r.get("Work_Description") else None,
        ))
    c.executemany("INSERT OR REPLACE INTO works VALUES " + "(?" + ",?" * 34 + ")", rows)

    for _, r in mp_summary.iterrows():
        c.execute("INSERT OR REPLACE INTO mp_summary VALUES (?,?,?,?,?,?,?,?,?,?,?)", (
            r.get("MP_Name"), r.get("State"), r.get("Constituency"),
            int(r.get("total_works", 0)),
            safe(r.get("total_amount")),
            safe(r.get("total_fund_utilized")),
            safe(r.get("allocated_amount")),
            safe(r.get("utilization_rate")),
            safe(r.get("avg_risk_score")),
            safe(r.get("max_risk_score")),
            int(r.get("flagged_works", 0)),
        ))

    for _, r in conc_mp_df.iterrows():
        c.execute("INSERT OR REPLACE INTO mp_category_concentration VALUES (?,?,?,?,?,?,?)", (
            r.get("MP_Name"), r.get("Work_Category"), safe(r.get("mp_cat_total")),
            safe(r.get("conc_score", 0.0), 0.0), safe(r.get("conc_ratio")),
            safe(r.get("portfolio_share")), safe(r.get("peer_median")),
        ))

    conn.commit()
    conn.close()
    print(f"  Wrote {len(rows):,} works to {DB_PATH}")


# ─── main ──────────────────────────────────────────────────────────────────────

def main():
    print("Loading raw CSVs …")
    rec = load_recommended()
    san = load_sanctioned()
    comp = load_completed()
    exp = load_expenditure()
    allocated = load_allocated()
    cal = load_calamity()
    print(f"  Recommended: {len(rec):,} | Sanctioned: {len(san):,} | Completed: {len(comp):,}")
    print(f"  Expenditure: {len(exp):,} | Allocated: {len(allocated):,} | Calamity: {len(cal):,} MPs")

    print("\nRunning signals …")
    universe, conc_mp_df = build_scored_works(rec, san, comp, exp, cal)

    print("\nBuilding MP summary …")
    mp_summary = build_mp_summary(universe, allocated, exp)

    print("\nWriting database …")
    write_db(universe, mp_summary, conc_mp_df)

    flagged = (universe["risk_score"] >= 20).sum()
    high = (universe["risk_score"] >= 40).sum()
    critical = (universe["risk_score"] >= 75).sum()

    print(f"\nResults:")
    print(f"  Total works scored  : {len(universe):,}")
    print(f"  By stage            : "
          f"{(universe['pipeline_stage']=='Completed').sum():,} completed | "
          f"{(universe['pipeline_stage']=='Sanctioned_Not_Completed').sum():,} sanctioned-incomplete")
    print(f"  Flagged (≥20)       : {flagged:,}")
    print(f"  High (≥40)          : {high:,}")
    print(f"  Critical (≥75)      : {critical:,}")
    print(f"\nSignal contribution:")
    for sig in ["fin_score","rec_delay_score","stall_score","unaccounted_score",
                "phantom_score","dup_score","calamity_score"]:
        n = (universe[sig] > 0).sum()
        avg = universe.loc[universe[sig] > 0, sig].mean()
        avg_str = f"{avg:.1f}" if not math.isnan(avg) else "N/A"
        print(f"  {sig:22s}: {n:5,} works flagged, avg={avg_str}")
    print(f"\nTop 10 by risk score:")
    cols = ["Work_ID","MP_Name","State","Work_Category","Amount","pipeline_stage","risk_score","risk_level","reason"]
    print(universe.nlargest(10, "risk_score")[cols].to_string(index=False))


if __name__ == "__main__":
    main()
