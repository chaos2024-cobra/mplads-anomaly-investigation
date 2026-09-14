export type Role = 'admin' | 'analyst' | 'auditor';

export interface Permissions {
  canExport: boolean;
  canPrioritize: boolean;
  canViewAICopilot: boolean;
  canViewPatterns: boolean;
  canGenerateBrief: boolean;
  canRunLLMAssessment: boolean;
  canDrillCompliance: boolean;
  canOpenDossier: boolean;
  hiddenViews: string[];
}

const ROLE_PERMISSIONS: Record<Role, Permissions> = {
  admin: {
    canExport: true,
    canPrioritize: true,
    canViewAICopilot: true,
    canViewPatterns: true,
    canGenerateBrief: true,
    canRunLLMAssessment: true,
    canDrillCompliance: true,
    canOpenDossier: true,
    hiddenViews: [],
  },
  analyst: {
    canExport: true,
    canPrioritize: true,
    canViewAICopilot: true,
    canViewPatterns: true,
    canGenerateBrief: true,
    canRunLLMAssessment: true,
    canDrillCompliance: true,
    canOpenDossier: true,
    hiddenViews: [],
  },
  auditor: {
    canExport: false,
    canPrioritize: false,
    canViewAICopilot: false,
    canViewPatterns: false,
    canGenerateBrief: false,
    canRunLLMAssessment: false,
    canDrillCompliance: false,
    canOpenDossier: true,
    hiddenViews: ['copilot', 'patterns'],
  },
};

export function usePermissions(role: string): Permissions {
  return ROLE_PERMISSIONS[(role as Role)] ?? ROLE_PERMISSIONS.auditor;
}
