import type { SubscriptionStatus } from './SubscriptionService';

export function isSubscriptionRestricted(sub?: SubscriptionStatus | null): boolean {
  // No subscription data = restricted (free user)
  if (!sub) return true;
  // Only 'active' subscriptions are unrestricted.
  // 'loading' is also treated as unrestricted briefly to prevent flicker on app start,
  // but we cap this with a timeout in the service layer.
  return sub.status !== 'active' && sub.status !== 'loading';
}

export function isTitleLockedForSubscription(
  titleId: string | number | null | undefined,
  sub?: SubscriptionStatus | null
): boolean {
  if (!titleId || !isSubscriptionRestricted(sub)) {
    return false;
  }

  const hash = String(titleId)
    .split('')
    .reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);

  return hash % 3 === 0;
}
