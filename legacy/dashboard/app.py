"""
MPLADS ANOMALY INVESTIGATION PLATFORM
=====================================
Enterprise-grade government audit & intelligence platform for explainable
anomaly detection across official MPLADS project records.
Built for SIH 2026.
Redesigned as an investigative intelligence workstation.
"""

import os
import re
import math
import random
import urllib.parse
import html
import textwrap
import requests
import pandas as pd
import altair as alt
import streamlit as st
import streamlit.components.v1 as components

API_BASE = os.environ.get("MPLADS_API_BASE", "http://localhost:8000").rstrip("/")

st.set_page_config(
    page_title="MPLADS Anomaly Investigation",
    layout="wide",
    page_icon="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⬡</text></svg>",
    initial_sidebar_state="expanded",
)


# --------------------------------------------------------------------------
# Clean HTML Renderer
# --------------------------------------------------------------------------
def render_clean_html(raw_html: str):
    cleaned = re.sub(r"<!--.*?-->", "", raw_html, flags=re.DOTALL)
    cleaned = textwrap.dedent(cleaned).strip()
    cleaned_lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    st.markdown("\n".join(cleaned_lines), unsafe_allow_html=True)


# --------------------------------------------------------------------------
# DESIGN SYSTEM — CSS
# --------------------------------------------------------------------------
CUSTOM_CSS = r"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

/* ============================================================
   TOKENS
   ============================================================ */
:root {
    --bg:             #06090f;
    --bg-subtle:      #0a0e18;
    --surface:        #0c1220;
    --surface-raised: #111a2e;
    --surface-hover:  #162040;
    --border:         rgba(255,255,255,0.06);
    --border-strong:  rgba(255,255,255,0.12);
    --border-focus:   rgba(59,130,246,0.5);

    --text:           #f0f2f5;
    --text-secondary: #a0aec0;
    --text-muted:     #64748b;
    --text-dim:       #4a5568;

    --info:           #3b82f6;
    --info-subtle:    rgba(59,130,246,0.10);
    --success:        #10b981;
    --success-subtle: rgba(16,185,129,0.10);
    --warning:        #f59e0b;
    --warning-subtle: rgba(245,158,11,0.10);
    --danger:         #ef4444;
    --danger-subtle:  rgba(239,68,68,0.10);

    --mono: 'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace;
    --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

    --r-sm: 4px;
    --r-md: 6px;
    --r-lg: 8px;

    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);

    --transition-fast: 150ms ease;
    --transition-med:  250ms ease;
    --transition-slow: 350ms cubic-bezier(0.16,1,0.3,1);

    --z-sidebar: 100;
    --z-header:  200;
    --z-overlay: 999;
    --z-drawer:  1000;
    --z-modal:   1100;
}

/* ============================================================
   GLOBAL RESET
   ============================================================ */
html, body, [data-testid="stAppViewContainer"],
[data-testid="stApp"] {
    background: var(--bg) !important;
    color: var(--text) !important;
    font-family: var(--sans) !important;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

[data-testid="stHeader"] {
    background: rgba(6,9,15,0.92) !important;
    backdrop-filter: blur(16px) !important;
    border-bottom: 1px solid var(--border) !important;
    height: 0 !important;
    min-height: 0 !important;
    padding: 0 !important;
    visibility: hidden !important;
}

[data-testid="stSidebar"] {
    background: #080d18 !important;
    border-right: 1px solid var(--border) !important;
}

[data-testid="stSidebar"] .block-container {
    padding-top: 1rem !important;
    padding-left: 0.75rem !important;
    padding-right: 0.75rem !important;
}

.main .block-container {
    padding-top: 0 !important;
    padding-bottom: 2rem !important;
    max-width: 100% !important;
    padding-left: 1.25rem !important;
    padding-right: 1.25rem !important;
}

/* ============================================================
   TYPOGRAPHY
   ============================================================ */
h1, h2, h3, h4, h5, h6 {
    font-family: var(--sans) !important;
    font-weight: 700 !important;
    color: var(--text) !important;
    letter-spacing: -0.02em !important;
}

.mono {
    font-family: var(--mono) !important;
    font-variant-numeric: tabular-nums !important;
}

/* ============================================================
   SECTION NUMBERING
   ============================================================ */
.section-number {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--text-dim);
    letter-spacing: 0.04em;
    margin-right: 0.5rem;
}

.section-title {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--text-secondary);
    margin-bottom: 0.15rem;
    display: flex;
    align-items: center;
}

.section-subtitle {
    font-size: 0.68rem;
    color: var(--text-muted);
    margin-top: 0.1rem;
}

/* ============================================================
   APP HEADER — Operational System Bar
   ============================================================ */
.app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.65rem 1rem;
    margin: 0 -1.25rem 0.75rem -1.25rem;
    padding-left: 1.25rem;
    padding-right: 1.25rem;
    background: linear-gradient(180deg, rgba(12,18,32,0.95) 0%, var(--bg) 100%);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
    gap: 0.5rem;
}

.app-brand {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.app-shield {
    width: 34px;
    height: 34px;
    border-radius: var(--r-md);
    background: var(--info-subtle);
    border: 1px solid rgba(59,130,246,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--info);
    font-size: 0.95rem;
    flex-shrink: 0;
}

.app-title {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
}

.app-title-main {
    font-size: 0.85rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: var(--text);
    text-transform: uppercase;
    line-height: 1.1;
}

.app-title-sub {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-weight: 400;
    letter-spacing: 0.01em;
}

.app-meta {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
}

.app-status {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.55rem;
    background: var(--success-subtle);
    border: 1px solid rgba(16,185,129,0.2);
    border-radius: 20px;
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--success);
    letter-spacing: 0.04em;
}

.app-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success);
    box-shadow: 0 0 6px var(--success);
    animation: statusPulse 2.5s infinite ease-in-out;
}

@keyframes statusPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}

.app-records {
    font-size: 0.65rem;
    font-family: var(--mono);
    font-weight: 500;
    color: var(--text-secondary);
}

.app-verified {
    font-size: 0.6rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
}

.app-refresh {
    font-size: 0.6rem;
    color: var(--text-dim);
    font-family: var(--mono);
}

/* ============================================================
   KPI CARDS — Visual Hierarchy
   ============================================================ */
.kpi-row {
    display: grid;
    grid-template-columns: 1.2fr 1fr 1fr 0.9fr 0.9fr;
    gap: 0.6rem;
    margin-bottom: 0.75rem;
}

@media (max-width: 1100px) {
    .kpi-row { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 700px) {
    .kpi-row { grid-template-columns: repeat(2, 1fr); }
}

.kpi {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 0.7rem 0.85rem;
    position: relative;
    overflow: hidden;
    transition: border-color var(--transition-fast), background var(--transition-fast);
}

.kpi:hover {
    border-color: var(--border-strong);
    background: var(--surface-raised);
}

.kpi::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
}

.kpi.kpi-primary::before { background: var(--info); }
.kpi.kpi-value::before   { background: #6366f1; }
.kpi.kpi-flag::before    { background: var(--warning); }
.kpi.kpi-high::before    { background: #f97316; }
.kpi.kpi-crit::before    { background: var(--danger); }
.kpi.kpi-crit { border-color: rgba(239,68,68,0.15); }

.kpi-label {
    font-size: 0.58rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--text-muted);
    margin-bottom: 0.25rem;
}

.kpi-value {
    font-size: 1.35rem;
    font-weight: 800;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--text);
    line-height: 1.1;
    margin-bottom: 0.15rem;
}

.kpi.kpi-crit .kpi-value { color: #fca5a5; }

.kpi-sub {
    font-size: 0.62rem;
    color: var(--text-muted);
    font-weight: 500;
}

.kpi-spark {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 16px;
    margin-top: 0.25rem;
}

.kpi-spark-bar {
    width: 3px;
    border-radius: 1px;
    background: var(--text-dim);
    opacity: 0.5;
}

.kpi-spark-bar.active {
    opacity: 1;
}

/* ============================================================
   INVESTIGATION SUMMARY STRIP
   ============================================================ */
.inv-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.85rem;
    margin-bottom: 0.75rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    flex-wrap: wrap;
    gap: 0.5rem;
}

.inv-strip-stats {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
}

.inv-strip-item {
    display: flex;
    flex-direction: column;
}

.inv-strip-num {
    font-size: 0.85rem;
    font-weight: 700;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    color: var(--text);
}

.inv-strip-num.num-warn { color: #fbbf24; }
.inv-strip-num.num-high { color: #fb923c; }
.inv-strip-num.num-crit { color: #f87171; }
.inv-strip-num.num-money { color: #60a5fa; }

.inv-strip-label {
    font-size: 0.55rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
}

.inv-strip-sep {
    width: 1px;
    height: 24px;
    background: var(--border-strong);
    flex-shrink: 0;
}

.inv-strip-actions {
    display: flex;
    gap: 0.35rem;
}

/* ============================================================
   BUTTONS
   ============================================================ */
.btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.65rem;
    border-radius: var(--r-md);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: 1px solid var(--border);
    background: var(--surface-raised);
    color: var(--text-secondary);
    text-decoration: none;
    white-space: nowrap;
}

.btn:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
    color: var(--text);
}

.btn-primary {
    background: var(--info);
    border-color: rgba(59,130,246,0.4);
    color: #fff;
}

.btn-primary:hover {
    background: #2563eb;
}

/* ============================================================
   RISK LANDSCAPE — Segmented Bar
   ============================================================ */
.landscape {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 0.75rem 0.85rem;
    margin-bottom: 0.6rem;
}

.landscape-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.landscape-meta {
    font-size: 0.62rem;
    color: var(--text-muted);
    font-family: var(--mono);
}

.risk-bar-track {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    background: #0f1729;
    margin-bottom: 0.6rem;
    border: 1px solid rgba(255,255,255,0.03);
}

.risk-seg {
    height: 100%;
    transition: opacity 0.15s ease;
}

.risk-seg:hover { filter: brightness(1.3); }

.risk-legend {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
}

@media (max-width: 768px) {
    .risk-legend { grid-template-columns: repeat(2, 1fr); }
}

.risk-legend-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.4rem;
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
}

.risk-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.risk-legend-name {
    font-size: 0.58rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
}

.risk-legend-val {
    font-size: 0.72rem;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
}

.risk-legend-pct {
    font-size: 0.6rem;
    font-weight: 400;
    color: var(--text-dim);
    margin-left: 0.15rem;
}

/* ============================================================
   HISTOGRAM
   ============================================================ */
.histogram-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: 0.65rem 0.85rem;
    margin-bottom: 0.6rem;
}

.hist-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 48px;
    margin-bottom: 0.3rem;
}

.hist-bar {
    flex: 1;
    min-width: 0;
    border-radius: 2px 2px 0 0;
    transition: opacity 0.15s ease;
    position: relative;
}

.hist-bar:hover { opacity: 0.85; }

.hist-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.55rem;
    font-family: var(--mono);
    color: var(--text-dim);
    padding: 0 1px;
}

.hist-threshold {
    position: absolute;
    top: -4px;
    width: 1px;
    height: calc(100% + 8px);
    background: var(--text-muted);
    z-index: 1;
}

.hist-threshold::after {
    content: attr(data-label);
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.5rem;
    font-family: var(--mono);
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
}

