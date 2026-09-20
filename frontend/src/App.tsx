import { useState, useEffect, useCallback, useRef } from 'react';
import { TopHeader } from './components/TopHeader';
import { NavSidebar, type ViewId, type NavItem } from './components/NavSidebar';
import { DashboardOverview, FooterBanner } from './components/DashboardOverview';
import { Sidebar } from './components/Sidebar';
import { RiskLandscape } from './components/RiskLandscape';
import { RiskDistribution } from './components/RiskDistribution';
import { Methodology } from './components/Methodology';
import { InvestigationTable } from './components/InvestigationTable';
import { Pagination } from './components/Pagination';
import { DossierPanel } from './components/DossierPanel';
import { NLSearch } from './components/NLSearch';
import { PrioritizeModal } from './components/PrioritizeModal';
import { CommandPalette } from './components/CommandPalette';
import { TrendPanel } from './components/TrendPanel';
import { EarlyWarningPanel } from './components/EarlyWarningPanel';
import { VendorPatternsPanel } from './components/VendorPatternsPanel';
import { AuditLogPanel } from './components/AuditLogPanel';
import { FeedbackAdmin } from './components/FeedbackAdmin';
import { ExportButton } from './components/ExportButton';
import { ComplianceMonitor } from './components/ComplianceMonitor';
import { MpAnalytics } from './components/MpAnalytics';
import { FinancialIntelligence } from './components/FinancialIntelligence';
import { AICopilot } from './components/AICopilot';
import { TopSuspiciousMPs } from './components/TopSuspiciousMPs';
import { LoginPage } from './components/LoginPage';
import { SignupPage } from './components/SignupPage';
import {
  IconGrid, IconFolder, IconGauge, IconMapPin, IconUsers, IconBuilding,
  IconShieldCheck, IconRupee, IconNetwork, IconSparkle, IconReport,
  IconDatabase, IconSearch, IconFilter,
} from './components/Icons';
import { useFilters } from './hooks/useFilters';
import { useApi } from './hooks/useApi';
import { usePermissions } from './hooks/usePermissions';
import * as api from './api/client';
import type { AuthSession } from './api/client';
import type { Overview, Filters, Project, NLSearchFilters } from './types';

const COMPLIANCE_RULE_LABELS: Record<string, string> = {
  sanction_timeline:    '45-Day Sanction Rule',
  completion_timeline:  'Completion Timeline Rule',
  payment_initiation:   'Payment Initiation Rule',
  category_eligibility: 'Category Eligibility Rule',
  duplicate_work:       'Duplicate Work Rule',
  phantom_completion:   'Phantom Completion Rule',
  cost_overrun:         'Cost Overrun Rule',
};

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',   label: 'Overview',                icon: <IconGrid /> },
  { id: 'projects',   label: 'Projects',                icon: <IconFolder /> },
  { id: 'risk',       label: 'Risk Analysis',           icon: <IconGauge /> },
  { id: 'geo',        label: 'Geographic Intelligence', icon: <IconMapPin /> },
  { id: 'mp',         label: 'MP Analytics',            icon: <IconUsers /> },
  { id: 'agency',     label: 'Agency Analytics',        icon: <IconBuilding /> },
  { id: 'compliance', label: 'Compliance',              icon: <IconShieldCheck /> },
  { id: 'financial',  label: 'Financial Intelligence',  icon: <IconRupee /> },
  { id: 'patterns',   label: 'Pattern Detection',       icon: <IconNetwork /> },
  { id: 'copilot',    label: 'AI Copilot',              icon: <IconSparkle /> },
  { id: 'reports',    label: 'Early Warnings',           icon: <IconReport /> },
  { id: 'system',     label: 'Data & System',           icon: <IconDatabase /> },
];

