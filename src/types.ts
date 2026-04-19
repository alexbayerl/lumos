export interface UsageBreakdown {
  included: number;
  bonus: number;
  total: number;
}

export interface PlanUsage {
  enabled: boolean;
  used: number;
  limit: number;
  remaining: number;
  breakdown: UsageBreakdown;
  autoPercentUsed: number;
  apiPercentUsed: number;
  totalPercentUsed: number;
}

export interface OnDemandUsage {
  enabled: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

export interface IndividualUsage {
  plan: PlanUsage;
  onDemand: OnDemandUsage;
}

export interface UsageSummaryResponse {
  billingCycleStart: string;
  billingCycleEnd: string;
  membershipType: string;
  limitType: string | null;
  isUnlimited: boolean;
  autoModelSelectedDisplayMessage?: string | null;
  namedModelSelectedDisplayMessage?: string | null;
  individualUsage: IndividualUsage;
  teamUsage: Record<string, unknown>;
}

export interface FetchUsageResult {
  data: UsageSummaryResponse;
  etag?: string | null;
  fetchedAt: string;
  fromCache: boolean;
  status: number;
}

export interface OverlaySettings {
  refreshIntervalSec: number;
  opacity: number;
  compactMode: boolean;
  alwaysOnTop: boolean;
}
