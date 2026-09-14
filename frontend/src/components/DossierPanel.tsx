import { useEffect, useRef, useState, useCallback, Fragment } from 'react';
import { useApi } from '../hooks/useApi';
import { getWorkDetail, getWorkPeers, getRelatedTransactions, streamChat, generateBrief, getLLMRisk, getSimilarWorks } from '../api/client';
import type { ChatMessage } from '../api/client';
import type { Project, PeerResponse, TransactionsResponse, BriefResponse, LLMRiskResponse, SimilarWork } from '../types';
import { fmtInr, riskColor, riskTier, severityBadgeClass, safeFloat, clamp } from '../utils/format';
import { InvestigationNotes } from './InvestigationNotes';
import { DescriptionQualityBadge } from './DescriptionQualityBadge';
import { appendAuditLog, getExportReportUrl } from '../api/client';

interface DossierPanelProps {
  workId: string | null;
  onClose: () => void;
  canGenerateBrief?: boolean;
  canRunLLMAssessment?: boolean;
  canExport?: boolean;
}

export function DossierPanel({ workId, onClose, canGenerateBrief = true, canRunLLMAssessment = true, canExport = true }: DossierPanelProps) {
  const isOpen = workId !== null;

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      <div
        className={`drawer-backdrop ${isOpen ? 'open' : ''}`}
        onClick={isOpen ? onClose : undefined}
        aria-hidden={!isOpen}
      />
      <div className={`drawer ${isOpen ? 'open' : ''}`} role="dialog" aria-modal="true" aria-label="Investigation dossier">
        {isOpen && workId && <DossierContent workId={workId} onClose={onClose} canGenerateBrief={canGenerateBrief} canRunLLMAssessment={canRunLLMAssessment} canExport={canExport} />}
      </div>
    </>
  );
}

type DossierTab = 'overview' | 'lifecycle' | 'compliance' | 'signals' | 'evidence' | 'peers' | 'source' | 'activity' | 'similar' | 'ai';

const TABS: { id: DossierTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'lifecycle', label: '⊙ Lifecycle' },
  { id: 'compliance', label: '✓ Compliance' },
  { id: 'signals', label: 'Signals' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'peers', label: 'Peers' },
  { id: 'source', label: 'Source' },
  { id: 'activity', label: 'Activity' },
  { id: 'similar', label: '~ Similar' },
  { id: 'ai', label: '✦ Ask AI' },
];