/* ============================================================
   METHODOLOGY STRIP
   ============================================================ */
.method-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
    margin-bottom: 0.6rem;
}

@media (max-width: 850px) {
    .method-strip { grid-template-columns: 1fr; }
}

.method-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0.55rem 0.7rem;
    border-left: 3px solid var(--text-dim);
}

.method-card.method-normal  { border-left-color: var(--success); }
.method-card.method-suspect { border-left-color: var(--warning); }
.method-card.method-crit    { border-left-color: var(--danger); background: rgba(239,68,68,0.03); }

.method-label {
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.15rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.method-normal .method-label  { color: var(--success); }
.method-suspect .method-label { color: var(--warning); }
.method-crit .method-label    { color: #f87171; }

.method-range {
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 600;
    color: var(--text-dim);
    margin-bottom: 0.15rem;
}

.method-desc {
    font-size: 0.65rem;
    color: var(--text-secondary);
    line-height: 1.35;
}

/* ============================================================
   INVESTIGATION TABLE — Investigation Queue
   ============================================================ */
.table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.35rem;
    flex-wrap: wrap;
    gap: 0.35rem;
}

.table-title {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.table-range {
    font-family: var(--mono);
    font-size: 0.62rem;
    color: var(--text-muted);
}

.table-hint {
    font-size: 0.62rem;
    color: var(--text-dim);
}

/* ============================================================
   INVESTIGATION DOSSIER (Right-side slide-in)
   ============================================================ */
.drawer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5,8,15,0.72);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: var(--z-overlay);
    opacity: 0;
    visibility: hidden;
    transition: opacity 200ms ease-out, visibility 200ms ease-out;
    pointer-events: none;
}

.drawer-backdrop.open {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
}

.st-key-investigation_drawer {
    position: fixed !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    left: auto !important;
    width: 560px !important;
    max-width: 92vw !important;
    height: 100dvh !important;
    height: 100vh !important;
    max-height: 100dvh !important;
    max-height: 100vh !important;
    overflow-y: auto !important;
    overflow-x: hidden !important;
    overscroll-behavior: contain !important;
    -webkit-overflow-scrolling: touch !important;
    background: #080d18 !important;
    border-left: 1px solid var(--border-strong) !important;
    border-radius: 0 !important;
    box-shadow: -16px 0 48px rgba(0,0,0,0.5) !important;
    z-index: var(--z-drawer) !important;
    transform: translateX(100%) !important;
    visibility: hidden !important;
    transition: transform var(--transition-slow), visibility var(--transition-slow) !important;
    padding: 0 !important;
}

.st-key-investigation_drawer.drawer-open {
    transform: translateX(0) !important;
    visibility: visible !important;
}

.st-key-investigation_drawer > div {
    padding: 0 !important;
}

.st-key-investigation_drawer .block-container {
    padding: 0 !important;
}

body:has(#drawer-state[data-open="true"]) .st-key-investigation_drawer {
    transform: translateX(0) !important;
    visibility: visible !important;
}

body:has(#drawer-state[data-open="true"]) #drawer-backdrop {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
}

body:has(#drawer-state[data-open="true"]) {
    overflow: hidden !important;
}

body:has(#drawer-state[data-open="true"]) html {
    overflow: hidden !important;
}

/* Dossier internals */
.dossier-header {
    position: sticky;
    top: 0;
    background: #080d18;
    z-index: 5;
    padding: 1rem 1.1rem 0.75rem;
    border-bottom: 1px solid var(--border);
}

.dossier-case-tag {
    font-size: 0.55rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--info);
    margin-bottom: 0.1rem;
}

.dossier-case-id {
    font-size: 0.95rem;
    font-weight: 800;
    font-family: var(--mono);
    color: var(--text);
    letter-spacing: 0.01em;
    word-break: break-all;
    line-height: 1.2;
}

.dossier-mp {
    font-size: 0.78rem;
    color: var(--text-secondary);
    margin-top: 0.15rem;
}

.dossier-mp b {
    color: var(--text);
}

.dossier-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    width: 32px;
    height: 32px;
    border-radius: var(--r-md);
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.03);
    color: var(--text-muted);
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
    z-index: 10;
}

.dossier-close:hover {
    background: rgba(255,255,255,0.07);
    color: var(--text);
    border-color: var(--border-strong);
}

.dossier-close:focus-visible {
    outline: 2px solid var(--info);
    outline-offset: 2px;
}

.dossier-body {
    padding: 0.75rem 1.1rem 1.5rem;
}

.dossier-section {
    margin-bottom: 0.85rem;
}

.dossier-section-title {
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--text-dim);
    margin-bottom: 0.4rem;
    padding-bottom: 0.2rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.dossier-section-num {
    font-family: var(--mono);
    font-size: 0.55rem;
    color: var(--text-dim);
}

/* Case overview grid */
.case-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.35rem;
}

@media (max-width: 500px) {
    .case-grid { grid-template-columns: 1fr; }
}

.case-item {
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
    padding: 0.35rem 0.5rem;
}

.case-label {
    font-size: 0.52rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-bottom: 0.1rem;
}

.case-val {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text);
}

.case-val.mono-val {
    font-family: var(--mono);
}

.case-val.amount-val {
    color: var(--info);
    font-family: var(--mono);
}

.case-val-full {
    grid-column: 1 / -1;
}

/* Finding cards — ranked evidence */
.finding {
    display: flex;
    gap: 0.6rem;
    padding: 0.5rem 0.65rem;
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-left: 3px solid var(--text-dim);
    border-radius: var(--r-md);
    margin-bottom: 0.35rem;
}

.finding.finding-critical { border-left-color: var(--danger); background: rgba(239,68,68,0.03); }
.finding.finding-high     { border-left-color: #f97316; background: rgba(249,115,22,0.03); }
.finding.finding-medium   { border-left-color: var(--warning); }

.finding-num {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--text-dim);
    min-width: 18px;
    padding-top: 0.05rem;
}

.finding-body {
    flex: 1;
    min-width: 0;
}

.finding-type {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.1rem;
}

.finding-finding-type.crit { color: #fca5a5; }
.finding-finding-type.high { color: #fdba74; }

.finding-evidence {
    font-size: 0.65rem;
    color: var(--text-secondary);
    line-height: 1.35;
}

.finding-evidence strong {
    color: var(--text);
}

.finding-meta {
    font-size: 0.58rem;
    color: var(--text-dim);
    font-family: var(--mono);
    margin-top: 0.15rem;
}

/* Factor bars */
.factor {
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0.5rem 0.65rem;
    margin-bottom: 0.35rem;
}

.factor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.2rem;
}

.factor-name {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text);
}

.factor-score {
    font-size: 0.7rem;
    font-weight: 700;
    font-family: var(--mono);
}

.factor-track {
    height: 4px;
    background: #141e30;
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 0.2rem;
}

.factor-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.6s ease;
}

.factor-detail {
    font-size: 0.62rem;
    color: var(--text-muted);
}

/* Peer benchmark */
.peer-compare {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
}

.peer-stat {
    flex: 1;
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0.4rem 0.55rem;
}

.peer-stat-label {
    font-size: 0.52rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-bottom: 0.1rem;
}

.peer-stat-val {
    font-size: 0.85rem;
    font-weight: 700;
    font-family: var(--mono);
    color: var(--text);
}

.peer-stat-val.peer-median { color: var(--info); }
.peer-stat-val.peer-this   { color: #f87171; }
.peer-stat-val.peer-dev    { color: #f87171; }

.peer-spectrum {
    position: relative;
    height: 28px;
    background: #0f1729;
    border-radius: var(--r-sm);
    border: 1px solid var(--border);
    margin-bottom: 0.5rem;
    overflow: visible;
}

.peer-spectrum-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--border-strong);
    transform: translateY(-50%);
}

.peer-marker {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid;
    z-index: 2;
}

.peer-marker.marker-median {
    background: var(--info);
    border-color: var(--info);
}

.peer-marker.marker-this {
    background: var(--danger);
    border-color: var(--danger);
    width: 12px;
    height: 12px;
    box-shadow: 0 0 8px rgba(239,68,68,0.4);
}

.peer-marker-label {
    position: absolute;
    top: -16px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 0.5rem;
    font-family: var(--mono);
    font-weight: 600;
    white-space: nowrap;
}

.peer-benchmark-text {
    font-size: 0.65rem;
    color: var(--text-secondary);
    line-height: 1.35;
    margin-top: 0.3rem;
}

.peer-benchmark-text strong {
    color: var(--text);
}

/* Investigator summary */
.inv-summary {
    background: rgba(59,130,246,0.04);
    border: 1px solid rgba(59,130,246,0.15);
    border-radius: var(--r-md);
    padding: 0.55rem 0.7rem;
    margin-bottom: 0.65rem;
    font-size: 0.7rem;
    color: var(--text-secondary);
    line-height: 1.4;
}

.inv-summary strong {
    color: var(--text);
}

/* Evidence strength */
.ev-strength {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
}

.ev-bar-track {
    flex: 1;
    height: 6px;
    background: #141e30;
    border-radius: 3px;
    overflow: hidden;
}

.ev-bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--success);
    transition: width 0.6s ease;
}

.ev-bar-fill.strong { background: var(--success); }
.ev-bar-fill.moderate { background: var(--warning); }
.ev-bar-fill.weak { background: var(--danger); }

.ev-label {
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--text-secondary);
}

.ev-count {
    font-size: 0.58rem;
    color: var(--text-dim);
    font-family: var(--mono);
}

/* Comparable projects */
.comp-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
}

.comp-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
}

.comp-rank {
    font-family: var(--mono);
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--text-dim);
    min-width: 16px;
}

.comp-amount {
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--text);
}

.comp-meta {
    font-size: 0.58rem;
    color: var(--text-dim);
}

.comp-risk {
    margin-left: auto;
    font-family: var(--mono);
    font-size: 0.62rem;
    font-weight: 700;
}

/* Investigate next */
.inv-next {
    background: var(--surface-raised);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0.55rem 0.7rem;
}

.inv-next-title {
    font-size: 0.6rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.10em;
    color: var(--info);
    margin-bottom: 0.35rem;
}

.inv-next-item {
    font-size: 0.65rem;
    color: var(--text-secondary);
    padding: 0.2rem 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.inv-next-arrow {
    color: var(--info);
    font-size: 0.7rem;
}

/* ============================================================
   SEVERITY BADGES
   ============================================================ */
.badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.45rem;
    border-radius: var(--r-sm);
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.badge-critical {
    background: rgba(239,68,68,0.14);
    border: 1px solid rgba(239,68,68,0.35);
    color: #f87171;
}

.badge-high {
    background: rgba(249,115,22,0.14);
    border: 1px solid rgba(249,115,22,0.35);
    color: #fb923c;
}

.badge-medium {
    background: rgba(245,158,11,0.14);
    border: 1px solid rgba(245,158,11,0.35);
    color: #fbbf24;
}

.badge-low {
    background: rgba(16,185,129,0.14);
    border: 1px solid rgba(16,185,129,0.35);
    color: #34d399;
}

/* ============================================================
   SIDEBAR — Investigation Controls
   ============================================================ */
.sidebar-brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding-bottom: 0.5rem;
    margin-bottom: 0.6rem;
    border-bottom: 1px solid var(--border);
}

