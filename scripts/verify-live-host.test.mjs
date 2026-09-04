// node --test suite for verify-live-host.mjs -- zero-dependency, loopback only.
//
// The unit half drives the pure helpers. The conformance half is the one that matters: it
// builds a real deploy bundle, signs it with a key generated for the run, serves it over
// loopback TLS with `serve-profile-host.mjs`, and runs the gate against it. That is the
// same shape the release workflow runs, minus the credentials, so a change that makes the
// gate pass vacuously fails here.
//
// The negative controls are the modeled host defects `serve-profile-host.mjs` ships. Each
// must be a refusal; `charset-suffix` must not be, because a host appending a charset
// parameter is conformant and the gate documents that it compares type/subtype only.
//
// A dedicated fetch is used throughout: the listener's certificate is generated per run,
// so the global agent has no reason to trust it, and the gate refuses cleartext origins by
// design. Run: `npm run check`.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { after, test } from 'node:test';

import { buildProfileHostBundle } from './build-profile-host-bundle.mjs';
import { selfSignedLoopbackCertificate, startProfileHost } from './serve-profile-host.mjs';
import { SIGNATURE_FILE_NAME, signManifest } from './sign-profile-manifest.mjs';
import {
  DEFAULT_ORIGIN,
  IDENTIFIER_ORIGIN,
  canonicalPublicKeySha256,
  discoverBundleGroups,
  mediaTypeMatches,
  normalizeOrigin,
  parseArgs,
  parseMediaType,
  publicKeyServedPath,
  selfIdentifyingClaim,
  servedPathForIdentifier,
  verifyLiveHost,
} from './verify-live-host.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const temporaries = [];
after(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true });
});

function temporaryDirectory(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(path);
  return path;
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// `spawnSync` would block this process's event loop, and the listener the child connects
// to runs in this process, so the child could never be answered.
const run = promisify(execFile);

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/**
 * A `fetch` that trusts one certificate authority, over `node:https`.
 *
 * The gate refuses any origin that is not https, and the harness's certificate is minted
 * per run, so neither the global agent nor `NODE_EXTRA_CA_CERTS` (read at startup) can be
 * used. Only the response surface the gate consumes is modeled.
 */
function certificateTrustingFetch(ca) {
  return (url, { method = 'GET', signal } = {}) => new Promise((done, failed) => {
    const parsed = new URL(url);
    const call = request(
      {
        host: parsed.hostname,
        port: parsed.port,
        // `path` takes the raw request target so no normalization happens client-side.
        path: `${parsed.pathname}${parsed.search}`,
        method,
        ca,
        servername: 'localhost',
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const bytes = Buffer.concat(chunks);
          done({
            status: response.statusCode,
            redirected: false,
            headers: { get: (name) => response.headers[name.toLowerCase()] ?? null },
            arrayBuffer: async () => bytes,
          });
        });
      },
    );
    call.on('error', failed);
    if (signal) signal.addEventListener('abort', () => call.destroy(new Error('timed out')), { once: true });
    call.end();
  });
}

// A miniature inventory and its two release groups, disjoint, carrying every served-path
// shape a static host guesses wrong about: an extensionless profile, a `.schema.json`, an
// `@`-prefixed fixture directory, and a dot-version segment.
const SEALED = [
  ['profiles/sample-task/v1', 'application/json', `{\n  "$id": "${IDENTIFIER_ORIGIN}/profiles/sample-task/v1"\n}\n`],
  ['schemas/sample.schema.json', 'application/schema+json', '{\n  "type": "object"\n}\n'],
  ['task-profiles/sample-domain/1.0', 'application/json', '{\n  "profile": "x"\n}\n'],
  ['profiles/sample-bundle/v1/specification.md', 'text/markdown', '# specification\n'],
  ['@jinn-network/sample/fixtures/golden/minimal.json', 'application/json', '{\n  "a": 1\n}\n'],
];
const IMPLEMENTATIONS = [
  ['facts/sample-fact/v1', 'application/json', `{\n  "profile": "${IDENTIFIER_ORIGIN}/facts/sample-fact/v1"\n}\n`],
];

const SEALED_GROUP = 'sealed-sample-v1';
const IMPLEMENTATIONS_GROUP = 'implementations-sample-v1';

