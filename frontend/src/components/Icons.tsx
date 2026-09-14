/* Lightweight inline icon set — stroke icons, institutional tone, no emoji. */

interface IconProps { size?: number; className?: string; }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export function IconGrid({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
}
export function IconFolder({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
}
export function IconGauge({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M13.4 10.6 19 5" /><path d="M4 20a9 9 0 1 1 16 0" /></svg>;
}
export function IconMapPin({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>;
}
export function IconUsers({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
export function IconBuilding({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4" /></svg>;
}
export function IconShieldCheck({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M12 3 5 6v6c0 4.4 3 8.4 7 9 4-.6 7-4.6 7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
}
export function IconRupee({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M7 4h10M7 9h10M15.5 4c0 4-3 5-6 5l7 11" /></svg>;
}
export function IconNetwork({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v4M10.5 13 7 16.5M13.5 13l3.5 3.5" /></svg>;
}
export function IconSparkle({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8" /></svg>;
}
export function IconReport({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>;
}
export function IconDatabase({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></svg>;
}
export function IconSearch({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
}
export function IconBell({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
}
export function IconAlert({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>;
}
export function IconArrowRight({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function IconClipboard({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>;
}
export function IconFlag({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M4 21V4M4 5h12l-2 4 2 4H4" /></svg>;
}
export function IconMenu({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
}
export function IconFilter({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>;
}
export function IconPlus({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M12 5v14M5 12h14" /></svg>;
}
export function IconMinus({ size = 16, className }: IconProps) {
  return <svg {...base(size)} className={className}><path d="M5 12h14" /></svg>;
}

/* Ashoka-emblem inspired national mark — simplified, respectful, monochrome. */
export function AshokaEmblem({ size = 42, className }: IconProps) {
  const spokes = Array.from({ length: 24 }, (_, i) => i * 15);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} fill="none">
      <circle cx="32" cy="30" r="15" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="32" cy="30" r="3" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.85">
        {spokes.map(a => {
          const r = (a * Math.PI) / 180;
          return (
            <line
              key={a}
              x1={32 + Math.cos(r) * 3.6}
              y1={30 + Math.sin(r) * 3.6}
              x2={32 + Math.cos(r) * 14.4}
              y2={30 + Math.sin(r) * 14.4}
            />
          );
        })}
      </g>
      <path d="M18 50h28" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 54h20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

