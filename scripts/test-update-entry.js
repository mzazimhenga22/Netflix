const DEFAULT_TARGETS = {
  phone: {
    label: 'Phone',
    url: 'https://github.com/mzazimhenga22/Netflix/releases/download/phone-v1.0.0/Netflix.apk',
  },
  tv: {
    label: 'TV',
    url: 'https://github.com/mzazimhenga22/Netflix/releases/download/tv-v1.0.0/Netflixtv.apk',
  },
};

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    target: 'all',
    url: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--url') {
      options.url = args[i + 1] || null;
      i += 1;
    } else if (arg === 'phone' || arg === 'tv' || arg === 'all') {
      options.target = arg;
    }
  }

  return options;
}

function getTargets(options) {
  if (options.target === 'phone' || options.target === 'tv') {
    const selected = DEFAULT_TARGETS[options.target];
    return [{
      key: options.target,
      label: selected.label,
      url: options.url || selected.url,
    }];
  }

  return Object.entries(DEFAULT_TARGETS).map(([key, value]) => ({
    key,
    label: value.label,
    url: value.url,
  }));
}

async function probeDownload(target) {
  const startedAt = Date.now();
  const response = await fetch(target.url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      Range: 'bytes=0-1023',
      'User-Agent': 'Netflix2026-UpdateProbe/1.0',
    },
  });

  const elapsedMs = Date.now() - startedAt;
  const body = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') || 'unknown';
  const contentLength = response.headers.get('content-length') || 'unknown';
  const finalUrl = response.url;
  const magic = Buffer.from(body).subarray(0, 2).toString('utf8');

  return {
    ok: response.ok,
    status: response.status,
    elapsedMs,
    contentType,
    contentLength,
    finalUrl,
    bytesRead: body.byteLength,
    looksLikeZip: magic === 'PK',
  };
}

function printResult(target, result) {
  console.log(`\n[${target.label}]`);
  console.log(`requested: ${target.url}`);
  console.log(`final url: ${result.finalUrl}`);
  console.log(`status: ${result.status}`);
  console.log(`content-type: ${result.contentType}`);
  console.log(`content-length: ${result.contentLength}`);
  console.log(`bytes-read: ${result.bytesRead}`);
  console.log(`apk-signature: ${result.looksLikeZip ? 'looks valid (PK)' : 'unexpected'}`);
  console.log(`elapsed-ms: ${result.elapsedMs}`);
}

async function main() {
  const options = parseArgs(process.argv);
  const targets = getTargets(options);

  console.log('Testing update download targets used by the app entry update gate...');

  let failed = false;

  for (const target of targets) {
    try {
      const result = await probeDownload(target);
      printResult(target, result);

      if (!result.ok || !result.looksLikeZip) {
        failed = true;
      }
    } catch (error) {
      failed = true;
      console.log(`\n[${target.label}]`);
      console.log(`requested: ${target.url}`);
      console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\nSummary: ${failed ? 'FAILED' : 'PASSED'}`);
  console.log('This verifies the APK URL is reachable and starts returning APK bytes.');
  console.log('It does not launch the mobile or TV app, but it checks the exact update target the apps would open/download.');

  process.exit(failed ? 1 : 0);
}

main();