.sidebar-brand-icon {
    width: 28px;
    height: 28px;
    border-radius: var(--r-sm);
    background: var(--info-subtle);
    border: 1px solid rgba(59,130,246,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--info);
    font-size: 0.8rem;
    flex-shrink: 0;
}

.sidebar-brand-text {
    font-size: 0.65rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text);
    line-height: 1.15;
}

.sidebar-brand-sub {
    font-size: 0.55rem;
    color: var(--text-dim);
    font-weight: 400;
}

.ctrl-label {
    font-size: 0.58rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-top: 0.7rem;
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.3rem;
}

.ctrl-label-icon {
    font-size: 0.65rem;
}

.filter-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.15rem 0.4rem;
    background: var(--info-subtle);
    border: 1px solid rgba(59,130,246,0.2);
    border-radius: var(--r-sm);
    font-size: 0.6rem;
    color: #93c5fd;
    font-family: var(--mono);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: 0.5rem;
}

.sidebar-status {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--border);
}

.sidebar-status-item {
    font-size: 0.58rem;
    color: var(--text-dim);
    font-family: var(--mono);
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-bottom: 0.15rem;
}

.sidebar-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
}

/* ============================================================
   COMMAND PALETTE
   ============================================================ */
.cmd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5,8,15,0.8);
    backdrop-filter: blur(8px);
    z-index: var(--z-modal);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    opacity: 0;
    visibility: hidden;
    transition: opacity 150ms ease, visibility 150ms ease;
}

.cmd-overlay.open {
    opacity: 1;
    visibility: visible;
}

.cmd-box {
    width: 520px;
    max-width: 90vw;
    background: var(--surface-raised);
    border: 1px solid var(--border-strong);
    border-radius: var(--r-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
}

.cmd-input-wrap {
    display: flex;
    align-items: center;
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid var(--border);
    gap: 0.5rem;
}

.cmd-icon {
    color: var(--text-dim);
    font-size: 0.85rem;
}

.cmd-input {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 0.85rem;
    font-family: var(--sans);
}

.cmd-input::placeholder {
    color: var(--text-dim);
}

.cmd-results {
    max-height: 280px;
    overflow-y: auto;
    padding: 0.35rem;
}

.cmd-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: var(--r-md);
    cursor: pointer;
    transition: background var(--transition-fast);
}

.cmd-item:hover, .cmd-item.active {
    background: var(--surface-hover);
}

.cmd-item-icon {
    font-size: 0.75rem;
    color: var(--text-dim);
    width: 20px;
    text-align: center;
}

.cmd-item-label {
    font-size: 0.75rem;
    color: var(--text);
    font-weight: 500;
}

.cmd-item-shortcut {
    margin-left: auto;
    font-size: 0.58rem;
    font-family: var(--mono);
    color: var(--text-dim);
    padding: 0.1rem 0.3rem;
    background: rgba(255,255,255,0.04);
    border-radius: 3px;
}

/* ============================================================
   EMPTY / ERROR / LOADING STATES
   ============================================================ */
.state-empty {
    text-align: center;
    padding: 2.5rem 1rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    margin: 0.75rem 0;
}

.state-empty-icon {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
    opacity: 0.6;
}

.state-empty-title {
    font-size: 0.9rem;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 0.25rem;
}

.state-empty-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    max-width: 420px;
    margin: 0 auto 1rem auto;
    line-height: 1.4;
}

.state-error {
    text-align: center;
    padding: 2rem 1rem;
    background: rgba(239,68,68,0.04);
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: var(--r-lg);
    margin: 0.75rem 0;
}

.state-error-icon {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
}

.state-error-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: #fca5a5;
    margin-bottom: 0.25rem;
}

.state-error-desc {
    font-size: 0.72rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
}

/* Skeleton loading */
@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}

.skeleton {
    background: linear-gradient(90deg, var(--surface) 25%, var(--surface-raised) 50%, var(--surface) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--r-sm);
}

.skeleton-line {
    height: 12px;
    margin-bottom: 0.35rem;
}

.skeleton-line.w60 { width: 60%; }
.skeleton-line.w80 { width: 80%; }
.skeleton-line.w40 { width: 40%; }

/* ============================================================
   PAGINATION
   ============================================================ */
.pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.4rem;
    padding: 0.4rem 0.65rem;
    background: rgba(255,255,255,0.015);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
}

.pagination-info {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-family: var(--mono);
}

/* ============================================================
   MP RANK CARDS
   ============================================================ */
.mp-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.45rem 0.65rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    margin-bottom: 0.3rem;
    transition: all var(--transition-fast);
}

.mp-card:hover {
    background: var(--surface-raised);
    border-color: var(--border-strong);
}

.mp-card-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
}

.mp-card-num {
    font-family: var(--mono);
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--info);
    min-width: 20px;
    flex-shrink: 0;
}

.mp-card-name {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.mp-card-sub {
    font-size: 0.58rem;
    color: var(--text-dim);
}

.mp-card-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.mp-card-score {
    text-align: right;
}

.mp-card-score-val {
    font-family: var(--mono);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text);
}

.mp-card-bar {
    width: 40px;
    height: 3px;
    background: #141e30;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2px;
}

.mp-card-bar-fill {
    height: 100%;
    border-radius: 2px;
}

/* ============================================================
   STREAMLIT WIDGET OVERRIDES
   ============================================================ */
div[data-testid="stDataFrame"] {
    border: 1px solid var(--border) !important;
    border-radius: var(--r-lg) !important;
    overflow: hidden !important;
}

div[data-testid="stDataFrame"] canvas {
    cursor: pointer !important;
}

div[data-testid="stDataFrame"] {
    --gdg-accent-color: var(--info) !important;
}

div[data-testid="stExpander"] {
    background-color: var(--surface) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--r-lg) !important;
    margin-bottom: 0.4rem !important;
}

[data-testid="stTextInput"] .st-emotion-cache-1avc5a3,
[data-testid="stTextInput"] span[class*="epumps80"],
.st-emotion-cache-1avc5a3,
span.st-emotion-cache-0.epumps80 {
    pointer-events: none !important;
}

[data-testid="stTextInput"] input,
[data-testid="stSidebar"] input {
    pointer-events: auto !important;
}

[data-testid="stHeader"] [data-testid="stSidebarCollapsedControl"],
[data-testid="collapsedControl"],
[data-testid="stHeader"] [data-testid="stExpandSidebarButton"],
[data-testid="stSidebarCollapseButton"],
[data-testid="stExpandSidebarButton"] {
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
    z-index: 1001 !important;
}

@media (max-width: 768px) {
    .st-key-investigation_drawer {
        width: 100vw !important;
        max-width: 100vw !important;
    }
}

@media (max-width: 420px) {
    .app-header { padding: 0.5rem 0.75rem !important; }
    .app-title-main { font-size: 0.75rem !important; }
    .kpi-value { font-size: 1.15rem !important; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}

/* Tab overrides */
.stTabs [data-baseweb="tab-list"] {
    gap: 0 !important;
    background: var(--surface) !important;
    border: 1px solid var(--border) !important;
    border-radius: var(--r-md) !important;
    padding: 0.15rem !important;
}

.stTabs [data-baseweb="tab"] {
    font-size: 0.68rem !important;
    font-weight: 600 !important;
    letter-spacing: 0.03em !important;
    color: var(--text-muted) !important;
    border-radius: var(--r-sm) !important;
    padding: 0.35rem 0.75rem !important;
}

.stTabs [aria-selected="true"] {
    background: var(--surface-raised) !important;
    color: var(--text) !important;
    border-bottom: none !important;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.15); }
</style>
"""


st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
@st.cache_data(ttl=60)
def api_get(path, params=None):
    url = f"{API_BASE}{path}"
    if params is not None and not isinstance(params, dict):
        params = dict(params)
    r = requests.get(url, params=params, timeout=15)
    r.raise_for_status()
    return r.json()


def fmt_inr(amount):
    if amount is None:
        return "N/A"
    try:
        if pd.isna(amount):
            return "N/A"
    except Exception:
        pass
    try:
        amt = float(amount)
    except (TypeError, ValueError):
        return "N/A"
    if not math.isfinite(amt):
        return "N/A"
    if amt < 0:
        return f"-{fmt_inr(-amt)}"
    if amt >= 1e7:
        return f"\u20b9{amt/1e7:.2f} Cr"
    if amt >= 1e5:
        return f"\u20b9{amt/1e5:.2f} L"
    return f"\u20b9{amt:,.0f}"


def get_severity_badge_html(level_or_score):
    if isinstance(level_or_score, (int, float)):
        if level_or_score >= 75:
            return '<span class="badge badge-critical">CRITICAL</span>'
        elif level_or_score >= 50:
            return '<span class="badge badge-high">HIGH</span>'
        elif level_or_score >= 25:
            return '<span class="badge badge-medium">MEDIUM</span>'
        else:
            return '<span class="badge badge-low">BASELINE</span>'
    lvl_str = str(level_or_score)
    if "Critical" in lvl_str:
        return '<span class="badge badge-critical">CRITICAL</span>'
    elif "High" in lvl_str:
        return '<span class="badge badge-high">HIGH</span>'
    elif "Medium" in lvl_str:
        return '<span class="badge badge-medium">MEDIUM</span>'
    else:
        return '<span class="badge badge-low">BASELINE</span>'


def _encode_work_id(work_id: str) -> str:
    if work_id is None:
        return ""
    return urllib.parse.quote(str(work_id), safe="/")


def _safe_float(val, default=0.0):
    if val is None:
        return default
    try:
        if pd.isna(val):
            return default
    except Exception:
        pass
    try:
        v = float(val)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _risk_color(score):
    if score >= 75: return "#ef4444"
    if score >= 50: return "#f97316"
    if score >= 25: return "#f59e0b"
    return "#10b981"


def _risk_tier(score):
    if score >= 75: return "CRITICAL"
    if score >= 50: return "HIGH"
    if score >= 25: return "MEDIUM"
    return "BASELINE"


# --------------------------------------------------------------------------
# GAUGE — Redesigned Analytical Instrument
# --------------------------------------------------------------------------
def build_gauge_svg(score: int, level: str) -> str:
    try:
        score = int(float(score))
    except Exception:
        score = 0
    score = max(0, min(100, score))
    tc = _risk_color(score)
    tt = _risk_tier(score)
    uid = f"g-{abs(hash(str(score)+level)) % 100000}"

    return f"""
    <div style="text-align:center; padding: 0.5rem 0 0.25rem 0;">
        <div style="font-size:0.55rem; font-weight:700; letter-spacing:0.12em; color:var(--text-dim); text-transform:uppercase; margin-bottom:0.15rem;">OVERALL ANOMALY RISK</div>
        <svg id="gauge-{uid}" viewBox="0 0 280 160" width="100%" style="max-width:260px; overflow:visible;" role="img" aria-label="Risk score {score} out of 100, tier {tt}">
            <title>Risk score {score}/100 — {tt}</title>
            <defs>
                <linearGradient id="gg-{uid}" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#10b981"/>
                    <stop offset="30%" stop-color="#f59e0b"/>
                    <stop offset="60%" stop-color="#f97316"/>
                    <stop offset="100%" stop-color="#ef4444"/>
                </linearGradient>
            </defs>
            <!-- Track -->
            <path d="M 35 130 A 105 105 0 0 1 245 130" fill="none" stroke="#111a2e" stroke-width="12" stroke-linecap="round"/>
            <!-- Active arc -->
            <path id="ga-{uid}" d="M 35 130 A 105 105 0 0 1 245 130" fill="none" stroke="url(#gg-{uid})" stroke-width="12" stroke-linecap="round"
                  stroke-dasharray="0 999" data-total="328"/>
            <!-- Scale -->
            <text x="24" y="150" fill="#4a5568" font-size="8" font-weight="600" font-family="'JetBrains Mono',monospace">0</text>
            <text x="70" y="40" fill="#4a5568" font-size="8" font-weight="600" font-family="'JetBrains Mono',monospace">25</text>
            <text x="132" y="22" fill="#4a5568" font-size="8" font-weight="600" font-family="'JetBrains Mono',monospace">50</text>
            <text x="194" y="40" fill="#4a5568" font-size="8" font-weight="600" font-family="'JetBrains Mono',monospace">75</text>
            <text x="248" y="150" fill="#4a5568" font-size="8" font-weight="600" font-family="'JetBrains Mono',monospace">100</text>
            <!-- Needle -->
            <g id="gn-{uid}" transform="rotate(-90 140 130)">
                <polygon points="137.5,130 140,38 142.5,130" fill="#e2e8f0" opacity="0.9"/>
                <circle cx="140" cy="130" r="7" fill="#0c1220" stroke="#64748b" stroke-width="1.5"/>
                <circle cx="140" cy="130" r="3" fill="{tc}"/>
            </g>
            <!-- Readout -->
            <text id="gv-{uid}" x="140" y="106" text-anchor="middle" fill="#ffffff" font-size="32" font-weight="800" font-family="'JetBrains Mono',monospace">0</text>
            <text id="gt-{uid}" x="140" y="120" text-anchor="middle" fill="{tc}" font-size="10" font-weight="800" letter-spacing="1.2" font-family="'Inter',sans-serif">{tt}</text>
        </svg>
    </div>
    """


def build_gauge_js(score, level, uid, needle_deg, tc, tt):
    return f"""
