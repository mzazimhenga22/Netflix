import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NetMirror Domain Auto-Discovery Service
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Problem: The streaming site frequently rotates its domain (net22→net11, etc).
 * Solution: On startup, probe well-known "gateway" URLs that redirect to the
 *           current live domain.  Cache the result so we only re-probe when the
 *           cached domain goes stale or stops working.
 *
 * Flow:
 *  1. Check in-memory cache (valid for 30 min)
 *  2. Check AsyncStorage cache (valid for 6 hours)
 *  3. Probe gateway URLs — follow redirects and extract the final domain
 *  4. Validate the discovered domain with a lightweight request
 *  5. Cache the result and return it
 *
 * Consumers should call:
 *   const { net22Domain, net52Domain } = await getNetMirrorDomains();
 *   // net22Domain → e.g. "net11.cc"   (the primary/NF mirror)
 *   // net52Domain → e.g. "net52.cc"   (the PV mirror, may also change)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ─── Types ────────────────────────────────────────────────────────────────────
export interface NetMirrorDomains {
  /** Primary mirror domain (was "net22.cc", could be "net11.cc", etc.) */
  net22Domain: string;
  /** Secondary / PV mirror domain (was "net52.cc", could rotate too) */
  net52Domain: string;
}

interface CachedDomains {
  domains: NetMirrorDomains;
  fetchedAt: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default / last-known-good domains (updated manually as a fallback) */
const DEFAULT_DOMAINS: NetMirrorDomains = {
  net22Domain: 'net11.cc',
  net52Domain: 'net52.cc',
};

/**
 * Gateway URLs we probe to discover the current live domain.
 * These are stable "redirect" domains that the site operators keep alive
 * specifically so old links keep working.  When you visit net52.cc in a browser,
 * it redirects to net11.cc/verify — we detect that.
 *
 * Order matters: we probe top-to-bottom and stop at the first success.
 */
const GATEWAY_URLS_NET22 = [
  'https://net52.cc',          // Known to redirect to the live NF mirror
  'https://net22.cc',          // Old domain, might still redirect
  'https://netfree.cc',        // Another known gateway
  'https://net23.cc',
  'https://net24.cc',
  'https://netmirror.vip',
  'https://net11.cc',          // Current domain (probe directly)
];

const GATEWAY_URLS_NET52 = [
  'https://net52.cc',          // Primary PV domain
  'https://net52.net',
];

const STORAGE_KEY = '@netmirror_domains_v2';
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000;   // 30 minutes
const STORAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const PROBE_TIMEOUT_MS = 8000;

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

// ─── In-memory cache ──────────────────────────────────────────────────────────
let _memoryCache: CachedDomains | null = null;
let _probeInFlight: Promise<NetMirrorDomains> | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract the hostname from a URL string.
 * e.g. "https://net11.cc/verify?foo=bar" → "net11.cc"
 */
function extractHostname(url: string): string {
  try {
    const match = url.match(/^https?:\/\/([^/:?#]+)/i);
    return match ? match[1] : '';
  } catch {
    return '';
  }
}

/**
 * Probe a single gateway URL by making a request that follows redirects,
 * then inspecting the final URL to discover the live domain.
 *
 * Also checks the response body for meta-refresh or JS redirects.
 */
async function probeSingleGateway(gatewayUrl: string): Promise<string | null> {
  try {
    // Use axios with redirect following.  We want to land on the final URL.
    const res = await axios.get(gatewayUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeout: PROBE_TIMEOUT_MS,
      maxRedirects: 10,
      // We accept any status — even 403 pages often reveal the domain
      validateStatus: () => true,
    });

    // 1. Check the final URL after redirects
    //    axios stores the final URL in res.request.responseURL (browser) or
    //    res.request.res?.responseUrl (node/RN)
    const finalUrl =
      res.request?.responseURL ||       // Browser / RN
      res.request?.res?.responseUrl ||   // Node http
      '';

    if (finalUrl) {
      const host = extractHostname(finalUrl);
      if (host && host !== extractHostname(gatewayUrl)) {
        console.log(`[DomainDiscovery] 🔀 ${gatewayUrl} redirected to ${host}`);
        return host;
      }
    }

    // 2. Check response body for meta-refresh / JS redirect patterns
    const body = typeof res.data === 'string' ? res.data : '';
    
    // <meta http-equiv="refresh" content="0;url=https://net11.cc/verify">
    const metaMatch = body.match(/content=["'][^"']*url=["']?(https?:\/\/[^"'\s;>]+)/i);
    if (metaMatch) {
      const host = extractHostname(metaMatch[1]);
      if (host) {
        console.log(`[DomainDiscovery] 🔀 ${gatewayUrl} meta-refresh → ${host}`);
        return host;
      }
    }

    // window.location = "https://net11.cc" or window.location.href = ...
    const jsMatch = body.match(/(?:window\.)?location(?:\.href)?\s*=\s*["'](https?:\/\/[^"']+)/i);
    if (jsMatch) {
      const host = extractHostname(jsMatch[1]);
      if (host) {
        console.log(`[DomainDiscovery] 🔀 ${gatewayUrl} JS redirect → ${host}`);
        return host;
      }
    }

    // 3. If the gateway URL itself responds with a valid page (search.php works),
    //    then the gateway IS the live domain.
    if (res.status >= 200 && res.status < 400) {
      const host = extractHostname(gatewayUrl);
      console.log(`[DomainDiscovery] ✅ ${gatewayUrl} is alive (HTTP ${res.status})`);
      return host;
    }

    return null;
  } catch (err: any) {
    console.log(`[DomainDiscovery] ⚠️ Probe ${gatewayUrl} failed: ${err.message}`);
    return null;
  }
}

/**
 * Validate that a discovered domain actually serves the NetMirror API
 * by hitting its search endpoint with a dummy query.
 */
async function validateDomain(domain: string): Promise<boolean> {
  try {
    const res = await axios.get(`https://${domain}/search.php`, {
      params: { s: 'test', t: Math.floor(Date.now() / 1000) },
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': 'user_token=test; ott=nf;',
      },
      timeout: PROBE_TIMEOUT_MS,
      validateStatus: () => true,
    });

    // A valid response is JSON with searchResult array (even if empty)
    const isValid = res.status === 200 &&
      (typeof res.data === 'object' || (typeof res.data === 'string' && res.data.includes('searchResult')));

    console.log(`[DomainDiscovery] ${isValid ? '✅' : '❌'} Validation of ${domain}: HTTP ${res.status}`);
    return isValid;
  } catch (err: any) {
    console.log(`[DomainDiscovery] ❌ Validation of ${domain} failed: ${err.message}`);
    return false;
  }
}

/**
 * Discover the live domain by probing gateway URLs in order.
 */
async function discoverDomain(gateways: string[]): Promise<string | null> {
  for (const gw of gateways) {
    const host = await probeSingleGateway(gw);
    if (host) {
      // Validate the discovered domain actually works
      const isValid = await validateDomain(host);
      if (isValid) {
        return host;
      }
      console.log(`[DomainDiscovery] ⚠️ ${host} discovered but failed validation, trying next...`);
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current live NetMirror domains.
 *
 * Uses a layered cache strategy:
 *  1. In-memory (30 min TTL) — fastest
 *  2. AsyncStorage (6 hour TTL) — survives app restarts
 *  3. Live probe — follows redirects on gateway URLs to discover new domain
 *  4. Hardcoded defaults — last resort fallback
 *
 * Deduplicates concurrent calls so only one probe runs at a time.
 */
export async function getNetMirrorDomains(): Promise<NetMirrorDomains> {
  // 1. Memory cache
  if (_memoryCache && (Date.now() - _memoryCache.fetchedAt) < MEMORY_CACHE_TTL_MS) {
    console.log(`[DomainDiscovery] 🧠 Using memory-cached domains (age: ${Math.round((Date.now() - _memoryCache.fetchedAt) / 1000)}s): net22→${_memoryCache.domains.net22Domain}, net52→${_memoryCache.domains.net52Domain}`);
    return _memoryCache.domains;
  }

  // 2. Deduplicate concurrent probes
  if (_probeInFlight) {
    console.log(`[DomainDiscovery] ⏳ Probe already in flight, waiting...`);
    return _probeInFlight;
  }

  _probeInFlight = (async () => {
    try {
      // 3. AsyncStorage cache
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: CachedDomains = JSON.parse(stored);
          if ((Date.now() - parsed.fetchedAt) < STORAGE_CACHE_TTL_MS) {
            console.log(`[DomainDiscovery] 💾 Using stored domains (age: ${Math.round((Date.now() - parsed.fetchedAt) / 60000)}min): net22→${parsed.domains.net22Domain}, net52→${parsed.domains.net52Domain}`);
            _memoryCache = parsed;
            return parsed.domains;
          }
          console.log(`[DomainDiscovery] 💾 Stored domains expired (age: ${Math.round((Date.now() - parsed.fetchedAt) / 60000)}min)`);
        }
      } catch (e) {
        console.log(`[DomainDiscovery] ⚠️ AsyncStorage read error: ${e}`);
      }

      // 4. Live probe
      console.log(`[DomainDiscovery] 🌐 Probing gateway URLs for live domains...`);
      const t0 = Date.now();

      // Probe both domain families in parallel
      const [net22Host, net52Host] = await Promise.all([
        discoverDomain(GATEWAY_URLS_NET22),
        discoverDomain(GATEWAY_URLS_NET52),
      ]);

      const domains: NetMirrorDomains = {
        net22Domain: net22Host || DEFAULT_DOMAINS.net22Domain,
        net52Domain: net52Host || DEFAULT_DOMAINS.net52Domain,
      };

      console.log(`[DomainDiscovery] 🎯 Discovery complete in ${Date.now() - t0}ms: net22→${domains.net22Domain}, net52→${domains.net52Domain}`);

      // Cache results
      const cached: CachedDomains = { domains, fetchedAt: Date.now() };
      _memoryCache = cached;
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
      } catch (e) {
        console.log(`[DomainDiscovery] ⚠️ AsyncStorage write error: ${e}`);
      }

      return domains;
    } finally {
      _probeInFlight = null;
    }
  })();

  return _probeInFlight;
}

/**
 * Force a fresh domain probe, ignoring all caches.
 * Call this when a request fails with a DNS/connection error — the domain
 * may have rotated since the last probe.
 */
export async function refreshNetMirrorDomains(): Promise<NetMirrorDomains> {
  console.log(`[DomainDiscovery] 🔄 Force-refreshing domains (cache invalidated)...`);
  _memoryCache = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  return getNetMirrorDomains();
}

/**
 * Get domains synchronously from memory cache only.
 * Returns defaults if not yet discovered. Useful for non-async contexts.
 */
export function getNetMirrorDomainsCached(): NetMirrorDomains {
  return _memoryCache?.domains || DEFAULT_DOMAINS;
}

/**
 * Build full base URLs from discovered domains.
 * Convenience helper so callers don't have to prepend "https://" everywhere.
 */
export async function getNetMirrorBaseUrls(): Promise<{ net22Base: string; net52Base: string }> {
  const { net22Domain, net52Domain } = await getNetMirrorDomains();
  return {
    net22Base: `https://${net22Domain}`,
    net52Base: `https://${net52Domain}`,
  };
}

/**
 * Get the list of all known mirror domains (discovered + hardcoded).
 * Used by fetchNetMirrorStream which iterates mirrors.
 */
export async function getAllMirrorUrls(): Promise<string[]> {
  const { net22Domain, net52Domain } = await getNetMirrorDomains();
  
  // Put discovered domains first, then known gateways as fallbacks
  const mirrors = new Set<string>();
  mirrors.add(`https://${net22Domain}`);
  mirrors.add(`https://${net52Domain}`);
  
  // Add all known gateways (deduped by Set)
  for (const gw of GATEWAY_URLS_NET22) {
    mirrors.add(gw);
  }
  
  return Array.from(mirrors);
}
