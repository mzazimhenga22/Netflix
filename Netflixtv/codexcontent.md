Implemented and deployed the serverless fixes.

What changed in `serverless/index.js`:

- NetMirror TV now resolves exact episode ids first. `If Wishes Could Kill` S1E3 resolves to `81975396`, not the series id `81975196`.
- Hostless `/pv` playlists like `https:///files/...` are repaired using the real audio CDN host.
- The HLS proxy now rejects poisoned CDN ids. Example: expected `81975396`, got `220884` → rejected.
- `resolveNet22` now pre-validates the master playlist before returning a URL, so the app does not receive a stream that will fail later.

Verification:

- Local:
  - Interstellar: master `200`, segment `200`
  - If Wishes Could Kill S1E3: `net52id=81975396`, master `200`, segment `200`
- Cloud:
  - Forced `net22` now correctly fails with `502` when NetMirror gives poisoned `220884`
  - Direct poisoned URL returns `409 Poisoned CDN target`
  - Non-forced cloud resolve still works by falling back to another provider

Important result: NetMirror is poisoning Cloud Run/GCP responses for `net22`, but we now detect and reject that instead of playing the wrong content./