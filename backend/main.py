"""
MPLADS Anomaly Detection API
=============================
Serves the output of detect_anomalies.py (via mplads.db) to the dashboard.
Pure read layer -- no scoring logic lives here. Re-run db_setup.py after
re-running the detection pipeline to refresh this API's data.

Run:
    uvicorn main:app --reload --port 8000

Interactive docs at http://localhost:8000/docs
"""

import os
import sqlite3
import json
import re
import math
import secrets
import hashlib
from typing import Optional
from collections import defaultdict
from datetime import datetime as _datetime_cls

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mplads.db")

app = FastAPI(title="MPLADS Anomaly Detection API", version="1.0")

# CORS: allow the React dev server, local origins, and production frontend.
_cors_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    "http://localhost:8501",  # Streamlit fallback during migration
]
_frontend_url = os.environ.get("FRONTEND_URL")
if _frontend_url:
    _cors_origins.append(_frontend_url.rstrip("/"))

# Vercel assigns a unique URL to every deployment (production + per-branch/PR
# previews), so match them all by pattern rather than a single FRONTEND_URL.
_cors_origin_regex = r"https://.*\.vercel\.app"

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_origin_regex=_cors_origin_regex,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ── TF-IDF similarity index (built once at startup) ──────────────────────────
_tfidf_index: dict = {}  # work_id -> {term: tf-idf score}
_tfidf_work_ids: list = []
_tfidf_descriptions: list = []

# ── In-memory audit log (resets on restart; for demo/session tracking) ──────
_audit_log: list[dict] = []

class AuditEntry(BaseModel):
    work_id: str
    action: str   # e.g. "dossier_opened", "brief_generated", "exported"
    authority: str = "analyst"


class FeedbackRequest(BaseModel):
    work_id: str
    reviewer: str
    human_label: str   # 'agree' | 'too_high' | 'too_low' | 'false_positive'
    corrected_score: Optional[float] = None  # 0-100
    notes: str = ""

def _tokenize(text: str) -> list[str]:
    return re.findall(r'[a-z]+', (text or '').lower())


# ── Authentication ────────────────────────────────────────────────────────────
def _hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# Predefined users: {username: {password_hash, role, display_name}}
_USERS: dict[str, dict] = {
    "admin": {
        "hash": _hash("admin123"),
        "role": "admin",
        "display_name": "System Administrator",
    },
    "analyst": {
        "hash": _hash("analyst123"),
        "role": "analyst",
        "display_name": "Senior Analyst",
    },
    "auditor": {
        "hash": _hash("auditor123"),
        "role": "auditor",
        "display_name": "Audit Officer",
    },
}

# In-memory session store: token -> {username, role, display_name}
_sessions: dict[str, dict] = {}

class LoginRequest(BaseModel):
    username: str
    password: str

class RegisterRequest(BaseModel):
    username: str
    password: str
    display_name: str
    role: str  # admin | analyst | auditor

@app.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    username = req.username.strip().lower()
    if not username or len(username) < 3:
        raise HTTPException(400, "Username must be at least 3 characters")
    if not re.match(r'^[a-z0-9_]+$', username):
        raise HTTPException(400, "Username may only contain letters, digits, and underscores")
    if username in _USERS:
        raise HTTPException(409, "Username already taken")
    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if req.role not in ("admin", "analyst", "auditor"):
        raise HTTPException(400, "Invalid role")
    display_name = req.display_name.strip() or username
    _USERS[username] = {
        "hash": _hash(req.password),
        "role": req.role,
        "display_name": display_name,
    }
    token = secrets.token_hex(32)
    _sessions[token] = {"username": username, "role": req.role, "display_name": display_name}
    return {"token": token, "username": username, "role": req.role, "display_name": display_name}

@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    user = _USERS.get(req.username.strip().lower())
    if not user or user["hash"] != _hash(req.password):
        raise HTTPException(401, "Invalid username or password")
    token = secrets.token_hex(32)
    _sessions[token] = {
        "username": req.username.strip().lower(),
        "role": user["role"],
        "display_name": user["display_name"],
    }
    return {"token": token, "username": req.username.strip().lower(), "role": user["role"], "display_name": user["display_name"]}

@app.post("/api/auth/logout")
def auth_logout(token: str = Query(...)):
    _sessions.pop(token, None)
    return {"ok": True}

@app.get("/api/auth/me")
def auth_me(token: str = Query(...)):
    session = _sessions.get(token)
    if not session:
        raise HTTPException(401, "Session not found or expired")
    return session

def _build_tfidf_index():
    global _tfidf_index, _tfidf_work_ids, _tfidf_descriptions
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute("SELECT work_id, work_description FROM works WHERE work_description IS NOT NULL AND work_description != ''").fetchall()
    conn.close()
    if not rows:
        return
    docs = [(r[0], _tokenize(r[1])) for r in rows]
    N = len(docs)
    df: dict[str, int] = defaultdict(int)
    for _, tokens in docs:
        for t in set(tokens):
            df[t] += 1
    idf = {t: math.log((N + 1) / (df[t] + 1)) for t in df}
    index = {}
    for wid, tokens in docs:
        tf: dict[str, float] = defaultdict(float)
        for t in tokens:
            tf[t] += 1
        total = len(tokens) or 1
        vec = {t: (tf[t] / total) * idf.get(t, 0) for t in tf}
        norm = math.sqrt(sum(v * v for v in vec.values())) or 1
        index[wid] = {t: v / norm for t, v in vec.items()}
    _tfidf_index = index
    _tfidf_work_ids = [r[0] for r in rows]
    _tfidf_descriptions = [r[1] for r in rows]

def _cosine(v1: dict, v2: dict) -> float:
    common = set(v1) & set(v2)
    return sum(v1[t] * v2[t] for t in common)

@app.on_event("startup")
def startup_event():
    _build_tfidf_index()
    _ensure_feedback_table()


def _ensure_feedback_table():
    """Create the feedback table if it doesn't exist (idempotent)."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            work_id         TEXT NOT NULL,
            reviewer        TEXT NOT NULL,
            human_label     TEXT NOT NULL,
            corrected_score REAL,
            notes           TEXT,
            original_score  REAL,
            created_at      TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_work ON feedback(work_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_feedback_reviewer ON feedback(reviewer)")
    conn.commit()
    conn.close()


def rows_to_dicts(rows):
    return [dict(r) for r in rows]


def build_evidence(row: dict) -> dict:
    """Reconstruct the explainability payload from the flat scored columns."""
    return {
        "financial_anomaly": {
            "score": row.get("fin_score", 0),
            "cost_score": row.get("cost_score", 0),
            "z_score": row.get("cost_z"),
            "ratio_to_category_median": row.get("cost_ratio"),
            "flag_type": row.get("cost_flag_type", "none"),
            "conc_ratio": row.get("conc_ratio"),
            "portfolio_share": row.get("portfolio_share"),
        },
        "rec_delay": {
            "score": row.get("rec_delay_score", 0),
            "days": row.get("rec_to_san_days", 0),
        },
        "stalled_work": {
            "score": row.get("stall_score", 0),
            "work_status": row.get("work_status"),
            "days_stalled": row.get("stall_days"),
        },
        "unaccounted_funds": {
            "score": row.get("unaccounted_score", 0),
            "total_disbursed": row.get("total_exp"),
            "pipeline_stage": row.get("pipeline_stage"),
        },
        "phantom_completion": {
            "score": row.get("phantom_score", 0),
            "days_to_complete": row.get("phantom_days"),
            "has_image": bool(row.get("has_image", 0)),
        },
        "duplicate_work": {
            "score": row.get("dup_score", 0),
            "duplicate_of": row.get("dup_pair"),
            "cluster_size": row.get("dup_cluster_size", 0),
        },
        "calamity_misuse": {
            "score": row.get("calamity_score", 0),
        },
    }


# --------------------------------------------------------------------------
@app.get("/api/overview")
def overview():
    conn = get_conn()
    try:
        w = conn.execute("""
            SELECT COUNT(*) AS total_works, SUM(amount) AS total_amount,
                   SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_count,
                   SUM(CASE WHEN risk_score >= 40 THEN 1 ELSE 0 END) AS high_risk_count,
                   SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count
            FROM works
        """).fetchone()
        fund = conn.execute("SELECT SUM(total_fund_utilized) AS total_utilized, "
                             "SUM(allocated_amount) AS total_allocated FROM mp_summary").fetchone()
        by_level = conn.execute(
            "SELECT risk_level, COUNT(*) AS n FROM works GROUP BY risk_level"
        ).fetchall()
        # Module 12: estimated financial exposure = sum of (amount - peer_category_median) * risk_score/100
        # for all flagged works (risk_score >= 20) where amount > peer median
        leakage_row = conn.execute("""
            SELECT SUM((w.amount - mcc.peer_median_spend) * w.risk_score / 100.0) AS estimated_exposure
            FROM works w
            JOIN mp_category_concentration mcc ON w.mp_name = mcc.mp_name AND w.work_type = mcc.work_type
            WHERE w.risk_score >= 20
              AND w.amount > mcc.peer_median_spend
              AND mcc.peer_median_spend > 0
        """).fetchone()
        return {
            "total_works_analyzed": w["total_works"] or 0,
            "total_amount_analyzed": w["total_amount"] or 0,
            "total_mplads_fund_utilized_all_sources": fund["total_utilized"] or 0,
            "total_mplads_allocated_all_sources": fund["total_allocated"] or 0,
            "flagged_count": w["flagged_count"] or 0,
            "high_risk_count": w["high_risk_count"] or 0,
            "critical_count": w["critical_count"] or 0,
            "by_risk_level": {r["risk_level"]: r["n"] for r in by_level},
            "estimated_financial_exposure": leakage_row["estimated_exposure"] or 0,
        }
    finally:
        conn.close()


@app.get("/api/filters")
def filters():
    conn = get_conn()
    try:
        # Whitelist allowed columns to prevent injection if ever exposed
        allowed_cols = {"state", "work_type", "risk_level", "district", "mp_name"}
        def distinct(col, table="works", where=""):
            if col not in allowed_cols:
                raise HTTPException(400, f"Invalid column: {col}")
            # table is internal only, not user-controlled
            q = f"SELECT DISTINCT {col} FROM {table} WHERE {col} IS NOT NULL {where} ORDER BY {col}"
            return [r[0] for r in conn.execute(q).fetchall()]
        result = {
            "states": distinct("state"),
            "work_types": distinct("work_type"),
            "risk_levels": ["Critical - Priority Investigation", "High - Requires Investigation",
                             "Medium - Worth Reviewing", "Low - Normal Pattern"],
        }
        return result
    finally:
        conn.close()


@app.get("/api/works")
def list_works(
    state: Optional[str] = None,
    district: Optional[str] = None,
    mp_name: Optional[str] = None,
    work_type: Optional[str] = None,
    work_status: Optional[str] = None,
    min_risk_score: int = Query(0, ge=0, le=100),
    min_amount: Optional[float] = Query(None, ge=0),
    search: Optional[str] = Query(None, description="matches MP name or Work ID"),
    sort: str = Query("risk_score_desc", enum=["risk_score_desc", "amount_desc", "date_desc"]),
    date_from: Optional[str] = Query(None, description="ISO date string, e.g. 2023-01-01"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    conn = get_conn()
    try:
        # Strip whitespace from string filters to avoid whitespace-only queries
        if state is not None:
            state = state.strip()
            if not state:
                state = None
        if district is not None:
            district = district.strip()
            if not district:
                district = None
        if mp_name is not None:
            mp_name = mp_name.strip()
            if not mp_name:
                mp_name = None
        if work_type is not None:
            work_type = work_type.strip()
            if not work_type:
                work_type = None
        if search is not None:
            search = search.strip()
            if not search:
                search = None

        where, params = ["risk_score >= ?"], [min_risk_score]
        if state:
            where.append("state = ?"); params.append(state)
        if district:
            where.append("LOWER(district) LIKE LOWER(?)"); params.append(f"%{district}%")
        if mp_name:
            where.append("mp_name = ?"); params.append(mp_name)
        if work_type:
            where.append("work_type = ?"); params.append(work_type)
        if work_status:
            where.append("LOWER(work_status) LIKE LOWER(?)"); params.append(f"%{work_status}%")
        if min_amount is not None:
            where.append("amount >= ?"); params.append(min_amount)
        if date_from is not None:
            where.append("date >= ?"); params.append(date_from)
        if search:
            # Case-insensitive search for both fields
            where.append("(LOWER(mp_name) LIKE LOWER(?) OR LOWER(work_id) LIKE LOWER(?))")
            params += [f"%{search}%", f"%{search}%"]
        where_sql = " AND ".join(where)

        order = {"risk_score_desc": "risk_score DESC, amount DESC",
                  "amount_desc": "amount DESC", "date_desc": "date DESC"}[sort]

        total = conn.execute(f"SELECT COUNT(*) FROM works WHERE {where_sql}", params).fetchone()[0]
        rows = conn.execute(
            f"""SELECT work_id, mp_name, state, constituency, work_type, work_subcategory, amount, date,
                       risk_score, risk_level, reason, work_description, dup_cluster_size
                FROM works WHERE {where_sql} ORDER BY {order} LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()
        return {"total": total, "limit": limit, "offset": offset, "results": rows_to_dicts(rows)}
    finally:
        conn.close()