const VIEW_META: Record<ViewId, { title: string; sub: string }> = {
  overview:   { title: 'Welcome to MPLADS Intelligence', sub: 'AI-enabled audit and monitoring platform for the Member of Parliament Local Area Development Scheme' },
  projects:   { title: 'Projects', sub: 'Investigate flagged works, review evidence and open case dossiers' },
  risk:       { title: 'Risk Analysis', sub: 'Anomaly score distribution and the scoring methodology behind each flag' },
  geo:        { title: 'Geographic Intelligence', sub: 'State-level concentration of flagged works and risk signals' },
  mp:         { title: 'MP Analytics', sub: 'Member-wise utilisation, completion and risk profiles' },
  agency:     { title: 'Agency Analytics', sub: 'Members and implementing agencies with the highest concentration of flagged works' },
  compliance: { title: 'Compliance', sub: 'Scheme guideline adherence and rule breach monitoring' },
  financial:  { title: 'Financial Intelligence', sub: 'Fund utilisation, idle balances, cost overruns and payment gaps' },
  patterns:   { title: 'Pattern Detection', sub: 'Shared descriptions and amount clustering across constituencies' },
  copilot:    { title: 'AI Copilot', sub: 'Ask questions about the dataset in natural language' },
  reports:    { title: 'Early Warnings', sub: 'Early warning register and audit data exports' },
  system:     { title: 'Data & System', sub: 'Audit trail, data lineage and platform status' },
};

// Synthetic session for the "Continue as guest" path. It carries no real
// backend token, so auth validation and logout network calls are skipped for it.
const GUEST_SESSION: AuthSession = {
  token: 'guest',
  username: 'guest',
  role: 'public',
  display_name: 'Public Viewer',
};

