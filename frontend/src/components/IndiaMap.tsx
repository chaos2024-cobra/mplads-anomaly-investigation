import { INDIA_STATES } from './india_states_data';

interface IndiaMapProps {
  selectedState: string;
  onSelectState: (state: string) => void;
}

const STATE_ABBR: Record<string, string> = {
  'Jammu And Kashmir': 'J&K',
  'Himachal Pradesh': 'HP',
  'Punjab': 'PB',
  'Uttarakhand': 'UK',
  'Haryana': 'HR',
  'Delhi': 'DL',
  'Rajasthan': 'RJ',
  'Uttar Pradesh': 'UP',
  'Bihar': 'BR',
  'Sikkim': 'SK',
  'Arunachal Pradesh': 'AR',
  'Nagaland': 'NL',
  'Manipur': 'MN',
  'Mizoram': 'MZ',
  'Meghalaya': 'ML',
  'Assam': 'AS',
  'Tripura': 'TR',
  'West Bengal': 'WB',
  'Jharkhand': 'JH',
  'Odisha': 'OD',
  'Chhattisgarh': 'CG',
  'Madhya Pradesh': 'MP',
  'Gujarat': 'GJ',
  'Maharashtra': 'MH',
  'Telangana': 'TG',
  'Andhra Pradesh': 'AP',
  'Karnataka': 'KA',
  'Goa': 'GA',
  'Kerala': 'KL',
  'Tamil Nadu': 'TN',
  'Puducherry': 'PY',
};

export function IndiaMap({ selectedState, onSelectState }: IndiaMapProps) {
  return (
    <div className="india-map-wrap">
      <div className="ctrl-label" style={{ marginBottom: '0.4rem' }}><span>🗺</span> SELECT STATE</div>
      {selectedState && (
        <div style={{ fontSize: '0.62rem', color: 'var(--info)', marginBottom: '0.3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{selectedState}</span>
          <button
            onClick={() => onSelectState('')}
            style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '0.7rem', padding: 0 }}
          >✕ clear</button>
        </div>
      )}
      <svg
        viewBox="0 -30 400 510"
        className="india-map-svg"
        aria-label="India state map"
      >
        {INDIA_STATES.map((s) => {
          const isSelected = selectedState === s.id;
          const abbr = STATE_ABBR[s.id] || s.id.slice(0, 2).toUpperCase();
          return (
            <g key={s.id} onClick={() => onSelectState(isSelected ? '' : s.id)} style={{ cursor: 'pointer' }}>
              <path
                d={s.d}
                fill={isSelected ? '#3b82f6' : '#1e2d4a'}
                stroke="#2d4a7a"
                strokeWidth="0.6"
                opacity={isSelected ? 1 : 0.9}
                className="india-state-path"
              />
              <text
                x={s.lx}
                y={s.ly}
                textAnchor="middle"
                fontSize="6"
                fill={isSelected ? '#fff' : '#7ca4d4'}
                style={{ pointerEvents: 'none', userSelect: 'none', fontFamily: 'var(--mono)', fontWeight: 700 }}
              >
                {abbr}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