# ── Compliance ────────────────────────────────────────────────────────────────
@app.get("/api/compliance")
def compliance():
    """Compliance check results across all works based on statutory rules."""
    conn = get_conn()
    try:
        rules_config = [
            {
                "id": "sanction_timeline",
                "label": "45-Day Sanction Rule",
                "description": "Work must be sanctioned within 45 days of recommendation",
                "metric_col": "rec_to_san_days",
                "breach_sql": "rec_to_san_days > 45",
                "warning_sql": "rec_to_san_days BETWEEN 35 AND 45",
            },
            {
                "id": "completion_timeline",
                "label": "Completion Timeline Rule",
                "description": "Works must not remain stalled beyond 365 days",
                "metric_col": "stall_days",
                "breach_sql": "stall_days > 365",
                "warning_sql": "stall_days BETWEEN 270 AND 365",
            },
            {
                "id": "payment_initiation",
                "label": "Payment Initiation Rule",
                "description": "Works with unaccounted funds score indicating payment irregularities",
                "metric_col": "unaccounted_score",
                "breach_sql": "unaccounted_score >= 7",
                "warning_sql": "unaccounted_score BETWEEN 4 AND 7",
            },
            {
                "id": "category_eligibility",
                "label": "Category Eligibility Rule",
                "description": "Calamity fund misuse indicates likely ineligible category use",
                "metric_col": "calamity_score",
                "breach_sql": "calamity_score >= 7",
                "warning_sql": None,
            },
            {
                "id": "duplicate_work",
                "label": "Duplicate Work Rule",
                "description": "Works flagged as potential duplicates violate fund allocation guidelines",
                "metric_col": "dup_score",
                "breach_sql": "dup_score >= 7",
                "warning_sql": "dup_score BETWEEN 3 AND 7",
            },
            {
                "id": "phantom_completion",
                "label": "Phantom Completion Rule",
                "description": "Works claimed as completed without evidence",
                "metric_col": "phantom_score",
                "breach_sql": "phantom_score >= 7",
                "warning_sql": "phantom_score BETWEEN 3 AND 7",
            },
            {
                "id": "cost_overrun",
                "label": "Cost Overrun Rule",
                "description": "Work cost significantly exceeds category median",
                "metric_col": "cost_ratio",
                "breach_sql": "cost_ratio > 3.0",
                "warning_sql": "cost_ratio BETWEEN 2.0 AND 3.0",
            },
        ]

        total_checked_row = conn.execute("SELECT COUNT(*) FROM works").fetchone()
        total_checked = total_checked_row[0] if total_checked_row else 0

        total_breaches = 0
        total_warnings = 0
        rules_results = []

        for rule in rules_config:
            breach_sql = rule["breach_sql"]
            warning_sql = rule["warning_sql"]
            metric_col = rule["metric_col"]

            # Breach count and amount
            breach_row = conn.execute(
                f"SELECT COUNT(*) AS cnt, SUM(amount) AS amt FROM works WHERE {breach_sql}"
            ).fetchone()
            breach_count = breach_row["cnt"] or 0
            affected_amount = breach_row["amt"] or 0.0

            # Warning count
            if warning_sql:
                warning_row = conn.execute(
                    f"SELECT COUNT(*) AS cnt FROM works WHERE {warning_sql}"
                ).fetchone()
                warning_count = warning_row["cnt"] or 0
            else:
                warning_count = 0

            # Status determination
            if breach_count > 0:
                status = "breach"
            elif warning_count > 0:
                status = "warning"
            else:
                status = "pass"

            # Top 3 worst offenders (by metric value descending among breaches)
            sample_rows = conn.execute(
                f"""SELECT work_id, mp_name, state, {metric_col} AS value
                    FROM works WHERE {breach_sql} AND {metric_col} IS NOT NULL
                    ORDER BY {metric_col} DESC LIMIT 3"""
            ).fetchall()
            sample_works = [
                {"work_id": r["work_id"], "mp_name": r["mp_name"], "state": r["state"], "value": r["value"]}
                for r in sample_rows
            ]

            total_breaches += breach_count
            total_warnings += warning_count

            rules_results.append({
                "id": rule["id"],
                "label": rule["label"],
                "description": rule["description"],
                "status": status,
                "breach_count": breach_count,
                "affected_amount": float(affected_amount),
                "sample_works": sample_works,
            })

        return {
            "summary": {
                "total_checked": total_checked,
                "breaches": total_breaches,
                "warnings": total_warnings,
            },
            "rules": rules_results,
        }
    finally:
        conn.close()


COMPLIANCE_BREACH_SQL: dict[str, str] = {
    "sanction_timeline":    "rec_to_san_days > 45",
    "completion_timeline":  "stall_days > 365",
    "payment_initiation":   "unaccounted_score >= 7",
    "category_eligibility": "calamity_score >= 7",
    "duplicate_work":       "dup_score >= 7",
    "phantom_completion":   "phantom_score >= 7",
    "cost_overrun":         "cost_ratio > 3.0",
}

COMPLIANCE_WARNING_SQL: dict[str, str | None] = {
    "sanction_timeline":    "rec_to_san_days BETWEEN 35 AND 45",
    "completion_timeline":  "stall_days BETWEEN 270 AND 365",
    "payment_initiation":   "unaccounted_score BETWEEN 4 AND 7",
    "category_eligibility": None,
    "duplicate_work":       "dup_score BETWEEN 3 AND 7",
    "phantom_completion":   "phantom_score BETWEEN 3 AND 7",
    "cost_overrun":         "cost_ratio BETWEEN 2.0 AND 3.0",
}


@app.get("/api/compliance/rule-works")
def compliance_rule_works(
    rule_id: str = Query(...),
    include_warnings: bool = Query(False),
    limit: int = Query(200, ge=1, le=500),
):
    """Return all works that breach (or warn on) a given compliance rule."""
    breach_sql = COMPLIANCE_BREACH_SQL.get(rule_id)
    if not breach_sql:
        raise HTTPException(400, f"Unknown rule_id: {rule_id}")
    warning_sql = COMPLIANCE_WARNING_SQL.get(rule_id)

    if include_warnings and warning_sql:
        where = f"({breach_sql}) OR ({warning_sql})"
    else:
        where = breach_sql

    conn = get_conn()
    try:
        rows = conn.execute(
            f"""SELECT work_id, mp_name, state, constituency, work_type, amount, date,
                       risk_score, risk_level, work_status,
                       rec_to_san_days, stall_days, unaccounted_score,
                       calamity_score, dup_score, phantom_score, cost_ratio
                FROM works
                WHERE {where}
                ORDER BY risk_score DESC
                LIMIT ?""",
            (limit,),
        ).fetchall()
        return {"rule_id": rule_id, "total": len(rows), "results": rows_to_dicts(rows)}
    finally:
        conn.close()