/** A repository-shaped fixture: `inventory.json` plus the tree under `documents/`. */
function sampleRepository() {
  const root = temporaryDirectory('jinn-verify-repo-');
  const write = (relative, body) => {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, body, 'utf8');
  };
  for (const [path, , body] of [...SEALED, ...IMPLEMENTATIONS]) write(join('documents', ...path.split('/')), body);
  const group = (releaseGroup, entries, prefixes, resolvableIdentifiers) => ({
    releaseGroup,
    lane: 'stable',
    servedPathPrefixes: prefixes,
    resolvableIdentifiers,
    packages: [{
      name: '@jinn-network/sample',
      documents: entries.map(([path, mediaType]) => ({ path, mediaType })),
    }],
  });
  write('inventory.json', `${JSON.stringify({
    version: 1,
    generatedFrom: { repository: 'Jinn-Network/mono', commit: '0'.repeat(40) },
    releaseGroups: [
      group(SEALED_GROUP, SEALED, ['profiles/', 'schemas/', 'task-profiles/', '@jinn-network/'], [
        {
          identifier: `${IDENTIFIER_ORIGIN}/profiles/sample-task/v1`,
          resolution: 'document',
          entryPoint: 'profiles/sample-task/v1',
        },
        {
          identifier: `${IDENTIFIER_ORIGIN}/profiles/sample-bundle/v1`,
          resolution: 'prefix',
          entryPoint: 'profiles/sample-bundle/v1/specification.md',
        },
      ]),
      group(IMPLEMENTATIONS_GROUP, IMPLEMENTATIONS, ['facts/'], []),
    ],
  }, null, 2)}\n`);
  return root;
}

/**
 * Build, sign and bundle the sample repository the way the release workflow does.
 * @returns the bundle directory, the key it was signed with, and the key's served path.
 */