export default function App() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const stored = localStorage.getItem('mplads_session');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [authChecking, setAuthChecking] = useState(!!localStorage.getItem('mplads_session'));
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!session) { setAuthChecking(false); return; }
    // Guest/public sessions are synthetic — no backend token to validate.
    if (session.role === 'public') { setAuthChecking(false); return; }
    api.authMe(session.token).then(s => {
      setSession(s);
      localStorage.setItem('mplads_session', JSON.stringify(s));
      setAuthChecking(false);
    }).catch(() => {
      setSession(null);
      localStorage.removeItem('mplads_session');
      setAuthChecking(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogin(s: AuthSession) {
    setSession(s);
    localStorage.setItem('mplads_session', JSON.stringify(s));
  }

  async function handleLogout() {
    if (session && session.role !== 'public') await api.authLogout(session.token).catch(() => {});
    setSession(null);
    localStorage.removeItem('mplads_session');
  }

  if (authChecking) {
    return (
      <div style={{ minHeight: '100vh', background: '#102A43', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="ai-spinner-dots"><span /><span /><span /></span>
      </div>
    );
  }

  if (!session) {
    if (showSignup) {
      return <SignupPage onLogin={handleLogin} onBack={() => setShowSignup(false)} />;
    }
    return <LoginPage onLogin={handleLogin} onSignup={() => setShowSignup(true)} onGuest={() => handleLogin(GUEST_SESSION)} />;
  }

  return <AuthenticatedApp session={session} onLogout={handleLogout} />;
}

function AuthenticatedApp({ session, onLogout }: { session: AuthSession; onLogout: () => void }) {
  const { filters, updateFilter, resetFilters, activeFilterCount } = useFilters();
  const perms = usePermissions(session.role);

  const initialWorkId = (() => new URLSearchParams(window.location.search).get('work'))();

  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(initialWorkId);
  const [filterOpen, setFilterOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [activeView, setActiveView] = useState<ViewId>('overview');
  const [globalSearch, setGlobalSearch] = useState('');
  const [dateRange, setDateRange] = useState('12m');

  const [nlResults, setNlResults] = useState<Project[] | null>(null);
  const [nlTotal, setNlTotal] = useState<number>(0);
  const [nlActive, setNlActive] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrioritize, setShowPrioritize] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);

  const overview = useApi<Overview>(() => api.getOverview(), []);
  const filtersMeta = useApi<Filters>(() => api.getFilters(), []);

  const worksData = useApi(
    () => {
      const dateFrom = (() => {
        if (dateRange === 'all') return undefined;
        const months = dateRange === '3m' ? 3 : dateRange === '6m' ? 6 : 12;
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        return d.toISOString().slice(0, 10);
      })();
      return api.getWorks({
        state: filters.state || undefined,
        district: filters.district || undefined,
        mp_name: filters.mpName || undefined,
        work_type: filters.category || undefined,
        min_risk_score: filters.minRisk,
        search: filters.search || undefined,
        sort: filters.sort,
        limit: filters.limit,
        offset: filters.page * filters.limit,
        date_from: dateFrom,
      });
    },
    [
      filters.state, filters.district, filters.mpName, filters.category,
      filters.minRisk, filters.search, filters.sort, filters.page, filters.limit,
      dateRange,
    ],
  );

  useEffect(() => {
    if (nlActive) { setNlResults(null); setNlActive(false); }
    setSelectedIds(new Set());
  }, [filters.state, filters.district, filters.mpName, filters.category, filters.minRisk, filters.search, filters.page]);

  const openDossier = useCallback((workId: string) => {
    setSelectedWorkId(workId);
    const url = new URL(window.location.href);
    url.searchParams.set('work', workId);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const closeDossier = useCallback(() => {
    setSelectedWorkId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('work');
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (filterOpen) { setFilterOpen(false); return; }
      if (selectedWorkId) closeDossier();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedWorkId, closeDossier, filterOpen]);

  /* The filter panel only applies to the Projects workspace —
     close it on navigation so it can never linger over another view. */
  useEffect(() => {
    if (activeView !== 'projects') setFilterOpen(false);
  }, [activeView]);

  function handleNlResults(results: Project[], _f: NLSearchFilters, _q: string, total: number) {
    setNlResults(results);
    setNlTotal(total);
    setNlActive(true);
    setSelectedIds(new Set());
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function handleNlClear() {
    setNlResults(null);
    setNlActive(false);
    setSelectedIds(new Set());
  }

  async function handleViewComplianceRecords(ruleId: string, label: string) {
    try {
      const result = await api.getComplianceRuleWorks(ruleId);
      setNlResults(result.results);
      setNlTotal(result.total);
      setNlActive(true);
      setSelectedIds(new Set());
      setActiveView('projects');
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch {
      // silently ignore — user stays on compliance tab
    }
  }

  function submitGlobalSearch(e: React.FormEvent) {
    e.preventDefault();
    updateFilter('search', globalSearch);
    updateFilter('page', 0);
    setActiveView('projects');
  }

  function jumpToState(state: string) {
    updateFilter('state', state);
    updateFilter('page', 0);
    setActiveView('projects');
  }

  const overviewData = overview.data;
  const displayWorks = nlActive && nlResults !== null
    ? { results: nlResults, total: nlTotal, limit: nlResults.length, offset: 0 }
    : worksData.data;

  const meta = VIEW_META[activeView];

  return (
    <div className="gov-root">
      <CommandPalette projects={displayWorks?.results ?? []} onOpen={openDossier} />

      <TopHeader
        apiHealthy={overview.data !== null}
        totalRecords={overviewData?.total_works_analyzed || 0}
        onMenuToggle={() => { setNavOpen(o => !o); setFilterOpen(false); }}
        userName={session.display_name}
        userRole={session.role}
        onLogout={onLogout}
      />

      <div className="gov-main">
        <NavSidebar
          items={NAV_ITEMS.filter(i => !perms.hiddenViews.includes(i.id))}
          active={activeView}
          onSelect={setActiveView}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />

        {/* Filter panel — Projects workspace only. Docked on wide
            screens, slide-over drawer on narrow ones. */}
        {activeView === 'projects' && (
          <>
            {filterOpen && <div className="filter-overlay" onClick={() => setFilterOpen(false)} />}
            <aside className={`filter-sidebar${filterOpen ? ' open' : ''}`}>
              <Sidebar
                filters={filters}
                updateFilter={updateFilter}
                resetFilters={resetFilters}
                activeFilterCount={activeFilterCount}
                filtersMeta={filtersMeta.data}
                apiHealthy={overview.data !== null}
                totalRecords={overviewData?.total_works_analyzed || 0}
                open={filterOpen}
                onClose={() => setFilterOpen(false)}
              />
            </aside>
          </>
        )}

        <main className="gov-content">
          {/* ── Page intro ───────────────────────────────── */}
          <div className="gov-page-intro">
            <div>
              <h1 className="gov-page-title">{meta.title}</h1>
              <p className="gov-page-sub">{meta.sub}</p>
            </div>
            <div className="gov-intro-tools">
              <form className="gov-search" onSubmit={submitGlobalSearch}>
                <span className="gov-search-icon"><IconSearch size={15} /></span>
                <input
                  type="search"
                  value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)}
                  placeholder="Search projects, MPs, districts, agencies..."
                  aria-label="Global search"
                />
              </form>
              <select
                className="gov-select"
                value={dateRange}
                onChange={e => setDateRange(e.target.value)}
                aria-label="Date range"
              >
                <option value="12m">Last 12 months</option>
                <option value="6m">Last 6 months</option>
                <option value="3m">Last 3 months</option>
                <option value="all">All time</option>
              </select>
            </div>
          </div>

          {overview.error && (
            <div className="state-error">
              <div className="state-error-title">Audit API unavailable</div>
              <div className="state-error-desc">Unable to connect to the backend at <code>http://localhost:8000</code></div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--mono)', marginTop: 8 }}>
                cd backend &amp;&amp; uvicorn main:app --reload --port 8000
              </div>
            </div>
          )}

          {/* ── Overview ─────────────────────────────────── */}
          {activeView === 'overview' && !overview.error && overviewData && (
            <DashboardOverview
              overview={overviewData}
              onOpenDossier={openDossier}
              onSelectState={jumpToState}
              onNavigate={setActiveView}
            />
          )}

          {/* ── Projects ─────────────────────────────────── */}
          {activeView === 'projects' && (
            <>
              <div className="gov-view-head">
                <div className="gov-card-sub">
                  {displayWorks
                    ? `${(nlActive ? nlTotal : displayWorks.total).toLocaleString('en-IN')} projects match the current criteria`
                    : 'Loading projects…'}
                </div>
                <div className="gov-view-tools">
                  <button
                    className={`gov-btn${filterOpen ? ' active' : ''}`}
                    onClick={() => { setFilterOpen(o => !o); setNavOpen(false); }}
                    aria-expanded={filterOpen}
                  >
                    <IconFilter size={15} /> Filters
                    {activeFilterCount > 0 && <span className="gov-btn-count">{activeFilterCount}</span>}
                  </button>
                  {perms.canExport && (
                    <ExportButton
                      state={filters.state || undefined}
                      mpName={filters.mpName || undefined}
                      minRiskScore={filters.minRisk > 0 ? filters.minRisk : undefined}
                    />
                  )}
                </div>
              </div>

              {worksData.error && (
                <div className="state-error">
                  <div className="state-error-title">Failed to load projects</div>
                  <div className="state-error-desc">{worksData.error}</div>
                  <button className="gov-btn" onClick={() => worksData.refetch()}>Retry</button>
                </div>
              )}

              <NLSearch onResults={handleNlResults} onClear={handleNlClear} active={nlActive} />
              <div ref={resultsRef} />

              {perms.canPrioritize && selectedIds.size >= 2 && (
                <div className="prioritize-bar">
                  <span>{selectedIds.size} projects selected</span>
                  <button className="gov-btn active" onClick={() => setShowPrioritize(true)}>
                    Prioritise selected ({selectedIds.size})
                  </button>
                </div>
              )}

              {worksData.loading && !nlActive &&
                [1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton" style={{ height: 40, marginBottom: 4 }} />)}

              {(!worksData.loading || nlActive) && displayWorks && displayWorks.results.length === 0 && (
                <div className="state-empty">
                  <div className="state-empty-title">No matching projects found</div>
                  <div className="state-empty-desc">
                    {nlActive ? 'No works matched your AI search query. Try rephrasing.' : 'No project records match the current filters.'}
                  </div>
                  {!nlActive && <button className="gov-btn" onClick={resetFilters}>Reset filters</button>}
                </div>
              )}

              {(!worksData.loading || nlActive) && displayWorks && displayWorks.results.length > 0 && (
                <div className="gov-card">
                  <div className="gov-card-body" style={{ padding: 0 }}>
                    <InvestigationTable
                      projects={displayWorks.results}
                      selectedWorkId={selectedWorkId}
                      onSelect={openDossier}
                      selectedIds={selectedIds}
                      onSelectionChange={setSelectedIds}
                    />
                  </div>
                  {!nlActive && (
                    <div style={{ padding: 'var(--s3) var(--s4)', borderTop: '1px solid var(--border)' }}>
                      <Pagination
                        page={filters.page}
                        limit={filters.limit}
                        total={displayWorks.total}
                        onPageChange={p => updateFilter('page', p)}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Risk analysis ────────────────────────────── */}
          {activeView === 'risk' && overviewData && (
            <>
              <RiskLandscape overview={overviewData} totalFiltered={displayWorks?.total || 0} />
              <RiskDistribution overview={overviewData} />
              <Methodology />
            </>
          )}

          {/* ── Geographic intelligence ──────────────────── */}
          {activeView === 'geo' && (
            <div className="gov-card"><div className="gov-card-body">
              <TrendPanel onSelectState={jumpToState} />
            </div></div>
          )}

          {/* ── MP analytics ─────────────────────────────── */}
          {activeView === 'mp' && <MpAnalytics onOpenDossier={openDossier} />}

          {/* ── Agency analytics ─────────────────────────── */}
          {activeView === 'agency' && (
            <div className="gov-card"><div className="gov-card-body">
              <TopSuspiciousMPs onSelectMp={mp => { updateFilter('mpName', mp); setActiveView('projects'); }} />
            </div></div>
          )}

          {/* ── Compliance ───────────────────────────────── */}
          {activeView === 'compliance' && (
            <ComplianceMonitor
              onOpenDossier={openDossier}
              onViewRecords={perms.canDrillCompliance ? handleViewComplianceRecords : undefined}
            />
          )}

          {/* ── Financial intelligence ───────────────────── */}
          {activeView === 'financial' && <FinancialIntelligence />}

          {/* ── Pattern detection ────────────────────────── */}
          {activeView === 'patterns' && perms.canViewPatterns && <VendorPatternsPanel />}

          {/* ── AI copilot ───────────────────────────────── */}
          {activeView === 'copilot' && perms.canViewAICopilot && <AICopilot />}

          {/* ── Reports ──────────────────────────────────── */}
          {activeView === 'reports' && (
            <>
              <div className="gov-view-head">
                <div className="gov-card-sub">Projects showing two or more risk signals before formal escalation</div>
                {perms.canExport && (
                  <ExportButton
                    state={filters.state || undefined}
                    mpName={filters.mpName || undefined}
                    minRiskScore={filters.minRisk > 0 ? filters.minRisk : undefined}
                  />
                )}
              </div>
              <div className="gov-card"><div className="gov-card-body">
                <EarlyWarningPanel onOpen={openDossier} />
              </div></div>
            </>
          )}

          {activeView === 'system' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <FeedbackAdmin />
              <AuditLogPanel />
            </div>
          )}

          {activeView !== 'overview' && <FooterBanner />}
        </main>
      </div>

      <DossierPanel workId={selectedWorkId} onClose={closeDossier} canGenerateBrief={perms.canGenerateBrief} canRunLLMAssessment={perms.canRunLLMAssessment} canExport={perms.canExport} reviewer={session.username} />

      {perms.canPrioritize && showPrioritize && selectedIds.size >= 2 && (
        <PrioritizeModal
          workIds={[...selectedIds]}
          onClose={() => setShowPrioritize(false)}
          onOpenDossier={openDossier}
        />
      )}
    </div>
  );
}