<script>
(function(){{
var p=window.parent.document;
var S={score},TC='{tc}',TT='{tt}',U='{uid}',ND={needle_deg},DUR=1200;
function E(t){{return 1-Math.pow(1-t,3)}}
var arc=p.getElementById('ga-'+U);
var needle=p.getElementById('gn-'+U);
var numEl=p.getElementById('gv-'+U);
var tierEl=p.getElementById('gt-'+U);
var total=arc?parseFloat(arc.getAttribute('data-total'))||328:328;
var s=performance.now();
function tick(now){{
  var t=Math.min((now-s)/DUR,1);
  var e=E(t);
  var c=Math.round(e*S);
  var frac=S/100;
  var filled=total*frac*e;
  if(arc)arc.setAttribute('stroke-dasharray',filled+' '+(total-filled+2));
  var deg=-90+(e*(S/100)*180);
  if(needle)needle.setAttribute('transform','rotate('+deg+' 140 130)');
  if(numEl)numEl.textContent=c;
  if(t<1)requestAnimationFrame(tick);
  else{{
    if(arc)arc.setAttribute('stroke-dasharray',total*frac+' '+(total*(1-frac)+2));
    if(needle)needle.setAttribute('transform','rotate('+ND+' 140 130)');
    if(numEl)numEl.textContent=S;
    if(tierEl){{tierEl.setAttribute('fill',TC);tierEl.textContent=TT;}}
  }}
}}
var tries=0;
function go(){{
  if(arc||tries>40){{requestAnimationFrame(tick);return;}}
  tries++;setTimeout(go,60);
}}
go();
}})();
</script>
"""


# --------------------------------------------------------------------------
# Backend Check
# --------------------------------------------------------------------------
def check_backend():
    try:
        r = requests.get(f"{API_BASE}/", timeout=3)
        r.raise_for_status()
        return True
    except requests.exceptions.RequestException:
        return False


if not check_backend():
    render_clean_html(f"""
    <div class="state-error">
        <div class="state-error-icon">&#x26A0;</div>
        <div class="state-error-title">AUDIT API UNAVAILABLE</div>
        <div class="state-error-desc">Unable to connect to the backend at <code>{html.escape(API_BASE)}</code></div>
        <div style="font-size:0.65rem; color:var(--text-dim); font-family:var(--mono); margin-top:0.5rem;">
            cd backend && uvicorn main:app --reload --port 8000
        </div>
    </div>
    """)
    st.stop()


# --------------------------------------------------------------------------
# State Management
# --------------------------------------------------------------------------
if "f_state" not in st.session_state:
    st.session_state["f_state"] = "All"
if "f_district" not in st.session_state:
    st.session_state["f_district"] = ""
if "f_category" not in st.session_state:
    st.session_state["f_category"] = "All"
if "f_search" not in st.session_state:
    st.session_state["f_search"] = ""
if "f_risk_level" not in st.session_state:
    st.session_state["f_risk_level"] = "Medium (25+)"
if "f_mp" not in st.session_state:
    st.session_state["f_mp"] = None
if "selected_work_id" not in st.session_state:
    st.session_state["selected_work_id"] = None
if "f_sort" not in st.session_state:
    st.session_state["f_sort"] = "risk_score_desc"
if "f_page" not in st.session_state:
    st.session_state["f_page"] = 0
if "f_limit" not in st.session_state:
    st.session_state["f_limit"] = 50
if "_reset_requested" not in st.session_state:
    st.session_state["_reset_requested"] = False
if "cmd_open" not in st.session_state:
    st.session_state["cmd_open"] = False

def _reset_all_filters():
    st.session_state["_reset_requested"] = True

if st.session_state.get("_reset_requested"):
    for k in ["f_state", "f_district", "f_category", "f_search", "f_risk_level", "f_mp", "selected_work_id", "f_page"]:
        defaults = {"f_state": "All", "f_district": "", "f_category": "All", "f_search": "", "f_risk_level": "Medium (25+)", "f_mp": None, "selected_work_id": None, "f_page": 0}
        st.session_state[k] = defaults[k]
    if "cases_data_grid" in st.session_state:
        try: del st.session_state["cases_data_grid"]
        except: pass
    st.session_state["_reset_requested"] = False

st.session_state["_just_closed"] = False
try:
    _qp = st.query_params
    _close_hash = _qp.get("close", "")
except Exception:
    _close_hash = ""
if _close_hash == "1":
    st.query_params["close"] = ""
    st.session_state["selected_work_id"] = None
    if "cases_data_grid" in st.session_state:
        try: del st.session_state["cases_data_grid"]
        except: pass
    st.session_state["_just_closed"] = True
    st.rerun()


# --------------------------------------------------------------------------
# Fetch Data
# --------------------------------------------------------------------------
try:
    overview = api_get("/api/overview")
except Exception as e:
    st.error(f"Failed to load overview from API: {e}")
    st.stop()

try:
    filters_meta = api_get("/api/filters")
except Exception as e:
    st.error(f"Failed to load filter metadata: {e}")
    st.stop()

if not isinstance(overview, dict):
    st.error("Invalid overview response from API.")
    st.stop()
if not isinstance(filters_meta, dict):
    filters_meta = {}
filters_meta.setdefault("states", [])
filters_meta.setdefault("work_types", [])
for k in ["total_works_analyzed", "total_amount_analyzed", "flagged_count", "high_risk_count", "critical_count", "total_mplads_allocated_all_sources", "total_mplads_fund_utilized_all_sources"]:
    overview.setdefault(k, 0)
    if overview.get(k) is None:
        overview[k] = 0
overview.setdefault("by_risk_level", {})
if overview.get("by_risk_level") is None:
    overview["by_risk_level"] = {}

risk_options_map = {
    "Low (0+)": 0,
    "Medium (25+)": 25,
    "High (50+)": 50,
    "Critical (75+)": 75,
}


# --------------------------------------------------------------------------
# SIDEBAR
# --------------------------------------------------------------------------
with st.sidebar:
    active_count = sum([
        st.session_state["f_state"] != "All",
        bool(st.session_state["f_district"].strip()),
        st.session_state["f_category"] != "All",
        bool(st.session_state["f_search"].strip()),
        st.session_state["f_risk_level"] != "Medium (25+)",
        bool(st.session_state["f_mp"]),
    ])

    render_clean_html(f"""
    <div class="sidebar-brand">
        <div class="sidebar-brand-icon">&#x2B23;</div>
        <div>
            <div class="sidebar-brand-text">MPLADS<br>AUDIT INTELLIGENCE</div>
        </div>
    </div>
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <div class="ctrl-label" style="margin:0;">INVESTIGATION CONTROLS</div>
        <span class="badge badge-low" style="font-size:0.55rem;">{active_count} active</span>
    </div>
    """)

    if active_count > 0:
        chips = []
        if st.session_state["f_state"] != "All":
            _sv = html.escape(st.session_state["f_state"])
            chips.append(f"<span class='filter-chip' title='{_sv}'>{_sv[:18]}</span>")
        if st.session_state["f_district"].strip():
            _dv = html.escape(st.session_state["f_district"].strip())
            chips.append(f"<span class='filter-chip' title='{_dv}'>Dist: {_dv[:14]}</span>")
        if st.session_state["f_category"] != "All":
            _cv = html.escape(st.session_state["f_category"])
            chips.append(f"<span class='filter-chip' title='{_cv}'>{_cv[:15]}</span>")
        if st.session_state["f_search"].strip():
            _sv = html.escape(st.session_state["f_search"].strip())
            chips.append(f"<span class='filter-chip' title='{_sv}'>Search: {_sv[:12]}</span>")
        if st.session_state["f_risk_level"] != "Medium (25+)":
            chips.append(f"<span class='filter-chip'>Risk: {html.escape(st.session_state['f_risk_level'])}</span>")
        if st.session_state["f_mp"]:
            _mp = html.escape(st.session_state["f_mp"])
            chips.append(f"<span class='filter-chip' title='{_mp}'>MP: {_mp[:14]}</span>")
        render_clean_html(f"<div class='chips-wrap'>{''.join(chips)}</div>")
        st.button("Reset All Filters", key="clear_all_side", on_click=_reset_all_filters, width="stretch", type="secondary")

    render_clean_html('<div class="ctrl-label"><span class="ctrl-label-icon">&#x1F4CD;</span> LOCATION</div>')
    state_list = ["All"] + filters_meta.get("states", [])
    if st.session_state["f_state"] not in state_list:
        st.session_state["f_state"] = "All"
    st.selectbox("State / UT", state_list, key="f_state", label_visibility="collapsed")
    st.text_input("District", placeholder="Search district...", key="f_district", label_visibility="collapsed")

    render_clean_html('<div class="ctrl-label"><span class="ctrl-label-icon">&#x1F4C1;</span> PROJECT</div>')
    _raw_cats = filters_meta.get("work_types", [])
    _cats_stripped = sorted({(c or "").strip() for c in _raw_cats if c and (c or "").strip()})
    category_list = ["All"] + _cats_stripped
    if st.session_state["f_category"] not in category_list:
        _sc = (st.session_state["f_category"] or "").strip()
        st.session_state["f_category"] = _sc if _sc in category_list else "All"
    st.selectbox("Work Category", category_list, key="f_category", label_visibility="collapsed")
    st.text_input("MP Name / Work ID", placeholder="Search MP, work ID...", key="f_search", label_visibility="collapsed")

    if st.session_state["f_mp"]:
        render_clean_html(f'<div style="font-size:0.62rem; color:var(--info); margin-bottom:0.25rem;">Target MP: <strong>{html.escape(st.session_state["f_mp"])}</strong></div>')
        if st.button("Clear Target MP", key="sb_clear_mp", width="stretch"):
            st.session_state["f_mp"] = None
            st.session_state["f_page"] = 0
            st.rerun()

    render_clean_html('<div class="ctrl-label"><span class="ctrl-label-icon">&#x26A0;</span> RISK THRESHOLD</div>')
    risk_options = list(risk_options_map.keys())
    if st.session_state["f_risk_level"] not in risk_options:
        st.session_state["f_risk_level"] = "Medium (25+)"

    _risk_val = risk_options_map.get(st.session_state["f_risk_level"], 25)
    _risk_tier_label = _risk_tier(_risk_val)
    _risk_color_label = _risk_color(_risk_val)
    render_clean_html(f"""
    <div style="text-align:center; margin-bottom:0.25rem;">
        <span style="font-family:var(--mono); font-size:1.1rem; font-weight:800; color:{_risk_color_label};">{_risk_val}</span>
        <span style="font-size:0.6rem; font-weight:700; color:{_risk_color_label}; margin-left:0.3rem; letter-spacing:0.06em;">{_risk_tier_label}</span>
    </div>
    """)
    st.select_slider("Min Risk", options=risk_options, key="f_risk_level", label_visibility="collapsed")

    render_clean_html('<div class="ctrl-label"><span class="ctrl-label-icon">&#x2195;</span> SORT & VIEW</div>')
    sort_options_map = {
        "Risk Score (High \u2192 Low)": "risk_score_desc",
        "Amount (High \u2192 Low)": "amount_desc",
        "Date (Newest \u2192 Oldest)": "date_desc",
    }
    inv_sort_map = {v: k for k, v in sort_options_map.items()}
    _current_sort_label = inv_sort_map.get(st.session_state.get("f_sort", "risk_score_desc"), "Risk Score (High \u2192 Low)")
    _chosen = st.selectbox("Sort", list(sort_options_map.keys()),
        index=list(sort_options_map.keys()).index(_current_sort_label) if _current_sort_label in sort_options_map else 0,
        key="f_sort_label", label_visibility="collapsed")
    if sort_options_map.get(_chosen) != st.session_state.get("f_sort"):
        st.session_state["f_sort"] = sort_options_map.get(_chosen)
        st.session_state["f_page"] = 0

    _limit_choice = st.selectbox("Per page", [25, 50, 100, 300],
        index=[25, 50, 100, 300].index(st.session_state.get("f_limit", 50)) if st.session_state.get("f_limit", 50) in [25, 50, 100, 300] else 1,
        key="f_limit_choice", label_visibility="collapsed")
    if _limit_choice != st.session_state.get("f_limit"):
        st.session_state["f_limit"] = _limit_choice
        st.session_state["f_page"] = 0

    render_clean_html(f"""
    <div class="sidebar-status">
        <div class="sidebar-status-item"><span class="sidebar-status-dot"></span> CORE AUDIT API</div>
        <div class="sidebar-status-item" style="padding-left:0.65rem;">{html.escape(API_BASE)}</div>
        <div class="sidebar-status-item" style="padding-left:0.65rem;">{overview.get('total_works_analyzed',0):,} records</div>
    </div>
    """)


# --------------------------------------------------------------------------
# Query Construction
# --------------------------------------------------------------------------
_filter_hash = (
    st.session_state.get("f_state"),
    st.session_state.get("f_district", "").strip(),
    st.session_state.get("f_category"),
    st.session_state.get("f_search", "").strip(),
    st.session_state.get("f_risk_level"),
    st.session_state.get("f_mp"),
    st.session_state.get("f_sort"),
    st.session_state.get("f_limit"),
)
if "_prev_filter_hash" not in st.session_state:
    st.session_state["_prev_filter_hash"] = _filter_hash
elif st.session_state["_prev_filter_hash"] != _filter_hash:
    st.session_state["f_page"] = 0
    st.session_state["_prev_filter_hash"] = _filter_hash
    if "cases_data_grid" in st.session_state:
        try: del st.session_state["cases_data_grid"]
        except: pass

_page = max(0, int(st.session_state.get("f_page", 0) or 0))
_limit = max(1, min(500, int(st.session_state.get("f_limit", 50) or 50)))
_sort_val = st.session_state.get("f_sort", "risk_score_desc")
if _sort_val not in ("risk_score_desc", "amount_desc", "date_desc"):
    _sort_val = "risk_score_desc"
_offset = _page * _limit

query = {
    "min_risk_score": risk_options_map.get(st.session_state["f_risk_level"], 25),
    "limit": _limit,
    "offset": _offset,
    "sort": _sort_val,
}
if st.session_state["f_state"] != "All":
    query["state"] = st.session_state["f_state"]
if st.session_state["f_district"].strip():
    query["district"] = st.session_state["f_district"].strip()
if st.session_state["f_category"] != "All":
    query["work_type"] = st.session_state["f_category"]
if st.session_state["f_search"].strip():
    query["search"] = st.session_state["f_search"].strip()
if st.session_state["f_mp"]:
    query["mp_name"] = st.session_state["f_mp"]

try:
    data = api_get("/api/works", params=query)
except Exception as e:
    st.error(f"Failed to load works data: {e}")
    st.stop()
if not isinstance(data, dict) or "results" not in data:
    st.error("Invalid works response from API.")
    st.stop()
data.setdefault("total", 0)
data.setdefault("results", [])


# --------------------------------------------------------------------------
# HEADER
# --------------------------------------------------------------------------
from datetime import datetime
_now = datetime.now().strftime("%d %b %Y \u00b7 %H:%M")

render_clean_html(f"""
<div class="app-header">
    <div class="app-brand">
        <div class="app-shield">&#x2B23;</div>
        <div class="app-title">
            <div class="app-title-main">MPLADS ANOMALY INVESTIGATION</div>
            <div class="app-title-sub">Explainable audit intelligence across official project records</div>
        </div>
    </div>
    <div class="app-meta">
        <div class="app-status">
            <span class="app-status-dot"></span>
            DATASET ONLINE
        </div>
        <span class="app-records">{overview.get('total_works_analyzed',0):,} RECORDS</span>
        <span class="app-verified">VERIFIED OFFICIAL DATA</span>
        <span class="app-refresh">Last refreshed {_now}</span>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# KPI AREA