async function signedBundle({ keyId = 'jinn-profile-manifest-2026-09' } = {}) {
  const { buildProfileRoot } = await import('./build-profile-root.mjs');
  const sampleRoot = sampleRepository();
  const roots = temporaryDirectory('jinn-verify-roots-');
  const { privateKeyPem, publicKeyPem } = keyPair();
  const profileRoots = [];
  for (const releaseGroup of [SEALED_GROUP, IMPLEMENTATIONS_GROUP]) {
    const outDir = join(roots, releaseGroup);
    const manifest = buildProfileRoot({ repoRoot: sampleRoot, outDir, releaseGroup, lane: 'stable' });
    const envelope = signManifest(readFileSync(join(outDir, 'manifest.json')), privateKeyPem, keyId);
    writeFileSync(join(outDir, SIGNATURE_FILE_NAME), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    assert.ok(manifest.documents.length > 0);
    profileRoots.push(outDir);
  }
  const bundle = join(temporaryDirectory('jinn-verify-bundle-'), 'out');
  buildProfileHostBundle({ profileRoots, outDir: bundle });
  const publicKeyPath = `keys/${keyId}.pem`;
  mkdirSync(join(bundle, 'keys'), { recursive: true });
  writeFileSync(join(bundle, ...publicKeyPath.split('/')), publicKeyPem, 'utf8');
  return { bundle, repoRoot: sampleRoot, publicKeyPem, publicKeyPath, keyId };
}

/** Serve one bundle over loopback TLS and run the gate against it. */
async function verifyAgainstHost({ bundle, repoRoot: root, publicKeyPem, publicKeyPath, fault = null }) {
  const tls = selfSignedLoopbackCertificate();
  const server = await startProfileHost({
    bundleDir: bundle,
    tls,
    fault,
    publicKey: publicKeyPem ? { pem: publicKeyPem, path: publicKeyPath } : null,
  });
  try {
    // The listener binds 127.0.0.1; the certificate names `localhost`, which is what the
    // fetch presents as the server name.
    const origin = server.origin.replace('127.0.0.1', 'localhost');
    const result = await verifyLiveHost({
      bundleDir: bundle,
      repoRoot: root,
      origin,
      release: 'v0.1.0',
      fetch: certificateTrustingFetch(tls.cert),
      timeoutMs: 5000,
      attempts: 1,
      retryDelayMs: 0,
    });
    return { result, requests: server.requests };
  } finally {
    await server.close();
  }
}

// --- pure logic -------------------------------------------------------------

test('normalizeOrigin accepts a bare https origin and refuses everything else', () => {
  assert.deepEqual(normalizeOrigin('https://spec.jinn.network'), { origin: 'https://spec.jinn.network' });
  assert.deepEqual(normalizeOrigin('https://spec.jinn.network/'), { origin: 'https://spec.jinn.network' });
  assert.deepEqual(normalizeOrigin('https://localhost:8443'), { origin: 'https://localhost:8443' });
  for (const bad of [
    'http://spec.jinn.network', 'https://spec.jinn.network/profiles', 'spec.jinn.network',
    'https://spec.jinn.network?x=1', '', '   ', null, undefined, 42,
  ]) {
    assert.ok(normalizeOrigin(bad).error, `${String(bad)} must be refused`);
  }
});

test('the default origin is the identifier origin, with no trailing slash', () => {
  assert.equal(DEFAULT_ORIGIN, 'https://spec.jinn.network');
  assert.equal(IDENTIFIER_ORIGIN, 'https://spec.jinn.network');
});

test('media types compare on type and subtype only', () => {
  assert.equal(parseMediaType('application/JSON; charset=utf-8'), 'application/json');
  assert.equal(parseMediaType('  text/markdown  '), 'text/markdown');
  assert.equal(parseMediaType(''), null);
  assert.equal(parseMediaType(null), null);
  assert.equal(mediaTypeMatches('application/json; charset=utf-8', 'application/json'), true);
  assert.equal(mediaTypeMatches('application/schema+json', 'application/schema+json'), true);
  // The failure this gate exists to catch: an extensionless profile typed as the fallback.
  assert.equal(mediaTypeMatches('application/octet-stream', 'application/json'), false);
  assert.equal(mediaTypeMatches('application/json', 'application/schema+json'), false);
  assert.equal(mediaTypeMatches(null, 'application/json'), false);
});

test('publicKeyServedPath derives one key path and refuses a key id that is not a literal segment', () => {
  assert.deepEqual(publicKeyServedPath('jinn-profile-manifest-2026-09'),
    { servedPath: 'keys/jinn-profile-manifest-2026-09.pem' });
  for (const bad of [
    '', '..', '.', 'a/b', '%2e%2e', 'a%2fb', 'a b', 'a?b', 'a#b', 'a:b', 'a*b', '\\', null, 7,
  ]) {
    assert.ok(publicKeyServedPath(bad).error, `${String(bad)} must be refused as a key id`);
  }
});

test('canonicalPublicKeySha256 pins the SPKI PEM digest and refuses the wrong key kind', () => {
  const { publicKeyPem } = keyPair();
  const canonical = canonicalPublicKeySha256(publicKeyPem);
  assert.equal(canonical.sha256, sha256(canonical.pem));
  // Trailing whitespace in the published file must not move the pinned digest.
  assert.equal(canonicalPublicKeySha256(`${publicKeyPem}\n\n  `).sha256, canonical.sha256);
  assert.ok(canonicalPublicKeySha256('not a key').error);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.match(
    canonicalPublicKeySha256(rsa.publicKey.export({ type: 'spki', format: 'pem' }).toString()).error,
    /must be ed25519/u,
  );
});

test('identifiers resolve to served paths through the profile builder rule', () => {
  assert.deepEqual(servedPathForIdentifier(`${IDENTIFIER_ORIGIN}/profiles/task-execution/v1`),
    { servedPath: 'profiles/task-execution/v1' });
  for (const bad of [
    'https://jinn.network/profiles/x', `${IDENTIFIER_ORIGIN}/a/../b`, `${IDENTIFIER_ORIGIN}/a%2fb`,
    `${IDENTIFIER_ORIGIN}/a?b`, `${IDENTIFIER_ORIGIN}/manifest.json`, `${IDENTIFIER_ORIGIN}/`,
  ]) {
    assert.ok(servedPathForIdentifier(bad).error, `${bad} must be refused`);
  }
});

test('a self-identifying claim is read from JSON documents and never from fixtures', () => {
  const claim = selfIdentifyingClaim('profiles/x/v1.json',
    Buffer.from(`{"$id":"${IDENTIFIER_ORIGIN}/profiles/x/v1.json"}`));
  assert.deepEqual(claim, { field: '$id', identifier: `${IDENTIFIER_ORIGIN}/profiles/x/v1.json` });
  assert.equal(selfIdentifyingClaim('profiles/x/v1', Buffer.from('{}')), null, 'extensionless is not read as JSON here');
  assert.equal(
    selfIdentifyingClaim('@jinn-network/s/fixtures/a.json', Buffer.from(`{"profile":"${IDENTIFIER_ORIGIN}/x"}`)),
    null,
    'a fixture profile names a vocabulary, not a location',
  );
  assert.equal(selfIdentifyingClaim('a.json', Buffer.from('{"$id":"https://example.com/x"}')), null);
  assert.match(selfIdentifyingClaim('a.json', Buffer.from('not json')).error, /does not parse/u);
  assert.match(
    selfIdentifyingClaim('a.json', Buffer.from(`{"$id":"${IDENTIFIER_ORIGIN}/a","profile":"${IDENTIFIER_ORIGIN}/b"}`)).error,
    /multiple self-identifying claims/u,
  );
});

test('parseArgs requires a bundle and an output path, and defaults the origin', () => {
  const parsed = parseArgs(['--bundle', 'out', '--out', 'report.json']);
  assert.equal(parsed.bundleDir, 'out');
  assert.equal(parsed.outputPath, 'report.json');
  assert.equal(parsed.origin, DEFAULT_ORIGIN);
  assert.equal(parsed.release, null);
  assert.equal(parseArgs(['--bundle', 'o', '--out', 'r', '--release', 'v1.2.3']).release, 'v1.2.3');
  assert.throws(() => parseArgs(['--out', 'r']), /--bundle is required/u);
  assert.throws(() => parseArgs(['--bundle', 'o']), /--out is required/u);
  assert.throws(() => parseArgs(['--nope', 'x']), /unknown argument/u);
  assert.throws(() => parseArgs(['--bundle']), /--bundle requires a value/u);
});

test('discoverBundleGroups finds only subdirectories whose manifest names them', async () => {
  const { bundle } = await signedBundle();
  assert.deepEqual(discoverBundleGroups(bundle).map(({ name }) => name),
    [IMPLEMENTATIONS_GROUP, SEALED_GROUP].sort());
  assert.throws(() => discoverBundleGroups(join(bundle, 'nowhere')), /does not exist/u);
  // `profiles/` is a document directory, not a group: it carries no self-naming manifest.
  const decoy = temporaryDirectory('jinn-verify-decoy-');
  mkdirSync(join(decoy, 'profiles'), { recursive: true });
  writeFileSync(join(decoy, 'profiles', 'manifest.json'), '{"releaseGroup":"something-else"}\n', 'utf8');
  assert.deepEqual(discoverBundleGroups(decoy), []);
});

// --- the gate, against a real socket ----------------------------------------

test('the gate passes against a conformant host and reports what it checked', async () => {
  const fixture = await signedBundle();
  const { result, requests } = await verifyAgainstHost(fixture);
  assert.equal(result.ok, true, result.reason);

  const groups = result.report.groups;
  assert.deepEqual(groups.map(({ releaseGroup }) => releaseGroup), [IMPLEMENTATIONS_GROUP, SEALED_GROUP].sort());
  assert.equal(result.report.documentsVerified, SEALED.length + IMPLEMENTATIONS.length);
  assert.equal(result.report.release, 'v0.1.0');
  assert.equal(result.report.origin.startsWith('https://'), true);
  for (const group of groups) {
    assert.deepEqual(group.keyIds, [fixture.keyId]);
    assert.equal(group.publicKeys[0].sha256, canonicalPublicKeySha256(fixture.publicKeyPem).sha256);
    assert.equal(group.lane, 'stable');
    assert.match(group.manifestSha256, /^[0-9a-f]{64}$/u);
    assert.match(group.signatureSha256, /^[0-9a-f]{64}$/u);
  }
  assert.equal(groups.find(({ releaseGroup }) => releaseGroup === SEALED_GROUP).resolvableIdentifiersVerified, 2);

  // The listener's own log, not the gate's report: proof the sweep happened.
  const fetched = new Set(requests.filter(({ status }) => status === 200).map(({ target }) => target));
  for (const [path] of [...SEALED, ...IMPLEMENTATIONS]) assert.ok(fetched.has(`/${path}`), `${path} must be fetched`);
  assert.ok(fetched.has(`/${fixture.publicKeyPath}`), 'the published key must be fetched');
  const refused = requests.filter(({ status }) => status === 404).map(({ target }) => target);
  assert.ok(refused.includes('/manifest.json'), 'the origin root manifest must be probed');
  assert.ok(refused.includes('/manifest.dsse.json'), 'the origin root sidecar must be probed');
  assert.ok(refused.includes('/profiles/sample-bundle/v1'), 'a registered prefix must be probed at its bare identifier');
});

test('the CLI writes a report and exits non-zero against a host that is wrong', async () => {
  const fixture = await signedBundle();
  const tls = selfSignedLoopbackCertificate();
  const trust = join(temporaryDirectory('jinn-verify-ca-'), 'ca.pem');
  writeFileSync(trust, tls.cert, 'utf8');
  const reportPath = join(temporaryDirectory('jinn-verify-report-'), 'nested', 'report.json');
  const script = resolve(import.meta.dirname, 'verify-live-host.mjs');

  const spawnGate = async (fault) => {
    const server = await startProfileHost({
      bundleDir: fixture.bundle,
      tls,
      fault,
      publicKey: { pem: fixture.publicKeyPem, path: fixture.publicKeyPath },
    });
    try {
      return await run(process.execPath, [
        script,
        '--bundle', fixture.bundle,
        '--repo-root', fixture.repoRoot,
        '--origin', server.origin.replace('127.0.0.1', 'localhost'),
        '--release', 'v0.1.0',
        '--out', reportPath,
      ], { env: { ...process.env, NODE_EXTRA_CA_CERTS: trust } }).then(
        ({ stdout }) => ({ status: 0, stdout }),
        (error) => ({ status: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }),
      );
    } finally {
      await server.close();
    }
  };

  const green = await spawnGate(null);
  assert.equal(green.status, 0, `${green.stdout}${green.stderr}`);
  assert.match(green.stdout, /^OK: /u);
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  assert.equal(report.release, 'v0.1.0');
  assert.equal(report.documentsVerified, SEALED.length + IMPLEMENTATIONS.length);
  assert.equal(report.probesRefused.length, 5);
  assert.deepEqual(Object.keys(report.run).sort(), ['id', 'url']);

  rmSync(reportPath);
  const red = await spawnGate('drift-one-document');
  assert.equal(red.status, 1, 'a wrong host must be a non-zero exit');
  assert.match(red.stdout, /^FAIL: /u);
  assert.equal(existsSync(reportPath), false, 'a failed verification must write no report');
});

test('each modeled host defect is a refusal, and a charset parameter is not', async () => {
  const fixture = await signedBundle();
  const verdicts = new Map();
  for (const fault of [
    'redirect-trailing-slash', 'spa-catchall', 'mistype-extensionless',
    'mistype-schema', 'drift-one-document', 'charset-suffix',
  ]) {
    const { result } = await verifyAgainstHost({ ...fixture, fault });
    verdicts.set(fault, result);
  }
  assert.match(verdicts.get('redirect-trailing-slash').reason, /returned 308/u);
  assert.match(verdicts.get('spa-catchall').reason, /answers 200/u);
  assert.match(verdicts.get('mistype-extensionless').reason, /application\/octet-stream/u);
  assert.match(verdicts.get('mistype-schema').reason, /expected application\/schema\+json/u);
  assert.match(verdicts.get('drift-one-document').reason, /bytes differ/u);
  for (const fault of ['redirect-trailing-slash', 'spa-catchall', 'mistype-extensionless', 'mistype-schema', 'drift-one-document']) {
    assert.equal(verdicts.get(fault).ok, false, `${fault} must fail the gate`);
  }
  assert.equal(verdicts.get('charset-suffix').ok, true, verdicts.get('charset-suffix').reason);
});

test('an unserved key, a wrong key and an unsigned group are each a refusal', async () => {
  const withoutKey = await signedBundle();
  const noKey = await verifyAgainstHost({ ...withoutKey, publicKeyPem: null, publicKeyPath: null });
  assert.equal(noKey.result.ok, false);
  assert.match(noKey.result.reason, /returned 404, expected 200/u);

  const wrongKey = await signedBundle();
  const other = keyPair();
  const mismatched = await verifyAgainstHost({ ...wrongKey, publicKeyPem: other.publicKeyPem });
  assert.equal(mismatched.result.ok, false);
  assert.match(mismatched.result.reason, /does not verify against any key published/u);

  const unsigned = await signedBundle();
  for (const group of [SEALED_GROUP, IMPLEMENTATIONS_GROUP]) {
    rmSync(join(unsigned.bundle, group, SIGNATURE_FILE_NAME));
  }
  const missing = await verifyAgainstHost(unsigned);
  assert.equal(missing.result.ok, false);
  assert.match(missing.result.reason, /a live host must serve a signed manifest/u);
});

test('a bundle that carries fewer groups than the inventory declares is a refusal', async () => {
  const fixture = await signedBundle();
  rmSync(join(fixture.bundle, IMPLEMENTATIONS_GROUP), { recursive: true, force: true });
  const { result } = await verifyAgainstHost(fixture);
  assert.equal(result.ok, false);
  assert.match(result.reason, /but the inventory declares/u);
});

test('a cleartext origin and an unreachable origin are both fatal, never skipped', async () => {
  const fixture = await signedBundle();
  const cleartext = await verifyLiveHost({
    bundleDir: fixture.bundle,
    repoRoot: fixture.repoRoot,
    origin: 'http://localhost:1',
  });
  assert.equal(cleartext.ok, false);
  assert.match(cleartext.reason, /must be https/u);

  const unreachable = await verifyLiveHost({
    bundleDir: fixture.bundle,
    repoRoot: fixture.repoRoot,
    origin: 'https://localhost:1',
    fetch: async () => { throw new Error('ECONNREFUSED'); },
    attempts: 1,
    retryDelayMs: 0,
  });
  assert.equal(unreachable.ok, false, 'an unreachable origin must fail, never pass');
  assert.match(unreachable.reason, /network error/u);
});

// --- the gate, against this repository's own release groups ------------------

test('this repository builds, bundles and verifies end to end over a real socket', async () => {
  const { buildProfileRoot, loadInventory, releaseGroupNames } = await import('./build-profile-root.mjs');
  const roots = temporaryDirectory('jinn-verify-real-roots-');
  const { privateKeyPem, publicKeyPem } = keyPair();
  const keyId = 'jinn-profile-manifest-test';
  const profileRoots = [];
  for (const releaseGroup of releaseGroupNames(loadInventory(repoRoot))) {
    const outDir = join(roots, releaseGroup);
    buildProfileRoot({ repoRoot, outDir, releaseGroup, lane: 'stable' });
    const envelope = signManifest(readFileSync(join(outDir, 'manifest.json')), privateKeyPem, keyId);
    writeFileSync(join(outDir, SIGNATURE_FILE_NAME), `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
    profileRoots.push(outDir);
  }
  const bundle = join(temporaryDirectory('jinn-verify-real-bundle-'), 'out');
  buildProfileHostBundle({ profileRoots, outDir: bundle });
  const publicKeyPath = `keys/${keyId}.pem`;
  mkdirSync(join(bundle, 'keys'), { recursive: true });
  writeFileSync(join(bundle, ...publicKeyPath.split('/')), publicKeyPem, 'utf8');

  const { result, requests } = await verifyAgainstHost({ bundle, repoRoot, publicKeyPem, publicKeyPath });
  assert.equal(result.ok, true, result.reason);

  // The listener's own log, not the gate's report: every declared document of every group
  // was fetched and answered, and the anti-fallback probes were refused.
  const answered = new Set(requests.filter(({ status }) => status === 200).map(({ target }) => target));
  for (const group of discoverBundleGroups(bundle)) {
    for (const { path } of group.manifest.documents) assert.ok(answered.has(`/${path}`), `${path} must be fetched`);
    assert.ok(answered.has(`/${group.name}/manifest.json`));
    assert.ok(answered.has(`/${group.name}/${SIGNATURE_FILE_NAME}`));
  }
  assert.ok(answered.has(`/${publicKeyPath}`));
  assert.equal(result.report.documentsVerified, 535);
  const refused = requests.filter(({ status }) => status === 404).map(({ target }) => target);
  assert.ok(refused.includes('/manifest.json'));
  assert.ok(refused.includes('/manifest.dsse.json'));
});
