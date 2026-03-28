export type TVSubscriptionStatus = {
  userId: string;
  status: 'Active'|'Expired'|'Cancelled'|'Pending';
  expiry: string | null;
  planId: string | null;
  lastUpdated: string;
  subscriptionId?: string;
};

export type OnStatusChange = (status: TVSubscriptionStatus) => void;

export function startTvSubscriptionSync(opts: {
  userId: string;
  token?: string;
  baseUrl?: string;
  intervalMs?: number;
  onStatusChange: OnStatusChange;
}): { stop: () => void } {
  const { userId, token, baseUrl = '', intervalMs = 60000, onStatusChange } = opts;
  let timer: any = null;

  async function fetchStatus() {
    try {
      const url = `${baseUrl.replace(/\/$/, '')}/api/subscription/status?userId=${encodeURIComponent(userId)}`;
      const headers: any = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = (await res.json()) as TVSubscriptionStatus;
        onStatusChange(data);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('subscription-sync fetch error', e);
    }
  }

  // Initial fetch
  fetchStatus();
  timer = setInterval(fetchStatus, intervalMs);

  return {
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}