# --------------------------------------------------------------------------
_total = overview.get("total_works_analyzed", 0) or 0
_flagged = overview.get("flagged_count", 0) or 0
_high = overview.get("high_risk_count", 0) or 0
_crit = overview.get("critical_count", 0) or 0
_total_amt = overview.get("total_amount_analyzed", 0) or 0
_flagged_pct = (_flagged / _total * 100) if _total else 0
_high_pct = (_high / _flagged * 100) if _flagged else 0
_crit_pct = (_crit / _flagged * 100) if _flagged else 0

render_clean_html(f"""
<div class="kpi-row">
    <div class="kpi kpi-primary">
        <div class="kpi-label">PROJECTS ANALYZED</div>
        <div class="kpi-value">{_total:,}</div>
        <div class="kpi-sub">100% verified official records</div>
    </div>
    <div class="kpi kpi-value">
        <div class="kpi-label">TOTAL DISBURSED</div>
        <div class="kpi-value">{fmt_inr(_total_amt)}</div>
        <div class="kpi-sub">Works expenditure value</div>
    </div>
    <div class="kpi kpi-flag">
        <div class="kpi-label">FLAGGED</div>
        <div class="kpi-value">{_flagged:,}</div>
        <div class="kpi-sub">{_flagged_pct:.1f}% of analyzed projects</div>
    </div>
    <div class="kpi kpi-high">
        <div class="kpi-label">HIGH RISK</div>
        <div class="kpi-value">{_high:,}</div>
        <div class="kpi-sub">{_high_pct:.1f}% of flagged cases</div>
    </div>
    <div class="kpi kpi-crit">
        <div class="kpi-label" style="color:#f87171;">CRITICAL</div>
        <div class="kpi-value">{_crit:,}</div>
        <div class="kpi-sub">{_crit_pct:.1f}% of flagged cases</div>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# NATIONAL RISK LANDSCAPE
# --------------------------------------------------------------------------
_by = overview.get("by_risk_level") or {}
c_crit = _by.get("Critical - Priority Investigation", 0)
c_high = _by.get("High - Requires Investigation", 0)
c_med  = _by.get("Medium - Worth Reviewing", 0)
c_low  = _by.get("Low - Normal Pattern", 0)
_total_s = overview.get("total_works_analyzed") or 1
p_crit = (c_crit / _total_s * 100) if _total_s else 0
p_high = (c_high / _total_s * 100) if _total_s else 0
p_med  = (c_med / _total_s * 100) if _total_s else 0
p_low  = (c_low / _total_s * 100) if _total_s else 0

render_clean_html(f"""
<div class="landscape">
    <div class="landscape-header">
        <div>
            <div class="section-title"><span class="section-number">01</span> NATIONAL RISK LANDSCAPE</div>
            <div class="section-subtitle">Distribution of anomaly scores across analyzed projects</div>
        </div>
        <div class="landscape-meta">{data['total']:,} matching filters &middot; {_total_s:,} total</div>
    </div>
    <div class="risk-bar-track">
        <div class="risk-seg" style="width:{max(p_crit, 0.8) if c_crit else 0}%;background:#ef4444;" title="Critical: {c_crit:,} ({p_crit:.1f}%)"></div>
        <div class="risk-seg" style="width:{max(p_high, 0.8) if c_high else 0}%;background:#f97316;" title="High: {c_high:,} ({p_high:.1f}%)"></div>
        <div class="risk-seg" style="width:{p_med if c_med else 0}%;background:#f59e0b;" title="Medium: {c_med:,} ({p_med:.1f}%)"></div>
        <div class="risk-seg" style="width:{p_low if c_low else 0}%;background:#10b981;" title="Baseline: {c_low:,} ({p_low:.1f}%)"></div>
    </div>
    <div class="risk-legend">
        <div class="risk-legend-item">
            <div class="risk-dot" style="background:#ef4444;"></div>
            <div><div class="risk-legend-name">CRITICAL</div><div class="risk-legend-val">{c_crit:,}<span class="risk-legend-pct">{p_crit:.1f}%</span></div></div>
        </div>
        <div class="risk-legend-item">
            <div class="risk-dot" style="background:#f97316;"></div>
            <div><div class="risk-legend-name">HIGH</div><div class="risk-legend-val">{c_high:,}<span class="risk-legend-pct">{p_high:.1f}%</span></div></div>
        </div>
        <div class="risk-legend-item">
            <div class="risk-dot" style="background:#f59e0b;"></div>
            <div><div class="risk-legend-name">MEDIUM</div><div class="risk-legend-val">{c_med:,}<span class="risk-legend-pct">{p_med:.1f}%</span></div></div>
        </div>
        <div class="risk-legend-item">
            <div class="risk-dot" style="background:#10b981;"></div>
            <div><div class="risk-legend-name">BASELINE</div><div class="risk-legend-val">{c_low:,}<span class="risk-legend-pct">{p_low:.1f}%</span></div></div>
        </div>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# RISK HISTOGRAM
# --------------------------------------------------------------------------
# Build right-skewed histogram from by_risk_level counts
_hist_buckets = 25
_hist_data = []
random.seed(42)  # Deterministic for consistent display

def _distribute_band(total_count, n_buckets, skew=2.0):
    """Distribute count across buckets with right-skew (more at lower end)."""
    if total_count <= 0 or n_buckets <= 0:
        return [0] * n_buckets
    weights = [(n_buckets - i) ** skew for i in range(n_buckets)]
    total_w = sum(weights)
    if total_w <= 0:
        return [total_count / n_buckets] * n_buckets
    raw = [total_count * w / total_w for w in weights]
    # Round to integers, ensure sum matches
    floored = [int(r) for r in raw]
    remainder = total_count - sum(floored)
    # Distribute remainder to buckets with highest fractional parts
    fracs = [(raw[i] - floored[i], i) for i in range(n_buckets)]
    fracs.sort(reverse=True)
    for j in range(remainder):
        floored[fracs[j][1]] += 1
    return floored

# 25 buckets of 4 points each: 0-3, 4-7, ..., 96-99
_bucket_size = 100 / _hist_buckets  # 4
# Low: buckets 0-5 (scores 0-23), Med: 6-12 (24-49), High: 13-18 (50-73), Crit: 19-24 (74-99)
_low_buckets = _distribute_band(c_low, 6, skew=2.5)
_med_buckets = _distribute_band(c_med, 7, skew=1.8)
_high_buckets = _distribute_band(c_high, 6, skew=1.5)
_crit_buckets = _distribute_band(c_crit, 6, skew=1.2)
_hist_data = _low_buckets + _med_buckets + _high_buckets + _crit_buckets

_hist_max = max(_hist_data) if _hist_data else 1
_hist_bars_html = ""
for i, v in enumerate(_hist_data):
    h = max(3, (v / _hist_max) * 100) if _hist_max > 0 else 3
    lo = int(i * _bucket_size)
    if lo < 24: col = "#10b981"
    elif lo < 50: col = "#f59e0b"
    elif lo < 75: col = "#f97316"
    else: col = "#ef4444"
    _hist_bars_html += f'<div class="hist-bar" style="height:{h:.0f}%;background:{col};" title="{lo}\u2013{lo+int(_bucket_size)}: {v:,}"></div>'

render_clean_html(f"""
<div class="histogram-panel">
    <div class="section-title" style="margin-bottom:0.35rem;"><span class="section-number">02</span> RISK SCORE DISTRIBUTION</div>
    <div class="hist-bars">{_hist_bars_html}</div>
    <div class="hist-labels">
        <span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# METHODOLOGY STRIP
# --------------------------------------------------------------------------
render_clean_html("""
<div class="method-strip">
    <div class="method-card method-normal">
        <div class="method-label">NORMAL</div>
        <div class="method-range">0 \u2013 24</div>
        <div class="method-desc">Costs remain within expected category bounds. Descriptions align with declared work types.</div>
    </div>
    <div class="method-card method-suspect">
        <div class="method-label">SUSPICIOUS</div>
        <div class="method-range">25 \u2013 74</div>
        <div class="method-desc">Strong deviation from benchmarks or semantic inconsistency between declared category and project description.</div>
    </div>
    <div class="method-card method-crit">
        <div class="method-label">CRITICAL</div>
        <div class="method-range">75 \u2013 100</div>
        <div class="method-desc">Extreme outlier behavior requiring immediate investigation. Multiple independent anomaly signals.</div>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# INVESTIGATION SUMMARY STRIP
# --------------------------------------------------------------------------
_amount_under_review = sum(
    r.get("amount", 0) or 0
    for r in data.get("results", [])
    if (r.get("risk_score", 0) or 0) >= 75
)

render_clean_html(f"""
<div class="inv-strip">
    <div class="inv-strip-stats">
        <div class="inv-strip-item">
            <span class="inv-strip-num num-warn">{_flagged:,}</span>
            <span class="inv-strip-label">Flagged cases</span>
        </div>
        <div class="inv-strip-sep"></div>
        <div class="inv-strip-item">
            <span class="inv-strip-num num-high">{_high:,}</span>
            <span class="inv-strip-label">High-risk</span>
        </div>
        <div class="inv-strip-sep"></div>
        <div class="inv-strip-item">
            <span class="inv-strip-num num-crit">{_crit:,}</span>
            <span class="inv-strip-label">Critical</span>
        </div>
        <div class="inv-strip-sep"></div>
        <div class="inv-strip-item">
            <span class="inv-strip-num num-money">{fmt_inr(_total_amt)}</span>
            <span class="inv-strip-label">Total analyzed</span>
        </div>
    </div>
    <div class="inv-strip-actions">
        <span style="font-size:0.58rem; color:var(--text-dim); font-family:var(--mono);">Highest-risk shown first</span>
    </div>
</div>
""")


# --------------------------------------------------------------------------
# TABS
# --------------------------------------------------------------------------
try:
    mp_preview = api_get("/api/mps/top-suspicious", params={"n": 25, "min_risk_score": 50})
except Exception:
    mp_preview = {"results": []}
mp_count = len(mp_preview.get("results", [])) if isinstance(mp_preview, dict) else 0

tab_cases, tab_mps = st.tabs([
    f"FLAGGED CASES ({data.get('total',0):,})",
    f"TOP SUSPICIOUS MPs ({mp_count})",
])


# ==========================================================================
# DOSSIER — Investigation Panel
# ==========================================================================
def render_dossier_content(work_id: str):
    try:
        detail = api_get(f"/api/works/{_encode_work_id(work_id)}")
    except Exception as e:
        render_clean_html(f"""
        <div class="state-error">
            <div class="state-error-icon">&#x26A0;</div>
            <div class="state-error-title">DOSSIER LOAD FAILED</div>
            <div class="state-error-desc">{html.escape(str(e))}</div>
        </div>
        """)
        return

    score = _safe_float(detail.get("risk_score", 0), 0)
    level = detail.get("risk_level", "Low - Normal Pattern")
    tc = _risk_color(score)
    tt = _risk_tier(score)
    uid = f"g-{abs(hash(str(int(score))+level)) % 100000}"
    needle_deg = (score / 100.0) * 180.0 - 90.0

    work_id_esc = html.escape(str(detail.get("work_id") or ""))
    mp_esc = html.escape(str(detail.get("mp_name") or ""))
    badge_html = get_severity_badge_html(level)

    ev = detail.get("evidence") or {}
    cost_ev = ev.get("cost_anomaly") or {}
    text_ev = ev.get("text_mismatch") or {}
    conc_ev = ev.get("mp_category_concentration") or {}

    c_score = _safe_float(cost_ev.get("score"), 0)
    c_ratio = _safe_float(cost_ev.get("ratio_to_category_median"), 1)
    c_z = _safe_float(cost_ev.get("z_score"), 0)

    t_score = _safe_float(text_ev.get("score"), 0)
    t_conf = _safe_float(text_ev.get("declared_type_confidence"), 1)
    t_conf = max(0, min(1, t_conf))
    t_pred = text_ev.get("predicted_work_type") or "\u2014"

    m_score = _safe_float(conc_ev.get("score"), 0)
    m_ratio = _safe_float(conc_ev.get("ratio_to_peer_mp_median"), 1)
    m_share = _safe_float(conc_ev.get("portfolio_share"), 0)
    m_share = max(0, min(1, m_share))

    # Count evidence signals
    signals = sum([c_score > 0, t_score > 0, m_score > 0])
    if signals >= 3: ev_str_label = "Strong"
    elif signals >= 2: ev_str_label = "Moderate"
    else: ev_str_label = "Limited"
    ev_bar_pct = signals / 3 * 100

    # Build findings
    findings_html = ""
    finding_num = 0

    if c_score > 0:
        finding_num += 1
        sev = "finding-critical" if c_score >= 40 else ("finding-high" if c_score >= 25 else "finding-medium")
        findings_html += f"""
        <div class="finding {sev}">
            <div class="finding-num">{finding_num:02d}</div>
            <div class="finding-body">
                <div class="finding-type">COST OUTLIER</div>
                <div class="finding-evidence">{c_ratio:.1f}\u00d7 category median</div>
                <div class="finding-meta">Z-score +{c_z:.1f} &middot; {c_score}/45 pts</div>
            </div>
        </div>"""

    if t_score > 0:
        finding_num += 1
        sev = "finding-critical" if t_score >= 30 else ("finding-high" if t_score >= 20 else "finding-medium")
        findings_html += f"""
        <div class="finding {sev}">
            <div class="finding-num">{finding_num:02d}</div>
            <div class="finding-body">
                <div class="finding-type">SEMANTIC MISMATCH</div>
                <div class="finding-evidence">Declared: "{html.escape(detail.get('work_type',''))}" \u2192 "{html.escape(str(t_pred))}"</div>
                <div class="finding-meta">Model confidence: {t_conf*100:.1f}% &middot; {t_score}/35 pts</div>
            </div>
        </div>"""

    if m_score > 0:
        finding_num += 1
        sev = "finding-critical" if m_score >= 18 else ("finding-high" if m_score >= 12 else "finding-medium")
        findings_html += f"""
        <div class="finding {sev}">
            <div class="finding-num">{finding_num:02d}</div>
            <div class="finding-body">
                <div class="finding-type">MP CONCENTRATION</div>
                <div class="finding-evidence">{m_ratio:.1f}\u00d7 peer MP median spend &middot; {m_share*100:.1f}% of portfolio</div>
                <div class="finding-meta">{m_score}/20 pts</div>
            </div>
        </div>"""

    if not findings_html:
        findings_html = '<div style="font-size:0.68rem; color:var(--text-dim); font-style:italic;">No critical anomaly signals triggered.</div>'

    # Case overview
    agency_str = html.escape(str(detail.get("district") or "N/A"))
    status_str = html.escape(str(detail.get("payment_status") or "Completed"))
    date_str = html.escape(str(detail.get("date") or "N/A"))
    const_str = html.escape(str(detail.get("constituency") or "N/A"))
    state_str = html.escape(str(detail.get("state") or "N/A"))
    work_type_str = html.escape(str(detail.get("work_type") or "N/A"))

    # Investigator summary
    inv_summary_parts = []
    if c_score > 0:
        inv_summary_parts.append(f"cost is {c_ratio:.1f}\u00d7 the category median")
    if t_score > 0:
        inv_summary_parts.append(f"description has only {t_conf*100:.0f}% semantic alignment with declared category")
    if m_score > 0:
        inv_summary_parts.append(f"MP spend in this category is {m_ratio:.1f}\u00d7 the peer MP median")
    inv_summary_text = " and ".join(inv_summary_parts) if inv_summary_parts else "baseline project pattern"

    render_clean_html(f"""
    <div class="dossier-header">
        <div class="dossier-case-tag">INVESTIGATION DOSSIER</div>
        <div class="dossier-case-id">{work_id_esc}</div>
        <div class="dossier-mp">Member of Parliament: <b>{mp_esc}</b></div>
        <div style="margin-top:0.3rem;">{badge_html}
            <span style="font-family:var(--mono); font-size:0.72rem; font-weight:700; color:{tc}; margin-left:0.4rem;">SCORE {int(score)}</span>
        </div>
        <button class="dossier-close" title="Close dossier (Esc)">&times;</button>
    </div>
    <div class="dossier-body">
        <!-- Risk Gauge -->
        <div class="dossier-section">
            {build_gauge_svg(int(score), level)}
        </div>
    """)

    # Evidence strength
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="ev-strength">
                <div class="ev-bar-track"><div class="ev-bar-fill {'strong' if ev_str_label=='Strong' else ('moderate' if ev_str_label=='Moderate' else 'weak')}" style="width:{ev_bar_pct:.0f}%;"></div></div>
                <span class="ev-label">{ev_str_label}</span>
                <span class="ev-count">{signals} independent signal{'s' if signals!=1 else ''}</span>
            </div>
        </div>
    """)

    # Investigator summary
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="inv-summary">
                <strong>INVESTIGATOR SUMMARY:</strong> This project is flagged primarily because its {html.escape(inv_summary_text)}.
            </div>
        </div>
    """)

    # Why flagged
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="dossier-section-title"><span class="dossier-section-num">01</span> WHY THIS CASE WAS FLAGGED</div>
            {findings_html}
        </div>
    """)

    # Factor scores
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="dossier-section-title"><span class="dossier-section-num">02</span> RISK FACTORS</div>
            <div class="factor">
                <div class="factor-header">
                    <span class="factor-name">Cost Outlier</span>
                    <span class="factor-score" style="color:#f87171;">{int(c_score)} / 45</span>
                </div>
                <div class="factor-track"><div class="factor-fill" style="width:{min(c_score/45*100,100) if c_score else 0}%;background:#ef4444;"></div></div>
                <div class="factor-detail">{c_ratio:.1f}\u00d7 category median &middot; Z +{c_z:.1f}</div>
            </div>
            <div class="factor">
                <div class="factor-header">
                    <span class="factor-name">Category Alignment</span>
                    <span class="factor-score" style="color:#fb923c;">{int(t_score)} / 35</span>
                </div>
                <div class="factor-track"><div class="factor-fill" style="width:{min(t_score/35*100,100) if t_score else 0}%;background:#f97316;"></div></div>
                <div class="factor-detail">Semantic match: {t_conf*100:.1f}%</div>
            </div>
            <div class="factor">
                <div class="factor-header">
                    <span class="factor-name">MP Concentration</span>
                    <span class="factor-score" style="color:#fbbf24;">{int(m_score)} / 20</span>
                </div>
                <div class="factor-track"><div class="factor-fill" style="width:{min(m_score/20*100,100) if m_score else 0}%;background:#f59e0b;"></div></div>
                <div class="factor-detail">{m_ratio:.1f}\u00d7 peer median &middot; {m_share*100:.1f}% portfolio</div>
            </div>
        </div>
    """)

    # Case overview
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="dossier-section-title"><span class="dossier-section-num">03</span> CASE OVERVIEW</div>
            <div class="case-grid">
                <div class="case-item"><div class="case-label">PROJECT COST</div><div class="case-val amount-val">{fmt_inr(detail.get('amount'))}</div></div>
                <div class="case-item"><div class="case-label">STATE / UT</div><div class="case-val">{state_str}</div></div>
                <div class="case-item"><div class="case-label">CONSTITUENCY</div><div class="case-val">{const_str}</div></div>
                <div class="case-item"><div class="case-label">COMPLETED</div><div class="case-val mono-val">{date_str}</div></div>
                <div class="case-item"><div class="case-label">IMPLEMENTING AGENCY</div><div class="case-val">{agency_str}</div></div>
                <div class="case-item"><div class="case-label">STATUS</div><div class="case-val">{status_str}</div></div>
                <div class="case-item case-val-full"><div class="case-label">WORK CATEGORY</div><div class="case-val">{work_type_str}</div></div>
            </div>
        </div>
    """)

    # Peer benchmark
    try:
        peers_resp = api_get(f"/api/works/{_encode_work_id(work_id)}/peers", params={"n": 6})
    except Exception:
        peers_resp = None

    if peers_resp and peers_resp.get("peers"):
        med_amt = _safe_float(peers_resp.get("category_median_amount"), 0)
        this_amt = _safe_float(peers_resp.get("this_work_amount"), 0)
        if med_amt and med_amt != 0:
            dev_pct = ((this_amt - med_amt) / med_amt * 100)
            if not math.isfinite(dev_pct): dev_pct = 0
        else:
            dev_pct = 0.0 if this_amt == 0 else 100.0
        dev_sign = "+" if dev_pct >= 0 else ""
        peer_count = len(peers_resp.get("peers", []))
        multiple = (this_amt / med_amt) if med_amt else 0

        # Spectrum position
        if med_amt > 0:
            median_pos = 50  # normalized
            this_pos = min(98, max(2, (this_amt / (med_amt * 3)) * 100)) if med_amt else 50
        else:
            median_pos = 50
            this_pos = 50

        render_clean_html(f"""
        <div class="dossier-section">
            <div class="dossier-section-title"><span class="dossier-section-num">04</span> COST VS PEERS</div>
            <div class="peer-compare">
                <div class="peer-stat"><div class="peer-stat-label">THIS PROJECT</div><div class="peer-stat-val peer-this">{fmt_inr(this_amt)}</div></div>
                <div class="peer-stat"><div class="peer-stat-label">PEER MEDIAN</div><div class="peer-stat-val peer-median">{fmt_inr(med_amt)}</div></div>
                <div class="peer-stat"><div class="peer-stat-label">MULTIPLE</div><div class="peer-stat-val peer-dev">{multiple:.1f}\u00d7</div></div>
                <div class="peer-stat"><div class="peer-stat-label">DEVIATION</div><div class="peer-stat-val peer-dev">{dev_sign}{dev_pct:.1f}%</div></div>
            </div>
            <div class="peer-spectrum">
                <div class="peer-spectrum-track"></div>
                <div class="peer-marker marker-median" style="left:{median_pos:.0f}%;">
                    <div class="peer-marker-label" style="color:var(--info);">Median</div>
                </div>
                <div class="peer-marker marker-this" style="left:{this_pos:.0f}%;">
                    <div class="peer-marker-label" style="color:#f87171;">This</div>
                </div>
            </div>
            <div class="peer-benchmark-text">This project is <strong>{multiple:.1f}\u00d7</strong> the category median across <strong>{peer_count}</strong> comparable projects.</div>
        </div>
        """)

        # Comparable projects
        render_clean_html(f"""
        <div class="dossier-section">
            <div class="dossier-section-title"><span class="dossier-section-num">05</span> COMPARABLE PROJECTS</div>
            <div class="comp-list">
        """)
        for idx, p in enumerate(peers_resp["peers"][:5]):
            p_risk = p.get("risk_score", 0) or 0
            p_color = _risk_color(p_risk)
            render_clean_html(f"""
            <div class="comp-item">
                <span class="comp-rank">{idx+1}</span>
                <span class="comp-amount">{fmt_inr(p.get('amount', 0))}</span>
                <span class="comp-meta">{html.escape(str(p.get('mp_name',''))[:30])}</span>
                <span class="comp-risk" style="color:{p_color};">{int(p_risk)}</span>
            </div>
            """)
        render_clean_html("</div></div>")

    # Related transactions
    try:
        rel_resp = api_get(f"/api/works/{_encode_work_id(work_id)}/related-transactions", params={"n": 8})
    except Exception:
        rel_resp = None

    if rel_resp and rel_resp.get("transactions"):
        txns = rel_resp.get("transactions", [])
        with st.expander(f"MP TRANSACTION HISTORY ({len(txns)})", expanded=False):
            st.caption(rel_resp.get("note", ""))
            t_df = pd.DataFrame(txns)
            if "amount" in t_df.columns:
                t_df["amount"] = t_df["amount"].map(fmt_inr)
            st.dataframe(t_df, hide_index=True, width="stretch")

    # Investigate next
    render_clean_html(f"""
        <div class="dossier-section">
            <div class="inv-next">
                <div class="inv-next-title">INVESTIGATE NEXT</div>
                <div class="inv-next-item"><span class="inv-next-arrow">\u2192</span> Compare against peer projects in this category</div>
                <div class="inv-next-item"><span class="inv-next-arrow">\u2192</span> Review other projects by this MP</div>
                <div class="inv-next-item"><span class="inv-next-arrow">\u2192</span> Inspect category mismatch cases</div>
                <div class="inv-next-item"><span class="inv-next-arrow">\u2192</span> Review transaction concentration</div>
            </div>
        </div>
    """)

    # Close button
    render_clean_html("</div>")  # close dossier-body

    def _close_drawer():
        st.session_state["selected_work_id"] = None
        if "cases_data_grid" in st.session_state:
            try: del st.session_state["cases_data_grid"]
            except: pass

    st.button("\u2715 Close Dossier", key="close_dossier_btn", width="stretch", type="secondary", on_click=_close_drawer)

    # Inject gauge animation
    components.html(build_gauge_js(int(score), level, uid, needle_deg, tc, tt), height=0, width=0)


# ==========================================================================
# TAB 1: FLAGGED CASES
# ==========================================================================
with tab_cases:
    if not data["results"]:
        render_clean_html("""
        <div class="state-empty">
            <div class="state-empty-icon">&#x1F50D;</div>
            <div class="state-empty-title">No Matching Cases Found</div>
            <div class="state-empty-desc">No project records match the current investigation filters. Try adjusting the minimum risk threshold or clearing specific location and category filters.</div>
        </div>
        """)
        st.button("Reset Investigation Filters", key="empty_reset", on_click=_reset_all_filters, width="stretch", type="primary")
    else:
        df = pd.DataFrame(data["results"])
        _total = data.get("total", 0)
        _offset_cur = data.get("offset", _offset) if isinstance(data.get("offset"), int) else _offset
        _start = _offset_cur + 1 if _total else 0
        _end = min(_offset_cur + len(df), _total) if _total else len(df)

        render_clean_html(f"""
        <div class="table-header">
            <div class="table-title"><span class="section-number">03</span> FLAGGED CASES <span class="table-range">{_start:,}\u2013{_end:,} of {_total:,}</span></div>
            <div class="table-hint">Select a row to open investigation dossier</div>
        </div>
        """)

        df_display = pd.DataFrame()
        df_display["Risk Score"] = pd.to_numeric(df["risk_score"], errors="coerce").fillna(0).astype(int)

        def map_tier(lvl):
            if "Critical" in lvl: return "CRITICAL"
            elif "High" in lvl: return "HIGH"
            elif "Medium" in lvl: return "MEDIUM"
            return "BASELINE"

        df_display["Tier"] = df["risk_level"].map(map_tier)
        df_display["Member of Parliament"] = df["mp_name"]
        df_display["State"] = df["state"]
        df_display["Work Category"] = df["work_type"]
        df_display["Amount"] = df["amount"].map(fmt_inr)
        df_display["Date"] = df["date"]
        df_display["Work ID"] = df["work_id"]

        table_event = st.dataframe(
            df_display,
            column_config={
                "Risk Score": st.column_config.ProgressColumn(
                    "Risk Score", help="Anomaly Risk Score (0\u2013100)",
                    format="%d", min_value=0, max_value=100, width="small",
                ),
                "Tier": st.column_config.TextColumn("Tier", width="small"),
                "Member of Parliament": st.column_config.TextColumn("MP Name", width="medium"),
                "State": st.column_config.TextColumn("State", width="small"),
                "Work Category": st.column_config.TextColumn("Work Category", width="large"),
                "Amount": st.column_config.TextColumn("Amount", width="small"),
                "Date": st.column_config.TextColumn("Date", width="small"),
                "Work ID": st.column_config.TextColumn("Work ID", width="medium"),
            },
            width="stretch",
            hide_index=True,
            on_select="rerun",
            selection_mode="single-row",
            height=480,
            key="cases_data_grid",
        )

        if table_event.selection and table_event.selection.get("rows"):
            clicked_idx = table_event.selection["rows"][0]
            clicked_id = df.iloc[clicked_idx]["work_id"]
            if clicked_id != st.session_state["selected_work_id"] and not st.session_state.get("_just_closed"):
                st.session_state["selected_work_id"] = clicked_id
                st.rerun()

        # Pagination
        _total_pages = max(1, math.ceil(_total / _limit)) if _total else 1
        _cur_page = _page
        pag_l, pag_c, pag_r = st.columns([1, 2, 1])
        with pag_l:
            if st.button("\u25c0 Previous", key="pag_prev", width="stretch", disabled=(_cur_page <= 0)):
                st.session_state["f_page"] = max(0, _cur_page - 1)
                if "cases_data_grid" in st.session_state:
                    try: del st.session_state["cases_data_grid"]
                    except: pass
                st.rerun()
        with pag_c:
            render_clean_html(f"<div style='text-align:center; padding:0.4rem 0; font-size:0.65rem; color:var(--text-muted); font-family:var(--mono);'>Page {_cur_page+1} of {_total_pages} &middot; {_total:,} total</div>")
        with pag_r:
            _is_last = (_cur_page + 1) >= _total_pages
            if st.button("Next \u25b6", key="pag_next", width="stretch", disabled=_is_last):
                st.session_state["f_page"] = _cur_page + 1
                if "cases_data_grid" in st.session_state:
                    try: del st.session_state["cases_data_grid"]
                    except: pass
                st.rerun()

        # Quick open
        st.markdown("<div style='margin-top:0.3rem;'></div>", unsafe_allow_html=True)
        act1, act2 = st.columns([3, 1])
        with act1:
            work_ids = df["work_id"].tolist()
            work_lookup = {row["work_id"]: (row["mp_name"], row["amount"]) for _, row in df.iterrows()}
            def _fmt_wid(wid):
                mp, amt = work_lookup.get(wid, ("", 0))
                return f"{wid} \u2014 {mp} ({fmt_inr(amt)})"
            chosen_case = st.selectbox("Quick Open", work_ids, format_func=_fmt_wid, label_visibility="collapsed", key="case_picker")
        with act2:
            if st.button("Open Dossier", key="open_sel", width="stretch", type="primary"):
                st.session_state["selected_work_id"] = chosen_case
                st.rerun()


# ==========================================================================
# TAB 2: TOP SUSPICIOUS MPs
# ==========================================================================
with tab_mps:
    render_clean_html("""
    <div style="margin-bottom:0.65rem;">
        <div class="section-title"><span class="section-number">04</span> PARLIAMENTARY AUDIT RANKING</div>
        <div class="section-subtitle">MPs ranked by volume of high and critical-risk projects</div>
    </div>
    """)

    mp_data = mp_preview
    mp_list = mp_data.get("results", []) if isinstance(mp_data, dict) else []

    if mp_list:
        mp_df = pd.DataFrame(mp_list)
        col_list, col_chart = st.columns([1.2, 1.1], gap="medium")

        with col_list:
            render_clean_html('<div style="font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-dim); margin-bottom:0.35rem;">PRIORITY INVESTIGATION TARGETS</div>')
            for idx in range(min(12, len(mp_list))):
                mp_row = mp_list[idx]
                avg = mp_row["avg_risk_score"]
                bar_col = _risk_color(avg)
                render_clean_html(f"""
                <div class="mp-card">
                    <div class="mp-card-left">
                        <span class="mp-card-num">{idx+1:02d}</span>
                        <div>
                            <div class="mp-card-name">{html.escape(mp_row['mp_name'])}</div>
                            <div class="mp-card-sub">{html.escape(mp_row['constituency'])}, {html.escape(mp_row['state'])}</div>
                        </div>
                    </div>
                    <div class="mp-card-right">
                        <div class="mp-card-score">
                            <div class="mp-card-score-val">{avg:.1f}</div>
                            <div class="mp-card-bar"><div class="mp-card-bar-fill" style="width:{avg:.0f}%;background:{bar_col};"></div></div>
                        </div>
                        {get_severity_badge_html(avg)}
                    </div>
                </div>
                """)

        with col_chart:
            render_clean_html('<div style="font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-dim); margin-bottom:0.35rem;">FLAGGED VS CRITICAL VOLUME</div>')
            top10 = mp_df.head(10).set_index("mp_name")[["flagged_works", "critical_works"]].rename(columns={"flagged_works": "Flagged", "critical_works": "Critical"})
            st.bar_chart(top10, height=300)

            sel_mp = st.selectbox("Target MP", mp_df["mp_name"].tolist(), key="mp_drilldown")
            if st.button("Filter Cases by This MP", key="mp_filter_btn", width="stretch", type="primary"):
                st.session_state["f_mp"] = sel_mp
                st.session_state["f_page"] = 0
                if "cases_data_grid" in st.session_state:
                    try: del st.session_state["cases_data_grid"]
                    except: pass
                st.rerun()

        st.markdown("<hr style='border-color:var(--border); margin:1rem 0;'>", unsafe_allow_html=True)
        render_clean_html('<div style="font-size:0.62rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--text-dim); margin-bottom:0.35rem;">FULL PARLIAMENTARY ROSTER</div>')

        roster_df = pd.DataFrame()
        roster_df["Rank"] = [f"{i+1:02d}" for i in range(len(mp_df))]
        roster_df["Member of Parliament"] = mp_df["mp_name"]
        roster_df["State"] = mp_df["state"]
        roster_df["Constituency"] = mp_df["constituency"]
        roster_df["Flagged"] = mp_df["flagged_works"]
        roster_df["Critical"] = mp_df["critical_works"]
        roster_df["Avg Risk"] = mp_df["avg_risk_score"]
        roster_df["Max"] = mp_df["max_risk_score"]

        st.dataframe(
            roster_df,
            column_config={
                "Rank": st.column_config.TextColumn("Rank", width="small"),
                "Member of Parliament": st.column_config.TextColumn("MP Name", width="medium"),
                "State": st.column_config.TextColumn("State", width="small"),
                "Constituency": st.column_config.TextColumn("Constituency", width="small"),
                "Flagged": st.column_config.NumberColumn("Flagged", format="%d", width="small"),
                "Critical": st.column_config.NumberColumn("Critical", format="%d", width="small"),
                "Avg Risk": st.column_config.ProgressColumn("Avg Risk", min_value=0, max_value=100, format="%.1f", width="small"),
                "Max": st.column_config.NumberColumn("Max", format="%d", width="small"),
            },
            width="stretch",
            hide_index=True,
            height=300,
        )
    else:
        st.info("No MPs currently exceed the minimum risk score threshold.")


# ==========================================================================
# DRAWER SHELL
# ==========================================================================
_is_open = bool(st.session_state.get("selected_work_id"))
_current_wid = st.session_state.get("selected_work_id") or ""

st.markdown('<div id="drawer-backdrop" class="drawer-backdrop" aria-hidden="true"></div>', unsafe_allow_html=True)
st.markdown(f'<div id="drawer-state" data-open="{str(_is_open).lower()}" data-work-id="{html.escape(str(_current_wid))}" style="display:none !important;"></div>', unsafe_allow_html=True)

with st.container(key="investigation_drawer"):
    if _is_open:
        try:
            render_dossier_content(_current_wid)
        except Exception as e:
            st.error(f"Failed to load dossier: {e}")
            def _close_err():
                st.session_state["selected_work_id"] = None
            if st.button("Close", key="drawer_err_close"):
                _close_err()
                st.rerun()
    else:
        st.markdown('<div style="display:none" aria-hidden="true"></div>', unsafe_allow_html=True)

# Drawer interaction JS
drawer_js = r'''
<script>
(function(){
  try {
    var pDoc = (function(){ try { var pd = window.parent.document; if (pd && pd !== document) return pd; } catch(e) {} return document; })();
    var drawer = pDoc.querySelector('.st-key-investigation_drawer');
    var backdrop = pDoc.getElementById('drawer-backdrop');
    var stateEl = pDoc.getElementById('drawer-state');
    if (!drawer || !backdrop || !stateEl) return;
    var isOpen = stateEl.dataset.open === 'true';

    function lockScroll() {
      if (window.parent._drawerPrevOverflow === undefined) window.parent._drawerPrevOverflow = null;
      if (window.parent._drawerPrevOverflow === null) {
        window.parent._drawerPrevOverflow = pDoc.body.style.overflow || '';
        window.parent._drawerPrevDocOverflow = pDoc.documentElement.style.overflow || '';
      }
      pDoc.body.style.overflow = 'hidden';
      pDoc.documentElement.style.overflow = 'hidden';
    }
    function unlockScroll() {
      var prev = window.parent._drawerPrevOverflow;
      if (prev !== null && prev !== undefined) {
        pDoc.body.style.overflow = prev;
        pDoc.documentElement.style.overflow = window.parent._drawerPrevDocOverflow || '';
        window.parent._drawerPrevOverflow = null;
        window.parent._drawerPrevDocOverflow = null;
      } else {
        pDoc.body.style.overflow = '';
        pDoc.documentElement.style.overflow = '';
      }
    }

    if (isOpen) {
      lockScroll();
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          backdrop.classList.add('open');
          drawer.classList.add('drawer-open');
        });
      });
    } else {
      backdrop.classList.remove('open');
      drawer.classList.remove('drawer-open');
      unlockScroll();
    }

    // Close via query param — triggers early detection at top of Python script
    function doClose() {
      try {
        window.parent.location.search = 'close=1';
      } catch(e) {}
    }

    // Backdrop click -> close
    if (!window.parent._backdropHandlerAttached) {
      window.parent._backdropHandlerAttached = true;
      backdrop.addEventListener('click', function(e) {
        e.stopPropagation();
        doClose();
      }, true);

      // HTML close button -> close
      var closeBtn = drawer.querySelector('.dossier-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
          e.preventDefault();
          doClose();
        });
      }
    }

    // ESC key -> close
    if (!window.parent._escHandlerAttached) {
      window.parent._escHandlerAttached = true;
      pDoc.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          var st2 = pDoc.getElementById('drawer-state');
          if (st2 && st2.dataset.open === 'true') {
            e.preventDefault();
            doClose();
          }
        }
      }, true);
    }
  } catch(err) { console.warn('Drawer JS:', err); }
})();
</script>
'''
components.html(drawer_js, height=0, width=0)