# ── MP Analytics ──────────────────────────────────────────────────────────────
@app.get("/api/mp-analytics")
def mp_analytics(
    mp_name: Optional[str] = Query(None),
    limit: int = Query(500, ge=1, le=2000),
):
    """Detailed analytics for a specific MP, or leaderboard of all MPs."""
    conn = get_conn()
    try:
        if mp_name:
            mp_name = mp_name.strip()
            # Basic summary
            summ = conn.execute(
                """SELECT state, constituency,
                          COUNT(*) AS total_works,
                          SUM(amount) AS total_amount,
                          SUM(total_exp) AS total_exp,
                          SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_count,
                          SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count,
                          ROUND(AVG(risk_score), 2) AS avg_risk_score,
                          SUM(CASE WHEN pipeline_stage = 'Completed' THEN 1 ELSE 0 END) AS completed_works
                   FROM works WHERE mp_name = ?""",
                (mp_name,),
            ).fetchone()
            if not summ or summ["total_works"] == 0:
                raise HTTPException(404, f"MP '{mp_name}' not found")

            total_works = summ["total_works"] or 0
            completed_works = summ["completed_works"] or 0
            total_amount = summ["total_amount"] or 0.0
            total_exp = summ["total_exp"] or 0.0
            utilization_pct = round((total_exp / total_amount * 100) if total_amount > 0 else 0.0, 2)
            completion_rate = round((completed_works / total_works * 100) if total_works > 0 else 0.0, 2)

            # By category
            by_cat = conn.execute(
                """SELECT work_type, COUNT(*) AS count, SUM(amount) AS total_amount, ROUND(AVG(risk_score), 2) AS avg_risk
                   FROM works WHERE mp_name = ?
                   GROUP BY work_type ORDER BY total_amount DESC""",
                (mp_name,),
            ).fetchall()

            # Risk distribution
            risk_dist = conn.execute(
                """SELECT risk_level, COUNT(*) AS n FROM works WHERE mp_name = ? GROUP BY risk_level""",
                (mp_name,),
            ).fetchall()
            risk_distribution = {r["risk_level"]: r["n"] for r in risk_dist}

            # Signal scores
            signals = conn.execute(
                """SELECT ROUND(AVG(fin_score), 2) AS avg_fin_score,
                          ROUND(AVG(rec_delay_score), 2) AS avg_rec_delay_score,
                          ROUND(AVG(stall_score), 2) AS avg_stall_score,
                          ROUND(AVG(dup_score), 2) AS avg_dup_score,
                          ROUND(AVG(phantom_score), 2) AS avg_phantom_score
                   FROM works WHERE mp_name = ?""",
                (mp_name,),
            ).fetchone()

            # Top 5 risk works
            top_risk = conn.execute(
                """SELECT work_id, work_type, amount, risk_score, risk_level
                   FROM works WHERE mp_name = ?
                   ORDER BY risk_score DESC LIMIT 5""",
                (mp_name,),
            ).fetchall()

            return {
                "mp_name": mp_name,
                "state": summ["state"],
                "constituency": summ["constituency"],
                "summary": {
                    "total_works": total_works,
                    "total_amount": float(total_amount),
                    "total_exp": float(total_exp),
                    "utilization_pct": utilization_pct,
                    "flagged_count": summ["flagged_count"] or 0,
                    "critical_count": summ["critical_count"] or 0,
                    "avg_risk_score": summ["avg_risk_score"] or 0.0,
                    "completed_works": completed_works,
                    "completion_rate": completion_rate,
                },
                "by_category": rows_to_dicts(by_cat),
                "risk_distribution": risk_distribution,
                "signal_scores": {
                    "fin": signals["avg_fin_score"] or 0.0,
                    "rec_delay": signals["avg_rec_delay_score"] or 0.0,
                    "stall": signals["avg_stall_score"] or 0.0,
                    "dup": signals["avg_dup_score"] or 0.0,
                    "phantom": signals["avg_phantom_score"] or 0.0,
                },
                "top_risk_works": rows_to_dicts(top_risk),
            }
        else:
            # Leaderboard: all MPs ordered by avg_risk_score DESC.
            # Default limit (500) comfortably covers every MP in the dataset;
            # callers can override via ?limit= up to 2000.
            rows = conn.execute(
                """SELECT mp_name, state, constituency,
                          COUNT(*) AS total_works,
                          SUM(amount) AS total_amount,
                          SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_count,
                          SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count,
                          ROUND(AVG(risk_score), 2) AS avg_risk_score,
                          ROUND(
                            CASE WHEN SUM(amount) > 0
                                 THEN SUM(total_exp) * 100.0 / SUM(amount)
                                 ELSE 0 END,
                          2) AS utilization_pct,
                          ROUND(
                            CASE WHEN COUNT(*) > 0
                                 THEN SUM(CASE WHEN pipeline_stage = 'Completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
                                 ELSE 0 END,
                          2) AS completion_rate
                   FROM works
                   GROUP BY mp_name, state, constituency
                   ORDER BY avg_risk_score DESC
                   LIMIT ?""",
                (limit,),
            ).fetchall()
            return {"results": rows_to_dicts(rows)}
    finally:
        conn.close()


# ── Financial Intelligence ────────────────────────────────────────────────────
@app.get("/api/financial")
def financial_intelligence():
    """Financial intelligence summary: cost overruns, payment gaps, state breakdown, yearly spending."""
    conn = get_conn()
    try:
        # Summary stats
        summ = conn.execute(
            """SELECT
                SUM(amount) AS total_sanctioned,
                SUM(total_exp) AS total_expenditure,
                SUM(amount) - SUM(COALESCE(total_exp, 0)) AS idle_funds,
                SUM(CASE WHEN fin_score >= 5 THEN amount ELSE 0 END) AS financial_exposure,
                SUM(CASE WHEN cost_ratio > 2 THEN 1 ELSE 0 END) AS cost_overrun_count,
                SUM(CASE WHEN unaccounted_score >= 5 THEN 1 ELSE 0 END) AS payment_gap_count
               FROM works"""
        ).fetchone()

        total_sanctioned = summ["total_sanctioned"] or 0.0
        total_expenditure = summ["total_expenditure"] or 0.0
        utilization_pct = round((total_expenditure / total_sanctioned * 100) if total_sanctioned > 0 else 0.0, 2)

        # Cost overruns: top 20 by cost_ratio DESC where cost_ratio > 2
        overruns = conn.execute(
            """SELECT work_id, mp_name, state, work_type, amount, cost_ratio, cost_z
               FROM works WHERE cost_ratio > 2
               ORDER BY cost_ratio DESC LIMIT 20"""
        ).fetchall()

        # Payment gaps: top 20 by unaccounted_score DESC where unaccounted_score >= 5
        payment_gaps = conn.execute(
            """SELECT work_id, mp_name, state, amount, total_exp, unaccounted_score, pipeline_stage
               FROM works WHERE unaccounted_score >= 5
               ORDER BY unaccounted_score DESC LIMIT 20"""
        ).fetchall()

        # By state
        by_state = conn.execute(
            """SELECT state,
                      SUM(amount) AS total_amount,
                      SUM(total_exp) AS total_exp,
                      ROUND(CASE WHEN SUM(amount) > 0 THEN SUM(total_exp) * 100.0 / SUM(amount) ELSE 0 END, 2) AS utilization_pct,
                      COALESCE(SUM(CASE WHEN risk_score >= 50 THEN amount ELSE 0 END), 0) AS exposure
               FROM works
               GROUP BY state
               ORDER BY exposure DESC"""
        ).fetchall()

        # Yearly spending
        yearly = conn.execute(
            """SELECT strftime('%Y', date) AS year,
                      SUM(amount) AS total_amount,
                      SUM(CASE WHEN risk_score >= 20 THEN amount ELSE 0 END) AS flagged_amount,
                      COUNT(*) AS work_count
               FROM works
               WHERE date IS NOT NULL AND date != ''
               GROUP BY year
               ORDER BY year"""
        ).fetchall()

        return {
            "summary": {
                "total_sanctioned": float(total_sanctioned),
                "total_expenditure": float(total_expenditure),
                "utilization_pct": utilization_pct,
                "idle_funds": float(summ["idle_funds"] or 0.0),
                "financial_exposure": float(summ["financial_exposure"] or 0.0),
                "cost_overrun_count": summ["cost_overrun_count"] or 0,
                "payment_gap_count": summ["payment_gap_count"] or 0,
            },
            "cost_overruns": rows_to_dicts(overruns),
            "payment_gaps": rows_to_dicts(payment_gaps),
            "by_state": rows_to_dicts(by_state),
            "yearly_spending": rows_to_dicts(yearly),
        }
    finally:
        conn.close()


# ── AI Copilot ────────────────────────────────────────────────────────────────
class CopilotMessage(BaseModel):
    role: str
    content: str

class CopilotRequest(BaseModel):
    query: str
    history: list[CopilotMessage] = []

@app.post("/api/copilot")
def copilot(req: CopilotRequest):
    """Non-streaming AI Copilot for the MPLADS audit intelligence platform."""
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(500, "GROQ_API_KEY not set on server")

    # Fetch grounding data inline
    conn = get_conn()
    try:
        stats = conn.execute(
            """SELECT COUNT(*) AS total_works,
                      SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_count,
                      SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count,
                      SUM(CASE WHEN risk_score >= 40 THEN 1 ELSE 0 END) AS high_risk_count,
                      COUNT(DISTINCT state) AS state_count,
                      COUNT(DISTINCT mp_name) AS mp_count
               FROM works"""
        ).fetchone()
        total_works = stats["total_works"] or 0
        flagged_count = stats["flagged_count"] or 0
        critical_count = stats["critical_count"] or 0
        high_risk_count = stats["high_risk_count"] or 0
        state_count = stats["state_count"] or 0
        mp_count = stats["mp_count"] or 0
    finally:
        conn.close()

    system_prompt = f"""You are an MPLADS Audit Intelligence Copilot embedded in a government financial oversight platform.

You have access to data about MPLADS (Members of Parliament Local Area Development Scheme) projects across India.

== CURRENT DATASET SNAPSHOT ==
- Total works analyzed: {total_works:,}
- Works flagged for anomalies (risk score >= 20): {flagged_count:,}
- High-risk works (risk score >= 40): {high_risk_count:,}
- Critical works (risk score >= 75): {critical_count:,}
- States covered: {state_count}
- MPs covered: {mp_count}

== WHAT YOU CAN ANSWER ==
- Questions about corruption risk patterns, financial anomalies, and audit findings
- Questions about stalled works, phantom completions, duplicate works, and fund misuse
- Questions about specific states, MPs, or work categories (direct the user to the Cases tab for specific records)
- Explanation of risk scores, signal types, and scoring methodology
- Recommendations for investigative actions and audit priorities

== RISK SIGNAL TYPES ==
- Financial Anomaly (fin_score): Cost significantly above category median
- Recommendation Delay (rec_delay_score): Work took > 45 days from recommendation to sanction
- Stalled Work (stall_score): Work hasn't progressed in over 270+ days
- Unaccounted Funds (unaccounted_score): Funds disbursed but work not progressing through pipeline
- Phantom Completion (phantom_score): Work marked complete suspiciously fast or without photo evidence
- Duplicate Work (dup_score): Similar works by same or nearby MPs suggesting double-billing
- Calamity Misuse (calamity_score): Possible misuse of calamity relief fund provisions

== QUERY EXAMPLES YOU CAN HANDLE ==
- "Which states have the highest risk?" / "What are the biggest financial anomalies?"
- "Explain how the risk score works" / "What does a phantom completion mean?"
- "What should I investigate first?" / "How many works are critically at risk?"
- "What are the common patterns of fraud in MPLADS?"

== GUIDELINES ==
- Be specific and cite the real numbers from the data snapshot above
- If asked about specific works or MPs, note the user can search/filter in the Cases tab
- Keep responses concise and actionable — this is an investigation tool
- Use ₹ for Indian Rupees; format large amounts in lakhs (L) or crores (Cr)
- Never fabricate data not in the snapshot; acknowledge when you don't have specific details
"""

    # Build message history (cap at last 6 messages)
    history = req.history[-6:] if len(req.history) > 6 else req.history
    messages = [{"role": m.role, "content": m.content} for m in history]
    messages.append({"role": "user", "content": req.query})

    from groq import Groq
    client = Groq(api_key=groq_key)
    resp = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "system", "content": system_prompt}] + messages,
        max_tokens=1024,
        temperature=0.3,
    )
    response_text = (resp.choices[0].message.content or "").strip()

    # Classify query type heuristically
    query_lower = req.query.lower()
    if any(kw in query_lower for kw in ["how many", "count", "total", "which state", "which mp", "highest", "most", "largest", "top", "list"]):
        query_type = "data_query"
    elif any(kw in query_lower for kw in ["recommend", "should", "prioritize", "next step", "investigate", "action", "what to do"]):
        query_type = "recommendation"
    else:
        query_type = "explanation"

    return {"response": response_text, "query_type": query_type}


