export function fmtInr(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return 'N/A';
  if (amount < 0) return `-${fmtInr(-amount)}`;
  if (amount >= 1e7) return `\u20B9${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `\u20B9${(amount / 1e5).toFixed(2)} L`;
  return `\u20B9${amount.toLocaleString('en-IN')}`;
}

export function riskColor(score: number): string {
  if (score >= 75) return '#ef4444';
  if (score >= 40) return '#f97316';
  if (score >= 20) return '#f59e0b';
  return '#10b981';
}

export function riskTier(score: number): string {
  if (score >= 75) return 'CRITICAL';
  if (score >= 40) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  return 'BASELINE';
}

export function severityBadgeClass(score: number): string {
  if (score >= 75) return 'badge-critical';
  if (score >= 40) return 'badge-high';
  if (score >= 20) return 'badge-medium';
  return 'badge-low';
}

export function severityLabel(level: string): string {
  if (level.includes('Critical')) return 'CRITICAL';
  if (level.includes('High')) return 'HIGH';
  if (level.includes('Medium')) return 'MEDIUM';
  return 'BASELINE';
}

export function safeFloat(val: unknown, defaultVal = 0): number {
  if (val == null) return defaultVal;
  const n = Number(val);
  return Number.isFinite(n) ? n : defaultVal;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}