function DossierContent({ workId, onClose, canGenerateBrief = true, canRunLLMAssessment = true, canExport = true }: { workId: string; onClose: () => void; canGenerateBrief?: boolean; canRunLLMAssessment?: boolean; canExport?: boolean }) {
  const { data: detail, loading, error } = useApi(
    () => getWorkDetail(workId),
    [workId]
  );

  const [peers, setPeers] = useState<PeerResponse | null>(null);
  const [txns, setTxns] = useState<TransactionsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<DossierTab>('overview');

  useEffect(() => {
    if (!workId) return;
    let cancelled = false;
    getWorkPeers(workId, 6).then((p) => { if (!cancelled) setPeers(p); }).catch(() => {});
    getRelatedTransactions(workId, 8).then((t) => { if (!cancelled) setTxns(t); }).catch(() => {});
    return () => { cancelled = true; };
  }, [workId]);

  useEffect(() => { setActiveTab('overview'); }, [workId]);

  useEffect(() => {
    if (workId) appendAuditLog(workId, 'opened dossier').catch(() => {});
  }, [workId]);

  if (loading) {
    return (
      <>
        <div className="dossier-header">
          <div className="dossier-case-tag">INVESTIGATION DOSSIER</div>
          <div className="skeleton" style={{ height: 20, width: '80%', marginTop: 8 }} />
          <div className="skeleton" style={{ height: 14, width: '50%', marginTop: 4 }} />
          <button className="dossier-close" onClick={onClose} aria-label="Close dossier">×</button>
        </div>
        <div className="dossier-body">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8 }} />)}
        </div>
      </>
    );
  }

  if (error || !detail) {
    return (
      <>
        <div className="dossier-header">
          <div className="dossier-case-tag">INVESTIGATION DOSSIER</div>
          <button className="dossier-close" onClick={onClose} aria-label="Close dossier">×</button>
        </div>
        <div className="dossier-body">
          <div className="state-error">
            <div className="state-error-icon">⚠</div>
            <div className="state-error-title">DOSSIER LOAD FAILED</div>
            <div className="state-error-desc">{error || 'Unknown error'}</div>
          </div>
        </div>
      </>
    );
  }

  const score = safeFloat(detail.risk_score, 0);
  const level = detail.risk_level || 'Low - Normal Pattern';
  const tc = riskColor(score);
  const tt = riskTier(score);

  const ev: Record<string, any> = (detail.evidence || {}) as Record<string, any>;
  const finEv: Record<string, any> = (ev.financial_anomaly || {}) as Record<string, any>;
  const recEv: Record<string, any> = (ev.rec_delay || {}) as Record<string, any>;
  const stallEv: Record<string, any> = (ev.stalled_work || {}) as Record<string, any>;
  const absEv: Record<string, any> = (ev.unaccounted_funds || {}) as Record<string, any>;
  const phantomEv: Record<string, any> = (ev.phantom_completion || {}) as Record<string, any>;
  const dupEv: Record<string, any> = (ev.duplicate_work || {}) as Record<string, any>;
  const calEv: Record<string, any> = (ev.calamity_misuse || {}) as Record<string, any>;

  const fScore = safeFloat(finEv.score);
  const cScore = safeFloat(finEv.cost_score); // sub-component, for display only
  const cRatio = safeFloat(finEv.ratio_to_category_median, 1);
  const cZ = safeFloat(finEv.z_score);
  const cFlagType = finEv.flag_type || 'zscore';
  const mRatio = safeFloat(finEv.conc_ratio, 1);
  const mShare = clamp(safeFloat(finEv.portfolio_share), 0, 1);

  const rScore = safeFloat(recEv.score);
  const rDays = safeFloat(recEv.days);

  const sScore = safeFloat(stallEv.score);
  const sStatus = stallEv.work_status || '';
  const sDays = safeFloat(stallEv.days_stalled);

  const aScore = safeFloat(absEv.score);
  const aDisbursed = safeFloat(absEv.total_disbursed);
  const aPipelineStage = absEv.pipeline_stage || '';

  const phantomScore = safeFloat(phantomEv.score);
  const phantomDays = phantomEv.days_to_complete !== null && phantomEv.days_to_complete !== undefined ? Number(phantomEv.days_to_complete) : null;
  const hasImage = Boolean(phantomEv.has_image);

  const dScore = safeFloat(dupEv.score);
  const dPair = dupEv.duplicate_of || null;

  const calScore = safeFloat(calEv.score);

  const signals = [fScore > 0, rScore > 0, sScore > 0, aScore > 0, phantomScore > 0, dScore > 0, calScore > 0].filter(Boolean).length;
  const evStrLabel = signals >= 4 ? 'Strong' : signals >= 2 ? 'Moderate' : 'Limited';
  const evBarPct = (signals / 7) * 100;

  const findings: { num: number; type: string; evidence: string; meta: string; sev: string }[] = [];
  if (fScore > 0) {
    const peerMedian = peers?.category_median_amount;
    const peerRatio = peerMedian && peerMedian > 0 && detail.amount ? detail.amount / peerMedian : null;
    const displayRatio = peerRatio ?? cRatio;
    let costPart: string;
    if (cFlagType === 'ratio') {
      costPart = `Sanctioned at ${cRatio.toFixed(1)}× the fixed government rate for this work type`;
    } else if (displayRatio > 3) {
      costPart = `Cost is ${displayRatio.toFixed(1)}× the typical amount for similar works${peerMedian ? ` (peer median ${fmtInr(peerMedian)})` : ` (z-score ${cZ.toFixed(1)})`}`;
    } else if (displayRatio > 1.3) {
      costPart = `${displayRatio.toFixed(1)}× above peer median${peerMedian ? ` of ${fmtInr(peerMedian)}` : ''} · z-score ${cZ.toFixed(1)}`;
    } else {
      costPart = mShare > 0 ? `Cost near median, but extreme portfolio concentration drives this signal` : `Financial risk from concentration pattern (cost within normal range)`;
    }
    const concPart = mShare > 0.5 ? `; ${(mShare * 100).toFixed(0)}% of MP portfolio in single category (${mRatio.toFixed(1)}× peer MPs)` : (mShare > 0 ? `; ${(mShare * 100).toFixed(0)}% portfolio concentration` : '');
    findings.push({
      num: findings.length + 1,
      type: 'FINANCIAL ANOMALY',
      evidence: costPart + concPart,
      meta: `${Math.round(fScore / 50 * 25)}/25 pts`,
      sev: fScore >= 40 ? 'finding-critical' : fScore >= 25 ? 'finding-high' : 'finding-medium',
    });
  }
  if (rScore > 0) {
    findings.push({
      num: findings.length + 1,
      type: 'RECOMMENDATION DELAY',
      evidence: `${Math.round(rDays)} days from recommendation to sanction`,
      meta: `${Math.round(rScore / 10 * 10)}/10 pts`,
      sev: rScore >= 15 ? 'finding-critical' : rScore >= 8 ? 'finding-high' : 'finding-medium',
    });
  }
  if (sScore > 0) {
    findings.push({
      num: findings.length + 1,
      type: 'STALLED WORK',
      evidence: `Status: "${sStatus}" for ${Math.round(sDays)} days`,
      meta: `${Math.round(sScore / 20 * 20)}/20 pts`,
      sev: sScore >= 25 ? 'finding-critical' : sScore >= 15 ? 'finding-high' : 'finding-medium',
    });
  }
  if (aScore > 0) {
    const absDesc = aPipelineStage === 'Completed'
      ? `₹${(aDisbursed / 1e5).toFixed(1)}L disbursed, exceeds completion record`
      : `₹${(aDisbursed / 1e5).toFixed(1)}L disbursed, work not completed`;
    findings.push({
      num: findings.length + 1,
      type: 'UNACCOUNTED FUNDS',
      evidence: absDesc,
      meta: `${Math.round(aScore / 45 * 25)}/25 pts`,
      sev: aScore >= 25 ? 'finding-critical' : aScore >= 15 ? 'finding-high' : 'finding-medium',
    });
  }
  if (dScore > 0) {
    findings.push({
      num: findings.length + 1,
      type: 'DUPLICATE WORK',
      evidence: dPair ? `Near-identical to ${dPair}` : 'Near-identical work detected',
      meta: `${Math.round(dScore / 30 * 15)}/15 pts`,
      sev: dScore >= 25 ? 'finding-critical' : dScore >= 15 ? 'finding-high' : 'finding-medium',
    });
  }
  if (calScore > 0) {
    findings.push({
      num: findings.length + 1,
      type: 'CALAMITY FUND MISUSE',
      evidence: 'MP received calamity consent but this work is not relief-related',
      meta: `${Math.round(calScore / 25 * 5)}/5 pts`,
      sev: calScore >= 20 ? 'finding-critical' : 'finding-high',
    });
  }

  const invSummaryParts: string[] = [];
  if (fScore >= 15) {
    const peerMedianForSummary = peers?.category_median_amount;
    const displayMultiple = peerMedianForSummary && peerMedianForSummary > 0 && detail.amount
      ? detail.amount / peerMedianForSummary : cRatio;
    if (cFlagType === 'ratio') {
      invSummaryParts.push(`sanctioned at ${cRatio.toFixed(1)}× the fixed government rate for this work type`);
    } else if (displayMultiple > 3) {
      invSummaryParts.push(`cost is ${displayMultiple.toFixed(1)}× the typical amount for similar works — a major outlier`);
    } else if (displayMultiple > 1.5) {
      invSummaryParts.push(`cost of ${fmtInr(detail.amount)} is ${displayMultiple.toFixed(1)}× above the peer median`);
    } else {
      invSummaryParts.push(`unusually high financial risk score despite close-to-median cost (concentration likely driving this)`);
    }
    if (mShare > 0.5) {
      invSummaryParts.push(`${(mShare * 100).toFixed(0)}% of this MP's entire portfolio is concentrated in a single work category`);
    }
  }
  if (rScore > 0) {
    if (rDays <= 1) invSummaryParts.push(`approved ${rDays === 0 ? 'the same day' : 'within 1 day'} it was recommended — bypassed normal scrutiny`);
    else if (rDays > 365) invSummaryParts.push(`approval took ${Math.round(rDays)} days — over a year from recommendation to sanction`);
    else invSummaryParts.push(`${Math.round(rDays)}-day delay between recommendation and sanction`);
  }
  if (sScore > 0) {
    invSummaryParts.push(`work has been stuck at "${sStatus}" for ${Math.round(sDays)} days with no progress`);
  }
  if (aScore > 0) {
    const absAmt = `₹${(aDisbursed/1e5).toFixed(1)}L`;
    if (aPipelineStage === 'Completed') invSummaryParts.push(`${absAmt} disbursed but disbursement exceeds any completion record`);
    else invSummaryParts.push(`${absAmt} already disbursed to a work that has no completion record`);
  }
  if (phantomScore > 0 && phantomDays !== null) {
    const dayStr = phantomDays === 0 ? 'the same day it was sanctioned' : `just ${phantomDays} day${phantomDays === 1 ? '' : 's'} after sanction`;
    const imgNote = !hasImage ? ' — and no verification photo on record' : '';
    invSummaryParts.push(`marked complete ${dayStr}, which is implausible for this type of work${imgNote}`);
  }
  if (dScore > 0) invSummaryParts.push(dPair ? `near-identical to another work (${dPair}), suggesting possible duplicate billing` : 'near-identical to another work in this dataset');
  if (calScore > 0) invSummaryParts.push('this MP received calamity relief consent but this project is not relief-related');

  let invSummaryText: string;
  if (invSummaryParts.length === 0) {
    invSummaryText = 'no critical anomaly signals — pattern appears normal across all seven risk dimensions';
  } else if (invSummaryParts.length === 1) {
    invSummaryText = invSummaryParts[0];
  } else {
    const lead = invSummaryParts[0];
    const rest = invSummaryParts.slice(1).join('; also, ');
    invSummaryText = `${lead}. Additionally: ${rest}`;
  }

  return (
    <>
      <div className="dossier-header">
        <div className="dossier-case-tag">INVESTIGATION DOSSIER</div>
        <div className="dossier-case-id">{detail.work_id}</div>
        {detail.work_description && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.4, fontStyle: 'italic' }}>
            {detail.work_description}
          </div>
        )}
        <div className="dossier-mp">Member of Parliament: <b>{detail.mp_name}</b></div>
        <div style={{ marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span className={`badge ${severityBadgeClass(score)}`}>{tt}</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: '0.72rem', fontWeight: 700, color: tc }}>
            SCORE {Math.round(score)}
          </span>
        </div>
        <div className="dossier-header-actions">
          <button
            className="dossier-link-btn"
            title="Copy permalink"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set('work', workId);
              navigator.clipboard.writeText(url.toString()).catch(() => {});
            }}
            aria-label="Copy permalink"
          >
            ⎘ Copy Link
          </button>
          {canExport && (
            <a
              className="dossier-link-btn"
              href={getExportReportUrl(workId)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open PDF report in new tab"
            >
              ↓ PDF Report
            </a>
          )}
          <button className="dossier-close" onClick={onClose} aria-label="Close dossier" title="Close dossier (Esc)">×</button>
        </div>
      </div>

      <div className="dossier-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`dossier-tab-btn${activeTab === t.id ? ' active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dossier-body">

        {activeTab === 'overview' && (
          <>
            <div className="dossier-section">
              <RiskGauge score={Math.round(score)} color={tc} tier={tt} />
              <MultiDimScore detail={detail} />
            </div>
            <div className="dossier-section">
              <div className="inv-summary">
                <strong>INVESTIGATOR SUMMARY:</strong> {invSummaryText.charAt(0).toUpperCase() + invSummaryText.slice(1)}{invSummaryText.endsWith('.') ? '' : '.'}
              </div>
            </div>
            <div className="dossier-section">
              <div className="dossier-section-title">
                <span className="dossier-section-num">01</span> CASE DETAILS
              </div>
              <div className="case-grid">
                <div className="case-item"><div className="case-label">PROJECT COST</div><div className="case-val amount-val">{fmtInr(detail.amount)}</div></div>
                <div className="case-item"><div className="case-label">STATE / UT</div><div className="case-val">{detail.state || 'N/A'}</div></div>
                <div className="case-item"><div className="case-label">CONSTITUENCY</div><div className="case-val">{detail.constituency || 'N/A'}</div></div>
                <div className="case-item"><div className="case-label">DATE</div><div className="case-val mono-val">{detail.date || 'N/A'}</div></div>
                <div className="case-item"><div className="case-label">WORK STATUS</div><div className="case-val">{detail.work_status || 'Work Completed'}</div></div>
                <div className="case-item"><div className="case-label">PIPELINE STAGE</div><div className="case-val">{(detail.pipeline_stage || '').replace(/_/g, ' ')}</div></div>
                <div className="case-item case-val-full"><div className="case-label">WORK CATEGORY</div><div className="case-val">{detail.work_subcategory && detail.work_subcategory !== 'other' ? detail.work_subcategory : detail.work_type || 'N/A'}</div></div>
              </div>
            </div>
            <div className="dossier-section">
              <div className="inv-next">
                <div className="inv-next-title">INVESTIGATE NEXT</div>
                <div className="inv-next-item"><span className="inv-next-arrow">→</span> Compare against peer projects in this category</div>
                <div className="inv-next-item"><span className="inv-next-arrow">→</span> Review other projects by this MP</div>
                <div className="inv-next-item"><span className="inv-next-arrow">→</span> Verify work completion status on ground</div>
                <div className="inv-next-item"><span className="inv-next-arrow">→</span> Cross-check vendor payments with disbursement records</div>
              </div>
            </div>
            <div className="dossier-section">
              <InvestigationNotes workId={workId} />
            </div>
            <div className="dossier-section">
              <DescriptionQualityBadge workId={workId} />
            </div>
            {canGenerateBrief && <InvestigationBrief workId={workId} />}
            {canRunLLMAssessment && <LLMAssessmentCard workId={workId} />}
          </>
        )}

        {activeTab === 'lifecycle' && (
          <LifecycleTab detail={detail} />
        )}

        {activeTab === 'compliance' && (
          <ComplianceTab detail={detail} />
        )}

        {activeTab === 'signals' && (
          <div className="dossier-section">
            <div className="dossier-section-title">
              <span className="dossier-section-num">01</span> WHY THIS CASE WAS FLAGGED
            </div>
            {findings.length > 0 ? findings.map((f) => (
              <div key={f.num} className={`finding ${f.sev}`}>
                <div className="finding-num">{String(f.num).padStart(2, '0')}</div>
                <div className="finding-body">
                  <div className="finding-type">{f.type}</div>
                  <div className="finding-evidence">{f.evidence}</div>
                  <div className="finding-meta">{f.meta}</div>
                </div>
              </div>
            )) : (
              <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>No critical anomaly signals triggered.</div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && (
          <div className="dossier-section">
            <div className="dossier-section-title">
              <span className="dossier-section-num">01</span> RISK FACTORS
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Financial Anomaly</span>
                <span className="factor-score" style={{ color: '#f87171' }}>{Math.round(fScore / 50 * 25)} / 25</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${fScore ? Math.min(fScore / 50 * 100, 100) : 0}%`, background: '#ef4444' }} /></div>
              <div className="factor-detail">
                {fScore > 0 ? (() => {
                  const pm = peers?.category_median_amount;
                  const dr = pm && pm > 0 && detail.amount ? detail.amount / pm : cRatio;
                  const concStr = mShare > 0.5
                    ? `${(mShare * 100).toFixed(0)}% of portfolio in one category (${mRatio.toFixed(1)}× peers)`
                    : mShare > 0 ? `${(mShare * 100).toFixed(0)}% portfolio concentration` : null;
                  let costStr: string | null = null;
                  if (cFlagType === 'ratio') costStr = `${cRatio.toFixed(1)}× fixed government rate`;
                  else if (dr > 3) costStr = `${dr.toFixed(1)}× above peer median · z=${cZ.toFixed(1)}`;
                  else if (dr > 1.3) costStr = `${dr.toFixed(1)}× above peer median · z=${cZ.toFixed(1)}`;
                  else if (!concStr) costStr = `Cost within normal range — concentration driving score`;
                  return [costStr, concStr].filter(Boolean).join(' · ');
                })() : 'No financial anomaly'}
              </div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Recommendation Delay</span>
                <span className="factor-score" style={{ color: '#fb923c' }}>{Math.round(rScore / 10 * 10)} / 10</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${rScore ? Math.min(rScore / 10 * 100, 100) : 0}%`, background: '#f97316' }} /></div>
              <div className="factor-detail">
                {rScore > 0
                  ? (rDays <= 1 ? `${rDays === 0 ? 'Same-day' : 'Next-day'} approval — rubber stamp` : `${Math.round(rDays)} days rec→sanction`)
                  : 'No delay anomaly'}
              </div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Stalled Work</span>
                <span className="factor-score" style={{ color: '#fb923c' }}>{Math.round(sScore / 20 * 20)} / 20</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${sScore ? Math.min(sScore / 20 * 100, 100) : 0}%`, background: '#f97316' }} /></div>
              <div className="factor-detail">{sScore > 0 ? `"${sStatus}" · ${Math.round(sDays)}d` : 'No stall detected'}</div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Unaccounted Funds</span>
                <span className="factor-score" style={{ color: '#facc15' }}>{Math.round(aScore / 45 * 20)} / 20</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${aScore ? Math.min(aScore / 45 * 100, 100) : 0}%`, background: '#eab308' }} /></div>
              <div className="factor-detail">{aScore > 0 ? `₹${(aDisbursed / 1e5).toFixed(1)}L disbursed` : 'No unverified disbursement'}</div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Phantom Completion</span>
                <span className="factor-score" style={{ color: '#f97316' }}>{Math.round(phantomScore / 20 * 10)} / 10</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${phantomScore ? Math.min(phantomScore / 20 * 100, 100) : 0}%`, background: '#ea580c' }} /></div>
              <div className="factor-detail">
                {phantomScore > 0
                  ? `Completed ${phantomDays === 0 ? 'same day' : `${phantomDays}d after`} sanction${!hasImage ? ' · no photo' : ''}`
                  : 'No implausible completion speed'}
              </div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Duplicate Work</span>
                <span className="factor-score" style={{ color: '#a78bfa' }}>{Math.round(dScore / 30 * 10)} / 10</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${dScore ? Math.min(dScore / 30 * 100, 100) : 0}%`, background: '#8b5cf6' }} /></div>
              <div className="factor-detail">{dPair ? `Pair: ${dPair}` : 'No duplicate detected'}</div>
            </div>
            <div className="factor">
              <div className="factor-header">
                <span className="factor-name">Calamity Fund Misuse</span>
                <span className="factor-score" style={{ color: '#f472b6' }}>{Math.round(calScore / 25 * 5)} / 5</span>
              </div>
              <div className="factor-track"><div className="factor-fill" style={{ width: `${calScore ? Math.min(calScore / 25 * 100, 100) : 0}%`, background: '#ec4899' }} /></div>
              <div className="factor-detail">{calScore > 0 ? 'Calamity-consent MP, non-relief work' : 'No calamity signal'}</div>
            </div>
          </div>
        )}

        {activeTab === 'peers' && (
          peers && peers.peers.length > 0
            ? <PeerBenchmark peers={peers} />
            : <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1rem 0' }}>No peer data available.</div>
        )}

        {activeTab === 'source' && (
          <div className="dossier-section">
            <div className="dossier-section-title">
              <span className="dossier-section-num">01</span> SOURCE DETAILS
            </div>
            <div className="case-grid">
              <div className="case-item"><div className="case-label">WORK ID</div><div className="case-val mono-val">{detail.work_id}</div></div>
              <div className="case-item"><div className="case-label">MP NAME</div><div className="case-val">{detail.mp_name || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">STATE</div><div className="case-val">{detail.state || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">CONSTITUENCY</div><div className="case-val">{detail.constituency || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">WORK TYPE</div><div className="case-val">{detail.work_type || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">SUBCATEGORY</div><div className="case-val">{detail.work_subcategory || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">SANCTION DATE</div><div className="case-val mono-val">{detail.date || 'N/A'}</div></div>
              <div className="case-item"><div className="case-label">AMOUNT SANCTIONED</div><div className="case-val amount-val">{fmtInr(detail.amount)}</div></div>
              <div className="case-item"><div className="case-label">PIPELINE STAGE</div><div className="case-val">{(detail.pipeline_stage || '').replace(/_/g, ' ')}</div></div>
              <div className="case-item"><div className="case-label">WORK STATUS</div><div className="case-val">{detail.work_status || 'N/A'}</div></div>
            </div>
            {detail.work_description && (
              <div style={{ marginTop: '0.75rem' }}>
                <div className="case-label" style={{ marginBottom: '0.25rem' }}>WORK DESCRIPTION</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{detail.work_description}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          txns && txns.transactions.length > 0
            ? (
              <div className="dossier-section">
                <div className="dossier-section-title">
                  <span className="dossier-section-num">01</span> MP TRANSACTION HISTORY ({txns.transactions.length})
                </div>
                <div className="txn-note">{txns.note}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="txn-table">
                    <thead>
                      <tr>
                        <th>Work ID</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Risk Score</th>
                        <th>Category</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txns.transactions.map((txn, idx) => (
                        <tr key={idx}>
                          <td>{txn.work_id}</td>
                          <td>{txn.date}</td>
                          <td style={{ fontFamily: 'var(--mono)', color: 'var(--info)' }}>{fmtInr(txn.amount)}</td>
                          <td>{txn.risk_score}</td>
                          <td>{txn.work_type_or_desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
            : <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '1rem 0' }}>No transaction history available.</div>
        )}

        {activeTab === 'similar' && (
          <SimilarWorksTab workId={workId} />
        )}

        {activeTab === 'ai' && (
          <AiChat workId={workId} />
        )}

      </div>
    </>
  );
}

function AiChat({ workId }: { workId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let assistantText = '';
    setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

    try {
      await streamChat(
        workId,
        text,
        messages,
        (chunk) => {
          assistantText += chunk;
          setMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { role: 'assistant', content: assistantText };
            return next;
          });
        },
        ctrl.signal,
      );
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setError('Failed to get response. Is the backend running?');
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  }

  const SUGGESTED = [
    'Why was this work flagged?',
    'What should I investigate next?',
    'Is the cost anomaly significant?',
    'Summarise all risk signals',
  ];

  return (
    <div className="ai-chat">
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-icon">✦</div>
            <div className="ai-chat-empty-title">AI Investigator</div>
            <div className="ai-chat-empty-desc">Ask anything about this case. The AI has full access to the dossier data.</div>
            <div className="ai-chat-suggestions">
              {SUGGESTED.map((s) => (
                <button key={s} className="ai-suggest-btn" onClick={() => { setInput(s); inputRef.current?.focus(); }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`}>
            <div className="ai-msg-label">{m.role === 'user' ? 'YOU' : 'AI'}</div>
            <div className="ai-msg-content">{m.content}{m.role === 'assistant' && streaming && i === messages.length - 1 && <span className="ai-cursor" />}</div>
          </div>
        ))}
        {error && <div className="ai-error">{error}</div>}
        <div ref={bottomRef} />
      </div>
      <div className="ai-chat-input-row">
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          placeholder="Ask about this case…"
          value={input}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          disabled={streaming}
        />
        {streaming
          ? <button className="ai-send-btn ai-stop-btn" onClick={() => abortRef.current?.abort()}>■</button>
          : <button className="ai-send-btn" onClick={send} disabled={!input.trim()}>↑</button>
        }
      </div>
    </div>
  );
}

function PeerBenchmark({ peers }: { peers: PeerResponse }) {
  const medAmt = safeFloat(peers.category_median_amount, 0);
  const thisAmt = safeFloat(peers.this_work_amount, 0);

  let devPct = 0;
  if (medAmt && medAmt !== 0) {
    devPct = ((thisAmt - medAmt) / medAmt * 100);
    if (!Number.isFinite(devPct)) devPct = 0;
  } else {
    devPct = thisAmt === 0 ? 0 : 100;
  }
  const devSign = devPct >= 0 ? '+' : '';
  const peerCount = peers.peers.length;
  const multiple = medAmt ? (thisAmt / medAmt) : 0;

  const medianPos = 50;
  const thisPos = medAmt > 0 ? clamp((thisAmt / (medAmt * 3)) * 100, 2, 98) : 50;

  return (
    <>
      <div className="dossier-section">
        <div className="dossier-section-title">
          <span className="dossier-section-num">04</span> COST VS PEERS
        </div>
        <div className="peer-compare">
          <div className="peer-stat"><div className="peer-stat-label">THIS PROJECT</div><div className="peer-stat-val peer-this">{fmtInr(thisAmt)}</div></div>
          <div className="peer-stat"><div className="peer-stat-label">PEER MEDIAN</div><div className="peer-stat-val peer-median">{fmtInr(medAmt)}</div></div>
          <div className="peer-stat"><div className="peer-stat-label">MULTIPLE</div><div className="peer-stat-val peer-dev">{multiple.toFixed(1)}×</div></div>
          <div className="peer-stat"><div className="peer-stat-label">DEVIATION</div><div className="peer-stat-val peer-dev">{devSign}{devPct.toFixed(1)}%</div></div>
        </div>
        <div className="peer-spectrum">
          <div className="peer-spectrum-track" />
          <div className="peer-marker marker-median" style={{ left: `${medianPos}%` }}>
            <div className="peer-marker-label" style={{ color: 'var(--info)' }}>Median</div>
          </div>
          <div className="peer-marker marker-this" style={{ left: `${thisPos}%` }}>
            <div className="peer-marker-label" style={{ color: '#f87171' }}>This</div>
          </div>
        </div>
      </div>

      <div className="dossier-section">
        <div className="dossier-section-title">
          <span className="dossier-section-num">05</span> COMPARABLE PROJECTS
        </div>
        <div className="comp-list">
          {peers.peers.slice(0, 5).map((p, idx) => {
            const pRisk = safeFloat(p.risk_score);
            const pColor = riskColor(pRisk);
            return (
              <div className="comp-item" key={p.work_id}>
                <span className="comp-rank">{idx + 1}</span>
                <span className="comp-amount">{fmtInr(p.amount)}</span>
                <span className="comp-meta">{(p.mp_name || '').slice(0, 30)}</span>
                <span className="comp-risk" style={{ color: pColor }}>{Math.round(pRisk)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RiskGauge({ score, color, tier }: { score: number; color: string; tier: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const arcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGGElement>(null);
  const numRef = useRef<SVGTextElement>(null);
  const tierRef = useRef<SVGTextElement>(null);
  const animRef = useRef<number>(0);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  const total = 328;
  const needleDeg = (score / 100) * 180 - 90;

  useEffect(() => {
    if (prefersReducedMotion.current) {
      if (arcRef.current) arcRef.current.setAttribute('stroke-dasharray', `${total * score / 100} ${total * (1 - score / 100) + 2}`);
      if (needleRef.current) needleRef.current.setAttribute('transform', `rotate(${needleDeg} 140 130)`);
      if (numRef.current) numRef.current.textContent = String(score);
      return;
    }

    const duration = 1200;
    const start = performance.now();

    function ease(t: number) { return 1 - Math.pow(1 - t, 3); }

    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1);
      const e = ease(t);
      const c = Math.round(e * score);
      const filled = total * (score / 100) * e;
      const deg = -90 + e * (score / 100) * 180;

      if (arcRef.current) arcRef.current.setAttribute('stroke-dasharray', `${filled} ${total - filled + 2}`);
      if (needleRef.current) needleRef.current.setAttribute('transform', `rotate(${deg} 140 130)`);
      if (numRef.current) numRef.current.textContent = String(c);

      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        if (arcRef.current) arcRef.current.setAttribute('stroke-dasharray', `${total * score / 100} ${total * (1 - score / 100) + 2}`);
        if (needleRef.current) needleRef.current.setAttribute('transform', `rotate(${needleDeg} 140 130)`);
        if (numRef.current) numRef.current.textContent = String(score);
        if (tierRef.current) { tierRef.current.setAttribute('fill', color); tierRef.current.textContent = tier; }
      }
    }

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [score, color, tier, needleDeg, total]);

  return (
    <div style={{ textAlign: 'center', padding: '0.5rem 0 0.25rem 0' }}>
      <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
        OVERALL ANOMALY RISK
      </div>
      <svg
        ref={svgRef}
        viewBox="0 0 280 160"
        width="100%"
        style={{ maxWidth: 260, overflow: 'visible' }}
        role="img"
        aria-label={`Risk score ${score} out of 100, tier ${tier}`}
      >
        <title>Risk score {score}/100 — {tier}</title>
        <defs>
          <linearGradient id="gg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="30%" stopColor="#f59e0b" />
            <stop offset="60%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <path d="M 35 130 A 105 105 0 0 1 245 130" fill="none" stroke="#dde3ed" strokeWidth="12" strokeLinecap="round" />
        <path ref={arcRef} d="M 35 130 A 105 105 0 0 1 245 130" fill="none" stroke="url(#gg)" strokeWidth="12" strokeLinecap="round" strokeDasharray="0 999" />
        <text x="24" y="150" fill="#4a5568" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace">0</text>
        <text x="70" y="40" fill="#4a5568" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace">25</text>
        <text x="132" y="22" fill="#4a5568" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace">50</text>
        <text x="194" y="40" fill="#4a5568" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace">75</text>
        <text x="248" y="150" fill="#4a5568" fontSize="8" fontWeight="600" fontFamily="'JetBrains Mono',monospace">100</text>
        <g ref={needleRef} transform="rotate(-90 140 130)">
          <polygon points="137.5,130 140,38 142.5,130" fill="#334d6e" opacity="0.85" />
          <circle cx="140" cy="130" r="7" fill="#f0f4fa" stroke="#94a3b8" strokeWidth="1.5" />
          <circle cx="140" cy="130" r="3" fill={color} />
        </g>
        <text ref={numRef} x="140" y="106" textAnchor="middle" fill="#0f1b2d" fontSize="32" fontWeight="800" fontFamily="'JetBrains Mono',monospace">0</text>
        <text ref={tierRef} x="140" y="120" textAnchor="middle" fill={color} fontSize="10" fontWeight="800" letterSpacing="1.2" fontFamily="'Inter',sans-serif">{tier}</text>
      </svg>
    </div>
  );
}

function renderMd(text: string) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType: 'ol' | 'ul' | null = null;

  function flushList() {
    if (!listItems.length) return;
    if (listType === 'ol') out.push(<ol key={out.length} className="brief-list">{listItems}</ol>);
    else out.push(<ul key={out.length} className="brief-list">{listItems}</ul>);
    listItems = [];
    listType = null;
  }

  function boldify(s: string): React.ReactNode {
    const parts = s.split(/(\*\*[^*]+\*\*)/g);
    if (parts.length === 1) return s;
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const olMatch = line.match(/^(\d+)\)\s+(.*)/);
    const ulMatch = line.match(/^[-*]\s+(.*)/);

    if (olMatch) {
      if (listType !== 'ol') { flushList(); listType = 'ol'; }
      listItems.push(<li key={listItems.length}>{boldify(olMatch[2])}</li>);
    } else if (ulMatch) {
      if (listType !== 'ul') { flushList(); listType = 'ul'; }
      listItems.push(<li key={listItems.length}>{boldify(ulMatch[1])}</li>);
    } else {
      flushList();
      if (line.trim() === '') {
        if (out.length && out[out.length - 1] !== null) out.push(null);
      } else if (line.startsWith('**') && line.endsWith('**')) {
        out.push(<p key={out.length} style={{ fontWeight: 700, marginBottom: '0.4em' }}>{line.slice(2, -2)}</p>);
      } else {
        const prev = out[out.length - 1];
        if (prev === null) {
          out[out.length - 1] = <p key={out.length - 1} className="brief-para">{boldify(line)}</p>;
        } else {
          out.push(<p key={out.length} className="brief-para">{boldify(line)}</p>);
        }
      }
    }
  }
  flushList();
  return out.filter(n => n !== null).map((n, i) => <Fragment key={i}>{n}</Fragment>);
}

// ─── Multi-Dimensional Score ──────────────────────────────────────────────────

function MultiDimScore({ detail }: { detail: Project }) {
  const ev = detail.evidence;
  const clamp100 = (v: number | null | undefined) => Math.min(100, Math.round(v ?? 0));

  const financialScore = clamp100(
    (ev?.financial_anomaly?.score ?? 0) + (ev?.unaccounted_funds?.score ?? 0)
  );
  const executionScore = clamp100(
    (ev?.stalled_work?.score ?? 0) + (ev?.rec_delay?.score ?? 0)
  );
  const integrityScore = clamp100(
    (ev?.phantom_completion?.score ?? 0) + (ev?.calamity_misuse?.score ?? 0)
  );
  const duplicateScore = clamp100(ev?.duplicate_work?.score ?? 0);

  const dims = [
    { label: 'Financial', score: financialScore, desc: 'Cost anomaly + unaccounted funds' },
    { label: 'Execution', score: executionScore, desc: 'Stall delay + sanction delay' },
    { label: 'Integrity', score: integrityScore, desc: 'Phantom completion + misuse signals' },
    { label: 'Duplicate', score: duplicateScore, desc: 'Duplicate work risk' },
  ].filter(d => d.score > 0);

  if (dims.length === 0) return null;

  return (
    <div className="multidim-score">
      <div className="multidim-title">RISK DIMENSIONS</div>
      {dims.map(d => {
        const col = d.score >= 70 ? 'var(--risk-critical)' : d.score >= 40 ? 'var(--risk-high)' : 'var(--risk-medium)';
        return (
          <div key={d.label} className="multidim-row">
            <div className="multidim-label">{d.label}</div>
            <div className="multidim-bar-wrap">
              <div className="multidim-bar-track">
                <div className="multidim-bar-fill" style={{ width: `${d.score}%`, background: col }} />
              </div>
            </div>
            <div className="multidim-val" style={{ color: col }}>{d.score}</div>
            <div className="multidim-desc">{d.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Lifecycle Tab ────────────────────────────────────────────────────────────

type StageStatus = 'done' | 'current' | 'pending' | 'skipped' | 'alert';

interface LifecycleStage {
  id: string;
  label: string;
  sublabel?: string;
  status: StageStatus;
  date?: string;
  expectedDays?: number;
  actualDays?: number;
  note?: string;
  alertText?: string;
}

function deriveLifecycle(d: Project): LifecycleStage[] {
  const ws = (d.work_status || '').toLowerCase();
  const stage = (d.pipeline_stage || '').toLowerCase();
  const recToSan = d.rec_to_san_days ?? null;
  const stallDays = d.stall_days ?? null;
  const phantomDays = d.phantom_days ?? null;
  const isCompleted = stage.includes('completed');
  const isNotCompleted = stage.includes('sanctioned_not');

  // Derive approximate stage from work_status + pipeline_stage
  const statusRank = (() => {
    if (ws.includes('completed')) return 7;
    if (ws.includes('partially')) return 5;
    if (ws.includes('physical inspection')) return ws.includes('completed') ? 7 : 6;
    if (ws.includes('work in progress') || ws.includes('time estimation')) return 4;
    if (ws.includes('vendor identification')) return 3;
    if (ws.includes('sanction')) return 2;
    return 1;
  })();

  const isDone = (rank: number) => isCompleted ? true : statusRank > rank;
  const isCurrent = (rank: number) => !isCompleted && statusRank === rank;

  const stages: LifecycleStage[] = [
    {
      id: 'recommended',
      label: 'Recommended',
      sublabel: 'MP recommends work to District Authority',
      status: 'done',
      date: d.date,
    },
    {
      id: 'sanctioned',
      label: 'Sanctioned',
      sublabel: '45-day target from recommendation',
      status: isDone(2) ? 'done' : isCurrent(2) ? 'current' : 'pending',
      actualDays: recToSan ?? undefined,
      expectedDays: 45,
      note: recToSan != null ? `${Math.round(recToSan)} days to sanction` : undefined,
      alertText: recToSan != null && recToSan > 45
        ? `⚠ Sanction delayed ${Math.round(recToSan - 45)} days beyond 45-day guideline`
        : undefined,
    },
    {
      id: 'vendor',
      label: 'Vendor Identified',
      sublabel: 'Implementing agency / contractor selected',
      status: isDone(3) ? 'done' : isCurrent(3) ? 'current' : 'pending',
    },
    {
      id: 'started',
      label: 'Work Started',
      sublabel: 'Physical execution begins',
      status: isDone(4) ? 'done' : isCurrent(4) ? 'current' : 'pending',
    },
    {
      id: 'in_progress',
      label: 'Work In Progress',
      sublabel: '365-day completion target from sanction',
      status: isDone(5) ? 'done' : isCurrent(5) ? 'current' : 'pending',
      actualDays: stallDays ?? undefined,
      expectedDays: 365,
      alertText: stallDays != null && stallDays > 365 && isNotCompleted
        ? `⚠ Work stalled ${Math.round(stallDays)} days — exceeds 1-year guideline by ${Math.round(stallDays - 365)} days`
        : stallDays != null && stallDays > 180 && isNotCompleted
        ? `⚠ Work ongoing for ${Math.round(stallDays)} days`
        : undefined,
    },
    {
      id: 'inspection',
      label: 'Physical Inspection',
      sublabel: 'Site verification by implementing agency',
      status: ws.includes('physical inspection') || isDone(6) ? (isDone(7) ? 'done' : 'current') : 'pending',
      alertText: phantomDays != null && phantomDays > 90
        ? `⚠ Inspection completed but work stalled ${Math.round(phantomDays)} days — possible phantom completion`
        : undefined,
    },
    {
      id: 'completed',
      label: 'Work Completed',
      sublabel: 'Physical and financial completion certified',
      status: isCompleted ? 'done' : 'pending',
      alertText: isCompleted && phantomDays != null && phantomDays > 90
        ? `⚠ Marked completed but ${Math.round(phantomDays)} days stalled — verify on ground`
        : undefined,
    },
    {
      id: 'asset',
      label: 'Asset Created / Handed Over',
      sublabel: 'Durable public asset handed to user agency',
      status: isCompleted && (d.has_image ?? 0) > 0 ? 'done' : isCompleted ? 'current' : 'pending',
      alertText: isCompleted && (d.has_image ?? 0) === 0
        ? '⚠ No photographic verification recorded'
        : undefined,
    },
  ];

  return stages;
}

function LifecycleTab({ detail }: { detail: Project }) {
  const stages = deriveLifecycle(detail);
  const alerts = stages.filter(s => s.alertText);
  const recToSan = detail.rec_to_san_days;
  const stallDays = detail.stall_days;
  const phantomDays = detail.phantom_days;
  const hasExp = (detail.total_exp ?? 0) > 0;

  return (
    <div className="dossier-section">
      <div className="dossier-section-title">
        <span className="dossier-section-num">01</span> PROJECT LIFECYCLE
      </div>

      {alerts.length > 0 && (
        <div className="lc-alerts">
          {alerts.map(s => (
            <div key={s.id} className="lc-alert-item">{s.alertText}</div>
          ))}
        </div>
      )}

      <div className="lc-timeline">
        {stages.map((s, i) => (
          <div key={s.id} className={`lc-stage lc-stage--${s.status}`}>
            <div className="lc-connector">
              <div className={`lc-dot lc-dot--${s.status}`} />
              {i < stages.length - 1 && <div className={`lc-line lc-line--${s.status === 'done' ? 'done' : 'pending'}`} />}
            </div>
            <div className="lc-body">
              <div className="lc-label-row">
                <span className="lc-label">{s.label}</span>
                {s.status === 'done' && <span className="lc-badge lc-badge--done">Done</span>}
                {s.status === 'current' && <span className="lc-badge lc-badge--current">In Progress</span>}
                {s.status === 'pending' && <span className="lc-badge lc-badge--pending">Pending</span>}
                {s.status === 'alert' && <span className="lc-badge lc-badge--alert">Alert</span>}
              </div>
              {s.sublabel && <div className="lc-sublabel">{s.sublabel}</div>}
              {s.date && <div className="lc-meta">Date recorded: {s.date}</div>}
              {s.actualDays != null && s.expectedDays != null && (
                <div className="lc-duration-row">
                  <span className="lc-duration-label">Expected</span>
                  <span className="lc-duration-val">{s.expectedDays}d</span>
                  <span className="lc-duration-label" style={{ marginLeft: '0.75rem' }}>Actual</span>
                  <span className={`lc-duration-val ${s.actualDays > s.expectedDays ? 'lc-overdue' : 'lc-ontime'}`}>
                    {Math.round(s.actualDays)}d
                  </span>
                  {s.actualDays > s.expectedDays && (
                    <span className="lc-overrun">+{Math.round(s.actualDays - s.expectedDays)}d over</span>
                  )}
                </div>
              )}
              {s.alertText && <div className="lc-stage-alert">{s.alertText}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="dossier-section-title" style={{ marginTop: '1.25rem' }}>
        <span className="dossier-section-num">02</span> TIMELINE METRICS
      </div>
      <div className="lc-metrics">
        <div className="lc-metric">
          <div className="lc-metric-label">REC → SANCTION</div>
          <div className={`lc-metric-val ${recToSan != null && recToSan > 45 ? 'lc-metric-warn' : 'lc-metric-ok'}`}>
            {recToSan != null ? `${Math.round(recToSan)}d` : 'N/A'}
          </div>
          <div className="lc-metric-target">Target: 45d</div>
        </div>
        <div className="lc-metric">
          <div className="lc-metric-label">DAYS STALLED</div>
          <div className={`lc-metric-val ${stallDays != null && stallDays > 365 ? 'lc-metric-crit' : stallDays != null && stallDays > 180 ? 'lc-metric-warn' : 'lc-metric-ok'}`}>
            {stallDays != null ? `${Math.round(stallDays)}d` : 'N/A'}
          </div>
          <div className="lc-metric-target">Target: ≤365d</div>
        </div>
        <div className="lc-metric">
          <div className="lc-metric-label">PHANTOM DAYS</div>
          <div className={`lc-metric-val ${phantomDays != null && phantomDays > 90 ? 'lc-metric-crit' : 'lc-metric-ok'}`}>
            {phantomDays != null ? `${Math.round(phantomDays)}d` : 'N/A'}
          </div>
          <div className="lc-metric-target">Stalled after "completed"</div>
        </div>
        <div className="lc-metric">
          <div className="lc-metric-label">EXPENDITURE</div>
          <div className={`lc-metric-val ${!hasExp ? 'lc-metric-warn' : 'lc-metric-ok'}`}>
            {hasExp ? fmtInr(detail.total_exp!) : 'None recorded'}
          </div>
          <div className="lc-metric-target">Sanctioned: {fmtInr(detail.amount)}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Engine Tab ────────────────────────────────────────────────────

type RuleStatus = 'pass' | 'warn' | 'fail' | 'na';

interface ComplianceRule {
  id: string;
  label: string;
  description: string;
  status: RuleStatus;
  detail: string;
  reference: string;
}

function deriveCompliance(d: Project): ComplianceRule[] {
  const stage = (d.pipeline_stage || '').toLowerCase();
  const isCompleted = stage.includes('completed');
  const isNotCompleted = stage.includes('sanctioned_not');
  const recToSan = d.rec_to_san_days ?? null;
  const stallDays = d.stall_days ?? null;
  const phantomDays = d.phantom_days ?? null;
  const costRatio = d.cost_ratio ?? null;
  const conc = d.conc_ratio ?? null;
  const hasExp = (d.total_exp ?? 0) > 0;
  const hasImage = (d.has_image ?? 0) > 0;
  const hasDup = !!d.dup_pair;

  const rules: ComplianceRule[] = [
    {
      id: 'R-001',
      label: 'Sanction Timeline',
      description: 'Work must be sanctioned within 45 days of recommendation',
      status: recToSan == null ? 'na'
        : recToSan <= 45 ? 'pass'
        : recToSan <= 90 ? 'warn'
        : 'fail',
      detail: recToSan == null ? 'No sanction delay data'
        : recToSan <= 45 ? `Sanctioned in ${Math.round(recToSan)} days ✓`
        : `Sanctioned in ${Math.round(recToSan)} days — ${Math.round(recToSan - 45)} days over guideline`,
      reference: 'MPLADS Guidelines 2023 §12 — 45-day sanction target',
    },
    {
      id: 'R-002',
      label: 'Completion Timeline',
      description: 'Works must be completed within 365 days of sanction',
      status: isCompleted ? 'pass'
        : stallDays == null ? 'na'
        : stallDays <= 365 ? 'pass'
        : stallDays <= 548 ? 'warn'
        : 'fail',
      detail: isCompleted ? 'Work marked as completed ✓'
        : stallDays == null ? 'No timeline data'
        : stallDays <= 365 ? `Ongoing for ${Math.round(stallDays)} days — within 1-year target`
        : `Ongoing for ${Math.round(stallDays)} days — ${Math.round(stallDays - 365)} days beyond 1-year target`,
      reference: 'MPLADS Guidelines 2023 §14 — 1-year completion target',
    },
    {
      id: 'R-003',
      label: 'Phantom Completion',
      description: 'Completion status must reflect actual physical progress',
      status: phantomDays == null ? 'na'
        : phantomDays <= 30 ? 'pass'
        : phantomDays <= 90 ? 'warn'
        : 'fail',
      detail: phantomDays == null ? 'No phantom completion signals detected'
        : phantomDays <= 30 ? 'Completion status appears consistent ✓'
        : `${Math.round(phantomDays)} days elapsed since completion claim — physical verification required`,
      reference: 'Ministry monitoring — status vs physical progress reconciliation',
    },
    {
      id: 'R-004',
      label: 'Payment Activity',
      description: 'Expenditure should be recorded after sanction for active works',
      status: isCompleted && !hasExp ? 'warn'
        : isNotCompleted && !hasExp ? 'warn'
        : hasExp ? 'pass'
        : 'na',
      detail: hasExp ? `₹${((d.total_exp ?? 0) / 100000).toFixed(1)}L expenditure recorded ✓`
        : isCompleted ? 'Work marked completed but no expenditure data recorded'
        : 'No payment activity recorded — 90+ day threshold may apply',
      reference: 'Ministry monitoring — no-payment-90-days condition',
    },
    {
      id: 'R-005',
      label: 'Cost Reasonableness',
      description: 'Project cost should be within reasonable bounds of category peers',
      status: costRatio == null ? 'na'
        : costRatio <= 2 ? 'pass'
        : costRatio <= 5 ? 'warn'
        : 'fail',
      detail: costRatio == null ? 'Insufficient peer data for comparison'
        : costRatio <= 2 ? `${costRatio.toFixed(1)}× category median — within acceptable range ✓`
        : `${costRatio.toFixed(1)}× category median — significant cost anomaly`,
      reference: 'Audit analytics — cost-to-peer-median ratio',
    },
    {
      id: 'R-006',
      label: 'Duplicate Work Check',
      description: 'Work must not duplicate another sanctioned/completed work',
      status: hasDup ? 'fail' : 'pass',
      detail: hasDup ? `Possible duplicate of: ${d.dup_pair}` : 'No duplicate work detected ✓',
      reference: 'MPLADS Guidelines 2023 — no duplication of other scheme works',
    },
    {
      id: 'R-007',
      label: 'Photographic Verification',
      description: 'Completed works should have photographic evidence of asset creation',
      status: !isCompleted ? 'na'
        : hasImage ? 'pass'
        : 'warn',
      detail: !isCompleted ? 'Not yet applicable (work not completed)'
        : hasImage ? 'Photographic verification present ✓'
        : 'No completion photograph recorded — asset verification pending',
      reference: 'MPLADS monitoring — photographic evidence of asset creation',
    },
    {
      id: 'R-008',
      label: 'Portfolio Concentration',
      description: 'Single work should not dominate MP\'s entire portfolio',
      status: conc == null ? 'na'
        : conc < 0.5 ? 'pass'
        : conc < 0.8 ? 'warn'
        : 'fail',
      detail: conc == null ? 'Concentration data not available'
        : conc < 0.5 ? `${(conc * 100).toFixed(0)}% portfolio share — acceptable ✓`
        : `${(conc * 100).toFixed(0)}% of MP's category budget in one work — high concentration`,
      reference: 'Audit analytics — portfolio concentration risk',
    },
  ];

  return rules;
}

function ComplianceTab({ detail }: { detail: Project }) {
  const rules = deriveCompliance(detail);
  const breaches = rules.filter(r => r.status === 'fail');
  const warnings = rules.filter(r => r.status === 'warn');
  const passes = rules.filter(r => r.status === 'pass');
  const nas = rules.filter(r => r.status === 'na');

  return (
    <div className="dossier-section">
      <div className="dossier-section-title">
        <span className="dossier-section-num">01</span> COMPLIANCE STATUS
      </div>

      <div className="comp-summary">
        <div className="comp-summary-row">
          <div className="comp-stat comp-stat--pass">
            <div className="comp-stat-num">{passes.length}</div>
            <div className="comp-stat-label">Passed</div>
          </div>
          <div className="comp-stat comp-stat--warn">
            <div className="comp-stat-num">{warnings.length}</div>
            <div className="comp-stat-label">Warnings</div>
          </div>
          <div className="comp-stat comp-stat--fail">
            <div className="comp-stat-num">{breaches.length}</div>
            <div className="comp-stat-label">Breaches</div>
          </div>
          <div className="comp-stat comp-stat--na">
            <div className="comp-stat-num">{nas.length}</div>
            <div className="comp-stat-label">N/A</div>
          </div>
        </div>
        {breaches.length > 0 && (
          <div className="comp-breach-banner">
            ⚠ {breaches.length} compliance breach{breaches.length > 1 ? 'es' : ''} detected — priority review required
          </div>
        )}
        {breaches.length === 0 && warnings.length > 0 && (
          <div className="comp-warn-banner">
            {warnings.length} item{warnings.length > 1 ? 's' : ''} require attention
          </div>
        )}
        {breaches.length === 0 && warnings.length === 0 && nas.length < rules.length && (
          <div className="comp-ok-banner">All applicable rules satisfied ✓</div>
        )}
      </div>

      <div className="comp-rules">
        {rules.map(r => (
          <div key={r.id} className={`comp-rule comp-rule--${r.status}`}>
            <div className="comp-rule-icon">
              {r.status === 'pass' && '✓'}
              {r.status === 'warn' && '⚠'}
              {r.status === 'fail' && '✗'}
              {r.status === 'na' && '—'}
            </div>
            <div className="comp-rule-body">
              <div className="comp-rule-header">
                <span className="comp-rule-id">{r.id}</span>
                <span className="comp-rule-label">{r.label}</span>
                <span className={`comp-rule-badge comp-rule-badge--${r.status}`}>
                  {r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARNING' : r.status === 'fail' ? 'BREACH' : 'N/A'}
                </span>
              </div>
              <div className="comp-rule-detail">{r.detail}</div>
              <div className="comp-rule-ref">{r.reference}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function InvestigationBrief({ workId }: { workId: string }) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await generateBrief(workId);
      setBrief(result.brief);
    } catch (e: any) {
      setError(e.message || 'Failed to generate brief');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!brief) return;
    navigator.clipboard.writeText(brief);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function exportPdf() {
    if (!brief) return;

    // Convert markdown to simple HTML
    function mdToHtml(md: string): string {
      return md
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>')
        .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
        .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
        .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul>${m}</ul>`)
        .replace(/<\/ul>\s*<ul>/g, '')
        .replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br/>')
        .replace(/^(?!<[hulo])(.+)/, '<p>$1')
        .replace(/(?<![>])$/, '');
    }

    const now = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Investigation Brief — ${workId}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a2e;background:#fff;padding:0}
  @page{size:A4;margin:20mm 18mm 20mm 18mm}
  @media print{.no-print{display:none!important}body{padding:0}}
  .print-btn{position:fixed;top:16px;right:16px;background:#1e3a5f;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  .print-btn:hover{background:#2a4f82}
  .page{max-width:780px;margin:0 auto;padding:32px}
  .header{border-bottom:2px solid #1e3a5f;padding-bottom:14px;margin-bottom:20px}
  .header h1{font-size:17px;font-weight:700;color:#1e3a5f;letter-spacing:.4px}
  .header .meta{font-size:11px;color:#6b7280;margin-top:6px;display:flex;gap:20px;flex-wrap:wrap}
  .header .meta span{background:#f1f5f9;padding:2px 8px;border-radius:4px}
  .content h1{font-size:16px;font-weight:700;color:#1e3a5f;margin:18px 0 8px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
  .content h2{font-size:14px;font-weight:700;color:#1e3a5f;margin:16px 0 6px}
  .content h3{font-size:13px;font-weight:700;color:#374151;margin:12px 0 4px}
  .content h4{font-size:12px;font-weight:700;color:#4b5563;margin:10px 0 4px}
  .content p{margin:6px 0;line-height:1.65;color:#1a1a2e}
  .content ul{margin:6px 0 6px 20px;line-height:1.7}
  .content li{margin:2px 0;color:#1a1a2e}
  .content strong{font-weight:700;color:#111}
  .footer{margin-top:28px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">⬇ Save as PDF</button>
<div class="page">
  <div class="header">
    <h1>INVESTIGATION BRIEF</h1>
    <div class="meta">
      <span>Work ID: ${workId}</span>
      <span>Generated: ${now}</span>
      <span>MPLADS Anomaly Detection Platform</span>
    </div>
  </div>
  <div class="content">${mdToHtml(brief)}</div>
  <div class="footer">
    <span>MPLADS Anomaly Detection Platform — Confidential</span>
    <span>${workId}</span>
  </div>
</div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  }

  if (!brief && !loading) {
    return (
      <div className="dossier-section">
        <button className="brief-generate-btn" onClick={generate}>
          ✦ Generate Investigation Brief
        </button>
      </div>
    );
  }

  return (
    <div className="dossier-section">
      <div className="brief-box">
        <div className="brief-header">
          <span className="brief-title">INVESTIGATION BRIEF</span>
          {!loading && brief && (
            <div className="brief-actions">
              <button className="brief-action-btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
              <button className="brief-action-btn" onClick={exportPdf}>Export PDF</button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="brief-loading">
            <span className="ai-spinner-dots"><span /><span /><span /></span>
            <span>Generating brief…</span>
          </div>
        ) : (
          <div className="brief-content">{renderMd(brief ?? '')}</div>
        )}
        {error && <div className="ai-error">{error}</div>}
      </div>
    </div>
  );
}

function LLMAssessmentCard({ workId }: { workId: string }) {
  const [data, setData] = useState<LLMRiskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setData(await getLLMRisk(workId));
    } catch (e: any) {
      setError(e.message || 'Assessment failed');
    } finally {
      setLoading(false);
    }
  }

  function scoreColor(s: number) {
    return s >= 7 ? '#ef4444' : s >= 5 ? '#f97316' : s >= 3 ? '#f59e0b' : '#10b981';
  }

  if (!data && !loading) {
    return (
      <div className="dossier-section">
        <button className="brief-generate-btn" onClick={run} style={{ background: 'var(--surface-raised)', color: 'var(--text-secondary)', borderColor: 'var(--border-strong)' }}>
          Run AI Description Assessment
        </button>
      </div>
    );
  }

  return (
    <div className="dossier-section">
      <div className="ai-assessment-card">
        <div className="brief-header">
          <span className="brief-title">AI DESCRIPTION ASSESSMENT</span>
          {loading && <span className="ai-spinner-dots"><span /><span /><span /></span>}
        </div>
        {data && (
          <>
            <div className="ai-assessment-body">
              <div className="ai-score-badge" style={{ background: `${scoreColor(data.qualitative_score)}22`, border: `1px solid ${scoreColor(data.qualitative_score)}44`, color: scoreColor(data.qualitative_score) }}>
                {data.qualitative_score}/10
              </div>
              <div className="ai-assessment-reasoning">{data.reasoning}</div>
            </div>
            {data.flags.length > 0 && (
              <div className="ai-assessment-flags">
                {data.flags.map((f, i) => (
                  <span key={i} className="ai-flag-chip">{f}</span>
                ))}
              </div>
            )}
          </>
        )}
        {error && <div className="ai-error">{error}</div>}
      </div>
    </div>
  );
}

function SimilarWorksTab({ workId }: { workId: string }) {
  const [results, setResults] = useState<SimilarWork[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    setLoading(true);
    getSimilarWorks(workId, 10)
      .then((r) => setResults(r.results))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [workId]);

  if (loading) {
    return (
      <div className="dossier-section">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 60, marginBottom: 8 }} />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="dossier-section">
        <div className="ai-error">{error}</div>
      </div>
    );
  }

  if (!results || results.length === 0) {
    return (
      <div className="dossier-section" style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
        No semantically similar works found.
      </div>
    );
  }

  return (
    <div className="dossier-section">
      <div className="dossier-section-title">
        <span className="dossier-section-num">07</span> SEMANTICALLY SIMILAR WORKS
      </div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-dim)', marginBottom: '0.5rem' }}>
        TF-IDF description similarity — potential duplicates not caught by exact matching
      </div>
      <div className="similar-works-list">
        {results.map((w) => (
          <div key={w.work_id} className="similar-work-item">
            <div className="similar-score-bar" style={{ width: `${w.similarity_score * 100}%` }} />
            <div className="similar-work-body">
              <div className="similar-work-id">{w.work_id}</div>
              <div className="similar-work-meta">{w.mp_name} · {w.state}</div>
              {w.work_description && (
                <div className="similar-work-desc">
                  {w.work_description.slice(0, 120)}{w.work_description.length > 120 ? '…' : ''}
                </div>
              )}
            </div>
            <div className="similar-work-stats">
              <div style={{ color: 'var(--info)', fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>{fmtInr(w.amount)}</div>
              <div style={{ color: riskColor(w.risk_score), fontFamily: 'var(--mono)', fontSize: '0.65rem' }}>{w.risk_score}</div>
              <div style={{ color: 'var(--text-dim)', fontSize: '0.6rem' }}>{(w.similarity_score * 100).toFixed(0)}% similar</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