@app.get("/api/works/{work_id:path}/peers")
def work_peers(work_id: str, n: int = Query(6, ge=1, le=50)):
    """Comparable works in the same category, spanning the peer distribution,
    so the cost-anomaly claim can be visually checked against real examples."""
    conn = get_conn()
    try:
        row = conn.execute("SELECT work_type, work_subcategory, amount FROM works WHERE work_id = ?", (work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        this_amount = row["amount"]
        subcat = row["work_subcategory"] or "other"
        # peer pool: same subcategory, different MP, amount within 2× range
        peers = conn.execute(
            """SELECT work_id, mp_name, state, amount, date, risk_score
               FROM works WHERE work_subcategory = ? AND work_id != ? AND amount IS NOT NULL
                 AND mp_name != (SELECT mp_name FROM works WHERE work_id = ?)
                 AND amount BETWEEN ? AND ?
               GROUP BY mp_name
               ORDER BY ABS(amount - ?) ASC
               LIMIT ?""",
            (subcat, work_id, work_id,
             this_amount / 2, this_amount * 2,
             this_amount, n),
        ).fetchall()
        median_row = conn.execute(
            """SELECT amount FROM works
               WHERE work_subcategory = ? AND amount IS NOT NULL AND amount BETWEEN ? AND ?
               ORDER BY amount LIMIT 1
               OFFSET CAST((SELECT COUNT(*) FROM works WHERE work_subcategory = ? AND amount IS NOT NULL AND amount BETWEEN ? AND ?) / 2 AS INTEGER)""",
            (subcat, this_amount / 2, this_amount * 2,
             subcat, this_amount / 2, this_amount * 2),
        ).fetchone()
        return {
            "work_type": row["work_type"],
            "work_subcategory": subcat,
            "this_work_amount": row["amount"],
            "category_median_amount": median_row["amount"] if median_row else None,
            "peers": rows_to_dicts(peers),
        }
    finally:
        conn.close()


@app.get("/api/works/{work_id:path}/related-transactions")
def related_transactions(work_id: str, n: int = 10):
    """Returns other completed works by the same MP in the same category as context."""
    conn = get_conn()
    row = conn.execute("SELECT mp_name, work_type FROM works WHERE work_id = ?", (work_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(404, f"work_id '{work_id}' not found")
    peers = conn.execute(
        """SELECT work_id, state, amount, date, risk_score, work_type AS work_type_or_desc,
                  NULL AS payment_status, NULL AS source, constituency AS ida
           FROM works WHERE mp_name = ? AND work_type = ? AND work_id != ?
           ORDER BY date DESC LIMIT ?""",
        (row["mp_name"], row["work_type"], work_id, n),
    ).fetchall()
    conn.close()
    return {
        "note": "Other completed works by the same MP in the same work category.",
        "mp_name": row["mp_name"], "work_type": row["work_type"],
        "transactions": rows_to_dicts(peers),
    }


@app.get("/api/works/{work_id:path}/similar")
def similar_works(work_id: str, top_k: int = Query(8, ge=1, le=20)):
    if work_id not in _tfidf_index:
        return {"work_id": work_id, "results": [], "note": "No description available for similarity search"}
    query_vec = _tfidf_index[work_id]
    conn = get_conn()
    try:
        this_row = conn.execute("SELECT dup_pair FROM works WHERE work_id = ?", (work_id,)).fetchone()
        dup_pair = this_row["dup_pair"] if this_row else None
        scores = []
        for wid in _tfidf_work_ids:
            if wid == work_id or wid == dup_pair:
                continue
            score = _cosine(query_vec, _tfidf_index.get(wid, {}))
            if score > 0.1:
                scores.append((wid, score))
        scores.sort(key=lambda x: -x[1])
        top_ids = [wid for wid, _ in scores[:top_k]]
        score_map = {wid: s for wid, s in scores[:top_k]}
        if not top_ids:
            return {"work_id": work_id, "results": []}
        placeholders = ",".join("?" * len(top_ids))
        rows = conn.execute(
            f"SELECT work_id, mp_name, state, amount, risk_score, work_description FROM works WHERE work_id IN ({placeholders})",
            top_ids,
        ).fetchall()
        results = []
        for r in rows:
            d = dict(r)
            d["similarity_score"] = round(score_map.get(r["work_id"], 0), 3)
            results.append(d)
        results.sort(key=lambda x: -x["similarity_score"])
        return {"work_id": work_id, "results": results}
    finally:
        conn.close()


@app.get("/api/works/{work_id:path}")
def work_detail(work_id: str):
    # NOTE: registered AFTER /peers and /related-transactions above.
    # {work_id:path} is a greedy matcher (work_id itself contains slashes,
    # e.g. "WS/MP18108/2025-2026/195805"), so FastAPI/Starlette resolves
    # routes in registration order -- if this route were defined first it
    # would swallow "/peers" and "/related-transactions" as part of the id.
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM works WHERE work_id = ?", (work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        d = dict(row)
        d["evidence"] = build_evidence(d)
        return d
    finally:
        conn.close()


@app.get("/api/documentation-gaps")
def documentation_gaps(n: int = Query(20, ge=1, le=200)):
    """MPs with the highest rate of completed works lacking photographic verification."""
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT mp_name,
                   COUNT(*) AS completed_works,
                   SUM(CASE WHEN has_image = 0 THEN 1 ELSE 0 END) AS missing_images,
                   ROUND(100.0 * SUM(CASE WHEN has_image = 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS missing_pct,
                   ROUND(AVG(risk_score), 1) AS avg_risk_score
            FROM works
            WHERE pipeline_stage = 'Completed'
            GROUP BY mp_name
            HAVING completed_works >= 3 AND missing_pct >= 30
            ORDER BY missing_images DESC, missing_pct DESC
            LIMIT ?
        """, (n,)).fetchall()
        return {"results": rows_to_dicts(rows)}
    finally:
        conn.close()


@app.get("/api/mps/top-suspicious")
def top_suspicious_mps(n: int = Query(15, ge=1, le=100), min_risk_score: int = Query(50, ge=0, le=100)):
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT mp_name, state, constituency,
                      COUNT(*) AS flagged_works,
                      SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_works,
                      ROUND(AVG(risk_score), 1) AS avg_risk_score,
                      MAX(risk_score) AS max_risk_score
               FROM works WHERE risk_score >= ?
               GROUP BY mp_name, state, constituency
               ORDER BY flagged_works DESC, avg_risk_score DESC
               LIMIT ?""",
            (min_risk_score, n),
        ).fetchall()
        return {"results": rows_to_dicts(rows)}
    finally:
        conn.close()


@app.get("/api/mps/{mp_name}")
def mp_profile(mp_name: str):
    conn = get_conn()
    try:
        summ = conn.execute("SELECT * FROM mp_summary WHERE mp_name = ?", (mp_name,)).fetchone()
        works_stats = conn.execute(
            """SELECT COUNT(*) AS total_works,
                      SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_works,
                      ROUND(AVG(risk_score), 1) AS avg_risk_score
               FROM works WHERE mp_name = ?""", (mp_name,),
        ).fetchone()
        categories = conn.execute(
            """SELECT work_type, amount, conc_score, conc_ratio, portfolio_share, peer_median_spend
               FROM mp_category_concentration WHERE mp_name = ? ORDER BY amount DESC""",
            (mp_name,),
        ).fetchall()
        top_flagged = conn.execute(
            """SELECT work_id, work_type, amount, risk_score, risk_level, reason
               FROM works WHERE mp_name = ? ORDER BY risk_score DESC LIMIT 10""",
            (mp_name,),
        ).fetchall()
        doc_gap = conn.execute(
            """SELECT COUNT(*) AS completed_works,
                      SUM(CASE WHEN has_image = 0 THEN 1 ELSE 0 END) AS missing_images,
                      ROUND(100.0 * SUM(CASE WHEN has_image = 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 1) AS missing_pct
               FROM works WHERE mp_name = ? AND pipeline_stage = 'Completed'""",
            (mp_name,),
        ).fetchone()
        total_works = works_stats["total_works"] if works_stats and works_stats["total_works"] is not None else 0
        if not summ and total_works == 0:
            raise HTTPException(404, f"MP '{mp_name}' not found")
        return {
            "mp_name": mp_name,
            "allocation": dict(summ) if summ else None,
            "works_summary": dict(works_stats) if works_stats else {"total_works": 0, "flagged_works": 0, "avg_risk_score": None},
            "category_breakdown": rows_to_dicts(categories),
            "top_flagged_works": rows_to_dicts(top_flagged),
            "documentation_gap": dict(doc_gap) if doc_gap else None,
        }
    finally:
        conn.close()


# ── AI endpoints ──────────────────────────────────────────────────────────────

def _groq_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY not set on server")
    from groq import Groq
    return Groq(api_key=key)

def _groq_json(prompt: str, system: str, temperature: float = 0.1) -> dict:
    client = _groq_client()
    resp = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        max_tokens=1024,
        temperature=temperature,
    )
    raw = resp.choices[0].message.content or ""
    # extract JSON from response (may be wrapped in markdown)
    match = re.search(r'\{.*\}|\[.*\]', raw, re.DOTALL)
    if not match:
        raise HTTPException(500, f"LLM returned non-JSON: {raw[:200]}")
    return json.loads(match.group())


class NLSearchRequest(BaseModel):
    query: str

@app.post("/api/nl-search")
def nl_search(req: NLSearchRequest):
    system = """You extract database filters from a natural language query about Indian government MPLADS works.
Return ONLY valid JSON with these keys (use null for unspecified):
{
  "state": string or null,
  "mp_name": string or null,
  "work_type": string or null,
  "work_status": string or null,
  "min_risk_score": integer 0-100 or null,
  "min_amount": number in rupees or null,
  "search": string or null,
  "explanation": string (1 sentence describing what you extracted)
}
For amounts: "50 lakhs" = 5000000, "1 crore" = 10000000.
For states: use full state name e.g. "Uttar Pradesh" not "UP".
For work_status: common values are "Work Completed", "Work in Progress", "Work Not Started".
Return ONLY the JSON object, no markdown."""

    extracted = _groq_json(req.query, system, temperature=0.1)
    conn = get_conn()
    try:
        where, params = ["1=1"], []
        min_risk = extracted.get("min_risk_score") or 0
        where.append("risk_score >= ?"); params.append(min_risk)
        if extracted.get("state"):
            where.append("state = ?"); params.append(extracted["state"])
        if extracted.get("mp_name"):
            where.append("LOWER(mp_name) LIKE LOWER(?)"); params.append(f"%{extracted['mp_name']}%")
        if extracted.get("work_type"):
            where.append("work_type = ?"); params.append(extracted["work_type"])
        if extracted.get("work_status"):
            where.append("LOWER(work_status) LIKE LOWER(?)"); params.append(f"%{extracted['work_status']}%")
        if extracted.get("min_amount"):
            where.append("amount >= ?"); params.append(float(extracted["min_amount"]))
        if extracted.get("search"):
            where.append("(LOWER(mp_name) LIKE LOWER(?) OR LOWER(work_id) LIKE LOWER(?))")
            params += [f"%{extracted['search']}%", f"%{extracted['search']}%"]
        where_sql = " AND ".join(where)
        total = conn.execute(f"SELECT COUNT(*) FROM works WHERE {where_sql}", params).fetchone()[0]
        rows = conn.execute(
            f"""SELECT work_id, mp_name, state, constituency, work_type, work_subcategory, amount, date,
                       risk_score, risk_level, reason, work_description, dup_cluster_size
                FROM works WHERE {where_sql} ORDER BY risk_score DESC, amount DESC LIMIT 50""",
            params,
        ).fetchall()
        return {
            "filters": extracted,
            "explanation": extracted.get("explanation", ""),
            "total": total,
            "results": rows_to_dicts(rows),
        }
    finally:
        conn.close()


@app.post("/api/brief/{work_id:path}")
def generate_brief(work_id: str):
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM works WHERE work_id = ?", (work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        work = dict(row)
        work["evidence"] = build_evidence(work)
    finally:
        conn.close()
    try:
        peers = work_peers(work_id, n=5)
    except Exception:
        peers = None
    ev = work["evidence"]
    peer_ctx = f"Peer median for this category: ₹{peers['category_median_amount']:,.0f}" if peers and peers.get("category_median_amount") else ""
    prompt = f"""Write a 3-paragraph investigation brief for this MPLADS work. Be specific, factual, and concise.

Work ID: {work['work_id']}
MP: {work['mp_name']} ({work['state']}, {work['constituency']})
Category: {work.get('work_subcategory') or work.get('work_type')}
Description: {work.get('work_description', 'N/A')}
Amount: ₹{(work.get('amount') or 0):,.0f}
Date: {work.get('date')}
Status: {work.get('work_status')} / {work.get('pipeline_stage')}
Risk Score: {work.get('risk_score')}/100 ({work.get('risk_level')})
{peer_ctx}

Risk signals:
- Financial anomaly score: {ev['financial_anomaly']['score']} (ratio: {ev['financial_anomaly']['ratio_to_category_median']}×, z-score: {ev['financial_anomaly']['z_score']})
- Portfolio concentration: {ev['financial_anomaly']['portfolio_share']}
- Recommendation delay: {ev['rec_delay']['score']} pts, {ev['rec_delay']['days']} days
- Stalled work: {ev['stalled_work']['score']} pts, status "{ev['stalled_work']['work_status']}", {ev['stalled_work']['days_stalled']} days stalled
- Unaccounted funds: {ev['unaccounted_funds']['score']} pts, ₹{ev['unaccounted_funds']['total_disbursed']:,.0f} disbursed
- Phantom completion: {ev['phantom_completion']['score']} pts, {ev['phantom_completion']['days_to_complete']} days to complete, has photo: {ev['phantom_completion']['has_image']}
- Duplicate work: {ev['duplicate_work']['score']} pts, duplicate of: {ev['duplicate_work']['duplicate_of']}
- Calamity misuse: {ev['calamity_misuse']['score']} pts

Paragraph 1 — Executive Summary: What is suspicious about this work and why it warrants investigation.
Paragraph 2 — Key Evidence: Analyse the most significant risk signals with specific numbers.
Paragraph 3 — Recommended Next Steps: Concrete investigative actions an auditor should take."""

    client = _groq_client()
    resp = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=800,
        temperature=0.4,
    )
    brief = (resp.choices[0].message.content or "").strip()
    return {"work_id": work_id, "brief": brief}


class PrioritizeRequest(BaseModel):
    work_ids: list[str]

@app.post("/api/prioritize")
def prioritize_works(req: PrioritizeRequest):
    if not req.work_ids:
        raise HTTPException(400, "work_ids must not be empty")
    work_ids = req.work_ids[:20]
    conn = get_conn()
    try:
        placeholders = ",".join("?" * len(work_ids))
        rows = conn.execute(
            f"SELECT work_id, mp_name, state, work_type, amount, risk_score, risk_level, reason, work_status, "
            f"fin_score, rec_delay_score, stall_score, unaccounted_score, phantom_score, dup_score, calamity_score "
            f"FROM works WHERE work_id IN ({placeholders})",
            work_ids,
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        raise HTTPException(404, "None of the work_ids found")
    bullets = []
    for r in rows:
        bullets.append(
            f"- {r['work_id']} | MP: {r['mp_name']} ({r['state']}) | ₹{(r['amount'] or 0)/1e5:.1f}L | "
            f"Score: {r['risk_score']} | {r['risk_level']} | Signals: fin={r['fin_score']} rec={r['rec_delay_score']} "
            f"stall={r['stall_score']} funds={r['unaccounted_score']} phantom={r['phantom_score']} dup={r['dup_score']}"
        )
    system = """You are an expert forensic auditor prioritizing MPLADS government works for investigation.
Return ONLY a JSON object with:
{
  "ranked": [{"work_id": "...", "rank": 1, "reason": "one sentence why this is highest priority"}],
  "summary": "one sentence overall assessment"
}
Order from most urgent to least urgent. Be specific about which signals drive priority."""
    prompt = "Rank these works by investigation priority (most urgent first):\n\n" + "\n".join(bullets)
    result = _groq_json(prompt, system, temperature=0.2)
    if isinstance(result, list):
        result = {"ranked": result, "summary": ""}
    return result


@app.post("/api/llm-risk/{work_id:path}")
def llm_risk_assessment(work_id: str):
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM works WHERE work_id = ?", (work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        work = dict(row)
    finally:
        conn.close()
    system = """You are a forensic auditor assessing government project descriptions for corruption risk.
Return ONLY a JSON object:
{
  "qualitative_score": integer 0-10,
  "flags": ["short flag 1", "short flag 2"],
  "reasoning": "one sentence overall assessment"
}
Score 0 = no concern, 10 = highly suspicious.
Flag issues like: vague/generic description, implausibly fast completion, suspiciously round amount,
description mismatch with work type, missing specifics (no location/dimensions/materials)."""
    prompt = f"""Assess this government infrastructure project:

Work ID: {work['work_id']}
Work Type: {work.get('work_type')}
Description: {work.get('work_description', 'N/A')}
Amount: ₹{(work.get('amount') or 0):,.0f}
Status: {work.get('work_status')} / {work.get('pipeline_stage')}
State: {work.get('state')}, {work.get('constituency')}"""
    return _groq_json(prompt, system, temperature=0.2)


# ── Trends ────────────────────────────────────────────────────────────────────
@app.get("/api/trends")
def get_trends():
    conn = get_conn()
    try:
        monthly = conn.execute("""
            SELECT strftime('%Y-%m', date) AS month,
                   COUNT(*) AS flagged_count,
                   SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count,
                   ROUND(AVG(risk_score), 1) AS avg_risk_score,
                   SUM(amount) AS total_amount
            FROM works
            WHERE risk_score >= 20 AND date IS NOT NULL AND date != ''
            GROUP BY month
            ORDER BY month DESC
            LIMIT 24
        """).fetchall()
        # Every state gets a row so the choropleth never shows a low-activity
        # state (e.g. J&K, Uttarakhand) as blank "no data". The colour keeps the
        # flagged-severity gradient where a state has flagged records, and falls
        # back to the all-works average (a low value) when it has none.
        by_state = conn.execute("""
            SELECT state,
                   SUM(CASE WHEN risk_score >= 20 THEN 1 ELSE 0 END) AS flagged_count,
                   SUM(CASE WHEN risk_score >= 75 THEN 1 ELSE 0 END) AS critical_count,
                   ROUND(COALESCE(
                       AVG(CASE WHEN risk_score >= 20 THEN risk_score END),
                       AVG(risk_score)
                   ), 1) AS avg_risk_score,
                   SUM(amount) AS total_amount
            FROM works
            GROUP BY state
            ORDER BY flagged_count DESC
        """).fetchall()
        signal_counts = conn.execute("""
            SELECT
                SUM(CASE WHEN fin_score > 0 THEN 1 ELSE 0 END) AS financial_anomaly,
                SUM(CASE WHEN rec_delay_score > 0 THEN 1 ELSE 0 END) AS rec_delay,
                SUM(CASE WHEN stall_score > 0 THEN 1 ELSE 0 END) AS stalled_work,
                SUM(CASE WHEN unaccounted_score > 0 THEN 1 ELSE 0 END) AS unaccounted_funds,
                SUM(CASE WHEN phantom_score > 0 THEN 1 ELSE 0 END) AS phantom_completion,
                SUM(CASE WHEN dup_score > 0 THEN 1 ELSE 0 END) AS duplicate_work,
                SUM(CASE WHEN calamity_score > 0 THEN 1 ELSE 0 END) AS calamity_misuse
            FROM works WHERE risk_score >= 20
        """).fetchone()
        return {
            "monthly": rows_to_dicts(monthly),
            "by_state": rows_to_dicts(by_state),
            "signal_breakdown": dict(signal_counts) if signal_counts else {},
        }
    finally:
        conn.close()


# ── CSV Export ────────────────────────────────────────────────────────────────
@app.get("/api/export/csv")
def export_csv(
    state: Optional[str] = None,
    mp_name: Optional[str] = None,
    work_type: Optional[str] = None,
    min_risk_score: int = Query(0, ge=0, le=100),
    search: Optional[str] = Query(None),
):
    import csv, io
    conn = get_conn()
    try:
        where, params = ["risk_score >= ?"], [min_risk_score]
        if state:
            where.append("state = ?"); params.append(state.strip())
        if mp_name:
            where.append("mp_name = ?"); params.append(mp_name.strip())
        if work_type:
            where.append("work_type = ?"); params.append(work_type.strip())
        if search:
            search = search.strip()
            where.append("(LOWER(mp_name) LIKE LOWER(?) OR LOWER(work_id) LIKE LOWER(?))")
            params += [f"%{search}%", f"%{search}%"]
        where_sql = " AND ".join(where)
        rows = conn.execute(
            f"""SELECT work_id, mp_name, state, constituency, work_type, work_subcategory,
                       amount, date, risk_score, risk_level, reason, work_status, pipeline_stage,
                       work_description, fin_score, rec_delay_score, stall_score, unaccounted_score,
                       phantom_score, dup_score, calamity_score, dup_pair
                FROM works WHERE {where_sql} ORDER BY risk_score DESC LIMIT 5000""",
            params,
        ).fetchall()
        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            for r in rows:
                writer.writerow(dict(r))
        csv_content = output.getvalue()
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=mplads_export.csv"},
        )
    finally:
        conn.close()


# ── Per-work HTML report (print-to-PDF) ──────────────────────────────────────
@app.get("/api/export/report/{work_id:path}")
def export_work_report(work_id: str):
    import html as html_mod
    from datetime import datetime as _dt

    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM works WHERE work_id = ?", (work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        w = dict(row)
        ev = build_evidence(w)
    finally:
        conn.close()

    risk_score = w.get("risk_score") or 0
    risk_level = (w.get("risk_level") or "Unknown").upper()
    if risk_score >= 70:
        risk_color = "#ef4444"
        risk_bg = "#fef2f2"
    elif risk_score >= 40:
        risk_color = "#f59e0b"
        risk_bg = "#fffbeb"
    else:
        risk_color = "#22c55e"
        risk_bg = "#f0fdf4"

    bar_pct = min(risk_score, 100)

    def score_color(pts):
        if pts >= 25: return "#ef4444"
        if pts >= 10: return "#f59e0b"
        return "#6b7280"

    def esc(v):
        return html_mod.escape(str(v) if v is not None else "—")

    signals = [
        ("Financial Anomaly",    ev["financial_anomaly"]["score"],
         f"Ratio to category median: {ev['financial_anomaly']['ratio_to_category_median']}×, z-score: {ev['financial_anomaly']['z_score']}"),
        ("Recommendation Delay", ev["rec_delay"]["score"],
         f"{ev['rec_delay']['days']} days from recommendation to sanction"),
        ("Stalled Work",         ev["stalled_work"]["score"],
         f"{ev['stalled_work']['days_stalled']} days stalled · status: {ev['stalled_work']['work_status']}"),
        ("Unaccounted Funds",    ev["unaccounted_funds"]["score"],
         f"₹{(ev['unaccounted_funds']['total_disbursed'] or 0):,.0f} disbursed with gaps"),
        ("Phantom Completion",   ev["phantom_completion"]["score"],
         f"{ev['phantom_completion']['days_to_complete']} days to complete · photo: {ev['phantom_completion']['has_image']}"),
        ("Duplicate Work",       ev["duplicate_work"]["score"],
         f"Duplicate of: {ev['duplicate_work']['duplicate_of'] or 'None'}"),
        ("Calamity Misuse",      ev["calamity_misuse"]["score"],
         "Anomalous activity during declared calamity period"),
    ]

    signal_rows = ""
    for name, pts, detail in signals:
        col = score_color(pts)
        signal_rows += f"""
        <tr>
          <td class="sig-name">{esc(name)}</td>
          <td class="sig-pts" style="color:{col}">{pts} pts</td>
          <td class="sig-bar-cell">
            <div class="sig-bar-track">
              <div class="sig-bar-fill" style="width:{min(pts,50)*2}%;background:{col}"></div>
            </div>
          </td>
          <td class="sig-detail">{esc(detail)}</td>
        </tr>"""

    reasons = [r.strip() for r in (w.get("reason") or "").split(",") if r.strip()]
    reason_pills = "".join(f'<span class="reason-pill">{esc(r)}</span>' for r in reasons) or "<span class='no-reason'>None flagged</span>"

    generated = _dt.utcnow().strftime("%d %b %Y, %H:%M UTC")

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MPLADS Report — {esc(w['work_id'])}</title>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:0}}
  @page{{size:A4;margin:18mm 16mm 18mm 16mm}}
  @media print{{
    body{{padding:0}}
    .no-print{{display:none!important}}
    .page{{box-shadow:none;border-radius:0;max-width:100%;padding:0}}
    tr{{break-inside:avoid}}
    .section{{break-inside:avoid}}
  }}
  .print-btn{{position:fixed;top:16px;right:16px;z-index:99;background:#1e3a5f;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2)}}
  .print-btn:hover{{background:#2a4f82}}
  .page{{max-width:800px;margin:0 auto;padding:32px 32px 40px;background:#fff}}
  .header{{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #1e3a5f;margin-bottom:20px}}
  .header-left h1{{font-size:18px;font-weight:700;color:#1e3a5f;letter-spacing:.5px}}
  .header-left .subtitle{{font-size:11px;color:#6b7280;margin-top:4px;letter-spacing:.3px}}
  .header-right{{text-align:right;font-size:11px;color:#6b7280}}
  .work-id{{font-family:monospace;font-size:12px;font-weight:700;color:#1e3a5f;background:#eef2ff;padding:2px 8px;border-radius:4px;display:inline-block;margin-bottom:4px}}
  .meta-grid{{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin-bottom:20px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}}
  .meta-item label{{display:block;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}}
  .meta-item span{{font-size:13px;color:#1a1a2e;font-weight:500}}
  .meta-item.full{{grid-column:1/-1}}
  .risk-banner{{display:flex;align-items:center;gap:20px;padding:16px 20px;border-radius:8px;margin-bottom:20px;background:{risk_bg};border:1px solid {risk_color}40}}
  .risk-score-circle{{width:60px;height:60px;border-radius:50%;background:{risk_color};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0}}
  .risk-score-circle .num{{font-size:20px;font-weight:700;line-height:1}}
  .risk-score-circle .denom{{font-size:10px;opacity:.8}}
  .risk-label-block .level{{font-size:16px;font-weight:700;color:{risk_color}}}
  .risk-label-block .desc{{font-size:11px;color:#6b7280;margin-top:2px}}
  .risk-bar-wrap{{flex:1}}
  .risk-bar-track{{height:10px;background:#e5e7eb;border-radius:5px;overflow:hidden}}
  .risk-bar-fill{{height:100%;border-radius:5px;background:{risk_color};width:{bar_pct}%}}
  .risk-bar-label{{font-size:10px;color:#6b7280;margin-top:4px;text-align:right}}
  .section{{margin-bottom:20px}}
  .section-title{{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1e3a5f;margin-bottom:10px;padding-bottom:5px;border-bottom:1px solid #e2e8f0}}
  table.signals{{width:100%;border-collapse:collapse}}
  table.signals td{{padding:7px 8px;vertical-align:middle;border-bottom:1px solid #f1f5f9;font-size:12px}}
  .sig-name{{font-weight:600;color:#1a1a2e;width:34%}}
  .sig-pts{{font-weight:700;font-family:monospace;width:8%;text-align:right;white-space:nowrap}}
  .sig-bar-cell{{width:20%;padding:7px 12px}}
  .sig-bar-track{{height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden}}
  .sig-bar-fill{{height:100%;border-radius:3px;transition:width .3s}}
  .sig-detail{{color:#6b7280;font-size:11px}}
  .reasons-wrap{{display:flex;flex-wrap:wrap;gap:6px;padding:12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0}}
  .reason-pill{{background:#fef3c7;border:1px solid #f59e0b40;color:#92400e;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:600}}
  .no-reason{{color:#6b7280;font-style:italic;font-size:12px}}
  .footer{{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af}}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>
<div class="page">

  <div class="header">
    <div class="header-left">
      <h1>MPLADS ANOMALY INVESTIGATION REPORT</h1>
      <div class="subtitle">Members of Parliament Local Area Development Scheme · Anomaly Detection Platform</div>
    </div>
    <div class="header-right">
      <div class="work-id">{esc(w['work_id'])}</div>
      <div>Generated {esc(generated)}</div>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item">
      <label>MP Name</label>
      <span>{esc(w.get('mp_name','—'))}</span>
    </div>
    <div class="meta-item">
      <label>State</label>
      <span>{esc(w.get('state','—'))}</span>
    </div>
    <div class="meta-item">
      <label>Constituency</label>
      <span>{esc(w.get('constituency','—'))}</span>
    </div>
    <div class="meta-item">
      <label>Work Type</label>
      <span>{esc(w.get('work_subcategory') or w.get('work_type','—'))}</span>
    </div>
    <div class="meta-item">
      <label>Sanctioned Amount</label>
      <span>₹{(w.get('amount') or 0):,.0f}</span>
    </div>
    <div class="meta-item">
      <label>Date</label>
      <span>{esc(w.get('date','—'))}</span>
    </div>
    <div class="meta-item">
      <label>Work Status</label>
      <span>{esc(w.get('work_status','—'))}</span>
    </div>
    <div class="meta-item">
      <label>Pipeline Stage</label>
      <span>{esc(w.get('pipeline_stage','—'))}</span>
    </div>
    <div class="meta-item full">
      <label>Description</label>
      <span>{esc(w.get('work_description','—'))}</span>
    </div>
  </div>

  <div class="risk-banner">
    <div class="risk-score-circle">
      <span class="num">{risk_score}</span>
      <span class="denom">/100</span>
    </div>
    <div class="risk-label-block">
      <div class="level">{risk_level}</div>
      <div class="desc">Composite anomaly risk score</div>
    </div>
    <div class="risk-bar-wrap">
      <div class="risk-bar-track">
        <div class="risk-bar-fill"></div>
      </div>
      <div class="risk-bar-label">{risk_score} / 100</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Risk Signal Breakdown</div>
    <table class="signals">
      <tbody>{signal_rows}</tbody>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Reason Flags</div>
    <div class="reasons-wrap">{reason_pills}</div>
  </div>

  <div class="footer">
    <span>MPLADS Anomaly Detection Platform — Confidential</span>
    <span>Work ID: {esc(w['work_id'])}</span>
  </div>

</div>
</body>
</html>"""

    return Response(
        content=html_content.encode("utf-8"),
        media_type="text/html; charset=utf-8",
    )


# ── Description quality (LLM) ─────────────────────────────────────────────────
@app.post("/api/description-quality/{work_id:path}")
def description_quality(work_id: str):
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT work_id, work_type, work_subcategory, work_description, amount, state FROM works WHERE work_id = ?",
            (work_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{work_id}' not found")
        work = dict(row)
    finally:
        conn.close()
    system = """You are an auditor assessing the quality of government project descriptions.
Return ONLY a JSON object:
{
  "quality_score": integer 0-10 (10=excellent, 0=completely vague),
  "vagueness_score": integer 0-10 (10=extremely vague, 0=highly specific),
  "flags": ["flag 1", "flag 2"],
  "assessment": "one sentence summary"
}
Flag problems like: too generic (no location/dimensions/specs), copy-paste boilerplate, description doesn't match work type, suspiciously brief for the amount, no material specifications."""
    prompt = f"""Assess this government infrastructure project description quality:

Work Type: {work.get('work_type')} / {work.get('work_subcategory')}
Description: {work.get('work_description', 'N/A')}
Amount: ₹{(work.get('amount') or 0):,.0f}
State: {work.get('state')}

Is this description specific enough to verify the work was actually done? Does it contain enough detail for audit?"""
    result = _groq_json(prompt, system, temperature=0.1)
    result["work_id"] = work_id
    return result


# ── Vendor / coordination patterns ───────────────────────────────────────────
@app.get("/api/vendor-patterns")
def vendor_patterns(n: int = Query(20, ge=1, le=100)):
    conn = get_conn()
    try:
        shared_desc = conn.execute("""
            SELECT work_description,
                   COUNT(DISTINCT mp_name) AS mp_count,
                   COUNT(*) AS work_count,
                   ROUND(AVG(amount), 0) AS avg_amount,
                   GROUP_CONCAT(DISTINCT state) AS states,
                   ROUND(AVG(risk_score), 1) AS avg_risk_score
            FROM works
            WHERE work_description IS NOT NULL AND work_description != ''
            GROUP BY LOWER(TRIM(work_description))
            HAVING mp_count >= 2
            ORDER BY mp_count DESC, work_count DESC
            LIMIT ?
        """, (n,)).fetchall()
        amount_clusters = conn.execute("""
            SELECT work_type, amount,
                   COUNT(DISTINCT mp_name) AS mp_count,
                   COUNT(*) AS work_count,
                   GROUP_CONCAT(DISTINCT state) AS states
            FROM works
            WHERE amount > 100000
            GROUP BY work_type, amount
            HAVING mp_count >= 3
            ORDER BY mp_count DESC, work_count DESC
            LIMIT ?
        """, (n,)).fetchall()
        return {
            "shared_descriptions": rows_to_dicts(shared_desc),
            "amount_clusters": rows_to_dicts(amount_clusters),
        }
    finally:
        conn.close()


@app.get("/api/vendor-patterns/cluster-records")
def cluster_records(
    cluster_type: str = Query(..., enum=["description", "amount"]),
    work_description: Optional[str] = None,
    work_type: Optional[str] = None,
    amount: Optional[float] = None,
):
    """Fetch the individual work records that belong to a pattern cluster."""
    conn = get_conn()
    try:
        if cluster_type == "description":
            if not work_description:
                raise HTTPException(400, "work_description required for description clusters")
            rows = conn.execute("""
                SELECT work_id, mp_name, state, constituency, work_type, amount,
                       date, risk_score, risk_level, work_status, work_description
                FROM works
                WHERE LOWER(TRIM(work_description)) = LOWER(TRIM(?))
                ORDER BY risk_score DESC
                LIMIT 100
            """, (work_description,)).fetchall()
        else:
            if not work_type or amount is None:
                raise HTTPException(400, "work_type and amount required for amount clusters")
            rows = conn.execute("""
                SELECT work_id, mp_name, state, constituency, work_type, amount,
                       date, risk_score, risk_level, work_status, work_description
                FROM works
                WHERE work_type = ? AND amount = ?
                ORDER BY risk_score DESC
                LIMIT 100
            """, (work_type, amount)).fetchall()
        return {"records": rows_to_dicts(rows)}
    finally:
        conn.close()


@app.get("/api/early-warning")
def early_warning(n: int = Query(30, ge=1, le=200)):
    conn = get_conn()
    try:
        rows = conn.execute("""
            SELECT work_id, mp_name, state, constituency, work_type, amount, date,
                   risk_score, risk_level, work_status, pipeline_stage,
                   fin_score, rec_delay_score, stall_score, unaccounted_score,
                   phantom_score, dup_score, calamity_score,
                   (CASE WHEN fin_score >= 15 THEN 1 ELSE 0 END +
                    CASE WHEN rec_delay_score >= 8 THEN 1 ELSE 0 END +
                    CASE WHEN stall_score >= 10 THEN 1 ELSE 0 END +
                    CASE WHEN unaccounted_score >= 10 THEN 1 ELSE 0 END +
                    CASE WHEN phantom_score >= 10 THEN 1 ELSE 0 END) AS signal_count
            FROM works
            WHERE risk_score BETWEEN 10 AND 35
              AND (fin_score >= 15 OR rec_delay_score >= 8 OR stall_score >= 10
                   OR unaccounted_score >= 10 OR phantom_score >= 10)
            ORDER BY signal_count DESC, risk_score DESC
            LIMIT ?
        """, (n,)).fetchall()
        return {"total": len(rows), "results": rows_to_dicts(rows)}
    finally:
        conn.close()


# ── Audit log ─────────────────────────────────────────────────────────────────
@app.post("/api/audit-log")
def append_audit_log(entry: AuditEntry):
    import datetime
    _audit_log.append({
        "work_id": entry.work_id,
        "action": entry.action,
        "authority": entry.authority,
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    })
    if len(_audit_log) > 500:
        _audit_log.pop(0)
    return {"ok": True}


@app.get("/api/audit-log")
def get_audit_log(limit: int = Query(50, ge=1, le=200)):
    return {"entries": _audit_log[-limit:][::-1]}


class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    work_id: str
    message: str
    history: list[ChatMessage] = []


def build_system_prompt(work: dict, peers_data: dict | None) -> str:
    ev = work.get("evidence", {})
    fin = ev.get("financial_anomaly", {})
    rec = ev.get("rec_delay", {})
    stall = ev.get("stalled_work", {})
    funds = ev.get("unaccounted_funds", {})
    phantom = ev.get("phantom_completion", {})
    dup = ev.get("duplicate_work", {})
    cal = ev.get("calamity_misuse", {})

    peer_context = ""
    if peers_data and peers_data.get("peers"):
        median = peers_data.get("category_median_amount")
        peer_context = f"\nPeer median cost for this work category: ₹{median:,.0f}" if median else ""

    return f"""You are an AI investigator assistant embedded in the MPLADS Anomaly Detection dashboard. \
You help analysts understand flagged government works and decide whether to escalate for investigation.

You have access to the following dossier for work ID: {work.get('work_id')}

== CASE OVERVIEW ==
MP Name: {work.get('mp_name')}
State: {work.get('state')} | Constituency: {work.get('constituency')}
Work Category: {work.get('work_subcategory') or work.get('work_type')}
Description: {work.get('work_description', 'N/A')}
Sanctioned Amount: ₹{(work.get('amount') or 0):,.0f}
Sanction Date: {work.get('date', 'N/A')}
Work Status: {work.get('work_status', 'N/A')}
Pipeline Stage: {work.get('pipeline_stage', 'N/A')}
Overall Risk Score: {work.get('risk_score', 0)}/100 ({work.get('risk_level', 'N/A')}){peer_context}

== RISK SIGNALS ==
Financial Anomaly Score: {fin.get('score', 0)} | Cost ratio to median: {fin.get('ratio_to_category_median', 'N/A')}× | Z-score: {fin.get('z_score', 'N/A')} | Flag type: {fin.get('flag_type', 'N/A')}
Portfolio concentration: {fin.get('portfolio_share', 0) and f"{float(fin.get('portfolio_share', 0))*100:.0f}% of MP portfolio in this category" or 'N/A'}
Recommendation Delay Score: {rec.get('score', 0)} | Days rec→sanction: {rec.get('days', 'N/A')}
Stalled Work Score: {stall.get('score', 0)} | Status: {stall.get('work_status', 'N/A')} | Days stalled: {stall.get('days_stalled', 'N/A')}
Unaccounted Funds Score: {funds.get('score', 0)} | Total disbursed: ₹{(funds.get('total_disbursed') or 0):,.0f}
Phantom Completion Score: {phantom.get('score', 0)} | Days to complete: {phantom.get('days_to_complete', 'N/A')} | Has photo: {phantom.get('has_image', False)}
Duplicate Work Score: {dup.get('score', 0)} | Duplicate of: {dup.get('duplicate_of', 'None')}
Calamity Fund Misuse Score: {cal.get('score', 0)}

== YOUR ROLE ==
- Answer questions about this specific case concisely and factually.
- If asked to assess risk, use the signal data above.
- If asked what to investigate next, give concrete, actionable suggestions.
- Do not fabricate data not present in this dossier.
- Keep responses short and direct — this is an investigation tool, not a report writer.
- Use ₹ for Indian Rupees. Format large amounts in lakhs (L) or crores (Cr) where readable.
"""


@app.post("/api/chat")
async def chat(req: ChatRequest):
    groq_key = os.environ.get("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(500, "GROQ_API_KEY not set on server")

    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM works WHERE work_id = ?", (req.work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{req.work_id}' not found")
        work = dict(row)
        work["evidence"] = build_evidence(work)
    finally:
        conn.close()

    # fetch peers for extra context
    try:
        peers_resp = work_peers(req.work_id, n=5)
    except Exception:
        peers_resp = None

    system_prompt = build_system_prompt(work, peers_resp)

    messages = [{"role": m.role, "content": m.content} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    from groq import Groq
    client = Groq(api_key=groq_key)

    def stream():
        completion = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "system", "content": system_prompt}] + messages,
            max_tokens=1024,
            temperature=0.3,
            stream=True,
        )
        for chunk in completion:
            delta = chunk.choices[0].delta.content
            if delta:
                yield f"data: {json.dumps({'content': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")


# ── Human-in-the-Loop Feedback ────────────────────────────────────────────────

MIN_FEEDBACK_SAMPLES = 30  # minimum human reviews before model training is allowed
FEEDBACK_MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback_model.joblib")

FEATURE_COLUMNS = [
    "fin_score", "rec_delay_score", "stall_score", "unaccounted_score",
    "phantom_score", "dup_score", "calamity_score",
    "cost_ratio", "conc_ratio", "portfolio_share",
]


@app.post("/api/feedback")
def submit_feedback(req: FeedbackRequest):
    """Submit human feedback for a work's risk score."""
    if req.human_label not in ("agree", "too_high", "too_low", "false_positive"):
        raise HTTPException(400, "human_label must be one of: agree, too_high, too_low, false_positive")
    if req.corrected_score is not None and not (0 <= req.corrected_score <= 100):
        raise HTTPException(400, "corrected_score must be between 0 and 100")

    conn = get_conn()
    try:
        # Check if user already reviewed
        existing = conn.execute("SELECT id FROM feedback WHERE work_id = ? AND reviewer = ?", (req.work_id, req.reviewer)).fetchone()
        if existing:
            raise HTTPException(400, "You have already submitted feedback for this work.")

        row = conn.execute("SELECT risk_score FROM works WHERE work_id = ?", (req.work_id,)).fetchone()
        if not row:
            raise HTTPException(404, f"work_id '{req.work_id}' not found")
        original_score = row["risk_score"]

        conn.execute(
            """INSERT INTO feedback (work_id, reviewer, human_label, corrected_score, notes, original_score, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (req.work_id, req.reviewer, req.human_label, req.corrected_score,
             req.notes, original_score, _datetime_cls.utcnow().isoformat() + "Z"),
        )
        conn.commit()
        return {"ok": True, "original_score": original_score}
    finally:
        conn.close()


@app.get("/api/feedback")
def list_feedback(
    work_id: Optional[str] = None,
    reviewer: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500),
):
    """List feedback entries, optionally filtered by work_id or reviewer."""
    conn = get_conn()
    try:
        where, params = ["1=1"], []
        if work_id:
            where.append("work_id = ?"); params.append(work_id)
        if reviewer:
            where.append("reviewer = ?"); params.append(reviewer)
        where_sql = " AND ".join(where)
        rows = conn.execute(
            f"""SELECT id, work_id, reviewer, human_label, corrected_score, notes,
                       original_score, created_at
                FROM feedback WHERE {where_sql}
                ORDER BY created_at DESC LIMIT ?""",
            params + [limit],
        ).fetchall()
        return {"total": len(rows), "results": rows_to_dicts(rows)}
    finally:
        conn.close()


@app.get("/api/feedback/stats")
def feedback_stats():
    """Aggregated feedback statistics for the admin dashboard."""
    conn = get_conn()
    try:
        total_row = conn.execute("SELECT COUNT(*) AS cnt FROM feedback").fetchone()
        total = total_row["cnt"] if total_row else 0

        label_dist = conn.execute(
            "SELECT human_label, COUNT(*) AS cnt FROM feedback GROUP BY human_label"
        ).fetchall()

        reviewer_counts = conn.execute(
            "SELECT reviewer, COUNT(*) AS cnt FROM feedback GROUP BY reviewer ORDER BY cnt DESC LIMIT 20"
        ).fetchall()

        recent = conn.execute(
            """SELECT id, work_id, reviewer, human_label, corrected_score, original_score, created_at
               FROM feedback ORDER BY created_at DESC LIMIT 10"""
        ).fetchall()

        agreement_row = conn.execute(
            "SELECT COUNT(*) AS cnt FROM feedback WHERE human_label = 'agree'"
        ).fetchone()
        agreement_count = agreement_row["cnt"] if agreement_row else 0
        agreement_rate = round(agreement_count / total * 100, 1) if total > 0 else 0.0

        return {
            "total_feedback": total,
            "agreement_rate": agreement_rate,
            "label_distribution": {r["human_label"]: r["cnt"] for r in label_dist},
            "top_reviewers": rows_to_dicts(reviewer_counts),
            "recent_feedback": rows_to_dicts(recent),
            "min_samples_for_training": MIN_FEEDBACK_SAMPLES,
            "can_train": total >= MIN_FEEDBACK_SAMPLES,
        }
    finally:
        conn.close()


@app.get("/api/feedback/{work_id:path}")
def get_work_feedback(work_id: str):
    """Get all feedback for a specific work."""
    conn = get_conn()
    try:
        rows = conn.execute(
            """SELECT id, work_id, reviewer, human_label, corrected_score, notes,
                      original_score, created_at
               FROM feedback WHERE work_id = ?
               ORDER BY created_at DESC""",
            (work_id,),
        ).fetchall()
        return {"work_id": work_id, "total": len(rows), "results": rows_to_dicts(rows)}
    finally:
        conn.close()


def _compute_target_score(human_label: str, original_score: float, corrected_score: float | None) -> float:
    """Derive a numeric target score from human feedback."""
    if corrected_score is not None:
        return corrected_score
    if human_label == "agree":
        return original_score
    if human_label == "too_high":
        return original_score * 0.5
    if human_label == "too_low":
        return min(original_score * 1.5, 100.0)
    if human_label == "false_positive":
        return 0.0
    return original_score


@app.post("/api/feedback/retrain")
def retrain_model():
    """Train a supervised model from collected human feedback. Admin-only."""
    import numpy as np

    conn = get_conn()
    try:
        # Gather feedback with work features
        feedback_rows = conn.execute(
            """SELECT f.work_id, f.human_label, f.corrected_score, f.original_score,
                      w.fin_score, w.rec_delay_score, w.stall_score, w.unaccounted_score,
                      w.phantom_score, w.dup_score, w.calamity_score,
                      w.cost_ratio, w.conc_ratio, w.portfolio_share, w.amount
               FROM feedback f
               JOIN works w ON f.work_id = w.work_id"""
        ).fetchall()

        if len(feedback_rows) < MIN_FEEDBACK_SAMPLES:
            raise HTTPException(
                400,
                f"Need at least {MIN_FEEDBACK_SAMPLES} feedback samples to train. "
                f"Currently have {len(feedback_rows)}.",
            )

        # Build feature matrix and target vector
        X_list = []
        y_list = []
        for row in feedback_rows:
            features = []
            for col in FEATURE_COLUMNS:
                val = row[col]
                features.append(float(val) if val is not None else 0.0)
            # Add log(amount) as a feature
            amt = row["amount"] or 0
            features.append(math.log1p(max(amt, 0)))
            X_list.append(features)

            target = _compute_target_score(row["human_label"], row["original_score"], row["corrected_score"])
            y_list.append(target)

        X = np.array(X_list)
        y = np.array(y_list)

        # Train GradientBoostingRegressor
        from sklearn.ensemble import GradientBoostingRegressor
        from sklearn.model_selection import cross_val_score
        import joblib

        model = GradientBoostingRegressor(
            n_estimators=100,
            max_depth=4,
            learning_rate=0.1,
            min_samples_leaf=3,
            random_state=42,
        )
        model.fit(X, y)

        # Cross-validation metrics (if enough samples)
        cv_mae = None
        cv_r2 = None
        if len(X) >= 10:
            mae_scores = cross_val_score(model, X, y, cv=min(5, len(X)), scoring="neg_mean_absolute_error")
            r2_scores = cross_val_score(model, X, y, cv=min(5, len(X)), scoring="r2")
            cv_mae = round(float(-mae_scores.mean()), 2)
            cv_r2 = round(float(r2_scores.mean()), 3)

        # Save model with metadata
        model_data = {
            "model": model,
            "feature_columns": FEATURE_COLUMNS + ["amount_log"],
            "trained_at": _datetime_cls.utcnow().isoformat() + "Z",
            "sample_count": len(X),
            "cv_mae": cv_mae,
            "cv_r2": cv_r2,
        }
        joblib.dump(model_data, FEEDBACK_MODEL_PATH)

        return {
            "ok": True,
            "sample_count": len(X),
            "cv_mae": cv_mae,
            "cv_r2": cv_r2,
            "model_path": FEEDBACK_MODEL_PATH,
            "trained_at": model_data["trained_at"],
        }
    finally:
        conn.close()


@app.get("/api/feedback/model-status")
def model_status():
    """Check if a trained feedback model exists and its metadata."""
    if not os.path.exists(FEEDBACK_MODEL_PATH):
        return {
            "model_exists": False,
            "trained_at": None,
            "sample_count": None,
            "cv_mae": None,
            "cv_r2": None,
        }
    try:
        import joblib
        data = joblib.load(FEEDBACK_MODEL_PATH)
        return {
            "model_exists": True,
            "trained_at": data.get("trained_at"),
            "sample_count": data.get("sample_count"),
            "cv_mae": data.get("cv_mae"),
            "cv_r2": data.get("cv_r2"),
            "feature_columns": data.get("feature_columns"),
        }
    except Exception as e:
        return {"model_exists": False, "error": str(e)}


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs", "overview": "/api/overview"}

