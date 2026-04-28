import type { SubscriptionStatus } from './SubscriptionService';
import { PLAN_PROFILE_LIMITS } from './SubscriptionService';

const DEFAULT_FREE_PROFILE_LIMIT = PLAN_PROFILE_LIMITS.none;

export function isFreePlanStatus(subscription?: Pick<SubscriptionStatus, 'status'> | null): boolean {
  return subscription?.status !== 'active';
}

export function normalizePlanKey(planId?: string | null): keyof typeof PLAN_PROFILE_LIMITS {
  if (!planId) return 'none';

  const normalized = planId.toLowerCase();
  if (normalized in PLAN_PROFILE_LIMITS) {
    return normalized as keyof typeof PLAN_PROFILE_LIMITS;
  }

  if (normalized.includes('premium')) return 'premium';
  if (normalized.includes('standard')) return 'standard';
  if (normalized.includes('basic')) return 'basic';
  return 'none';
}

export function resolvePlanProfileLimit(planId?: string | null): number {
  return PLAN_PROFILE_LIMITS[normalizePlanKey(planId)] ?? DEFAULT_FREE_PROFILE_LIMIT;
}

export function isContentLockedForFreePlan(contentId: string | number, isFreePlan: boolean): boolean {
  if (!isFreePlan) return false;
  const hash = String(contentId)
    .split('')
    .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
  return hash % 3 === 0;
}
