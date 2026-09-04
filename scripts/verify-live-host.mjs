#!/usr/bin/env node
// Fail-closed live-host verification for the served origin.
//
// Building and signing a bundle is not proof that the origin serves it. This gate proves
// the second half: that `https://spec.jinn.network` answers, byte for byte, with the same
// deploy bundle the same run built, under the media types its manifests declare, behind a
// signature that verifies against a key the origin itself publishes.
//
// Design commitments, in the order they matter:
//
//   * There is no "host unreachable, skip" branch. Its absence is the design. Every step
//     is fatal; the internal retries absorb transport flakiness and can never turn a
//     failure into a pass.
//   * The local side of every comparison is the deploy bundle, because the bundle is what
//     was deployed. Comparing against anything rebuilt here would prove the rebuild, not
//     the deployment.
//   * Every release group the inventory declares must be present in the bundle and
//     verified. A release that deployed one group and dropped the other would otherwise
//     pass on the half it kept.
//   * Identity and location are separate. A document's claimed identifier is a property
//     of its bytes, so every identifier resolves against `IDENTIFIER_ORIGIN`; the served
//     path that yields is then fetched at the origin under verification. The same bundle
//     served at a preview URL still claims spec.jinn.network.
//   * Anti-fallback probes run last and are load-bearing: a single-page-application
//     catch-all answering 200 for every path would make every check above vacuous.
//   * Media types compare on type/subtype only. A host appending `charset=utf-8` is
//     conformant; a host serving an extensionless profile as `application/octet-stream`
//     is the failure this gate exists to catch, and that is a type/subtype difference.
//
// Pure logic (origin normalization, media-type comparison, key-path derivation, public-key
// digesting, identifier re-derivation) is exported, never throws, and does no I/O, so the
// test suite drives it offline. The socket half of the suite drives the whole gate against
// `serve-profile-host.mjs` over loopback TLS. The CLI entry is guarded so `import` is
// side-effect-free.

import { createHash, createPublicKey, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  IDENTIFIER_ORIGIN as IDENTIFIER_ORIGIN_WITH_SLASH,
  MANIFEST_FILE_NAME,
  identifierServedPath,
  loadInventory,
  releaseGroupNames,
} from './build-profile-root.mjs';
import {
  MANIFEST_MEDIA_TYPE,
  assertLiteralRoutePath,
  assertReleaseGroupSegment,
} from './build-profile-host-bundle.mjs';
import { PAYLOAD_TYPE, SIGNATURE_FILE_NAME, verifyEnvelope } from './sign-profile-manifest.mjs';

/** The origin every hosted protocol identifier names, imported rather than restated. */
export const IDENTIFIER_ORIGIN = IDENTIFIER_ORIGIN_WITH_SLASH.replace(/\/+$/u, '');
/** The origin this repository publishes. It is a default, not a hardcoding: `--origin` overrides it. */
export const DEFAULT_ORIGIN = IDENTIFIER_ORIGIN;
/** The directory the release workflow publishes the signing key's public half under. */
export const PUBLIC_KEY_DIRECTORY = 'keys';

export { MANIFEST_FILE_NAME, SIGNATURE_FILE_NAME };

// --- pure logic (no I/O, never throws) --------------------------------------

/** @returns {{ origin: string } | { error: string }} */
export function normalizeOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') return { error: 'origin is required' };
  const trimmed = value.trim().replace(/\/+$/u, '');
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: `origin is not a URL: ${value}` };
  }
  // A protocol origin served over cleartext is not the thing being verified.
  if (parsed.protocol !== 'https:') return { error: `origin must be https, got ${value}` };
  if (parsed.origin !== trimmed) return { error: `origin must be a bare https origin, got ${value}` };
  return { origin: parsed.origin };
}

/** Type/subtype of a Content-Type header, lowercased, parameters dropped. */
export function parseMediaType(value) {
  if (typeof value !== 'string') return null;
  const base = value.split(';')[0].trim().toLowerCase();
  return base === '' ? null : base;
}

export function mediaTypeMatches(headerValue, expected) {
  const actual = parseMediaType(headerValue);
  return actual !== null && actual === parseMediaType(expected);
}

/**
 * Where the origin publishes the public half of one signing key.
 *
 * The key id comes out of the signature sidecar, which is a fetched document, so it is
 * untrusted input that is about to be concatenated into a URL. Requiring it to be one
 * literal path segment that survives `encodeURIComponent` unchanged is what stops a
 * crafted key id from addressing something else: anything carrying a slash, a
 * percent-escape or a dot segment re-encodes and is refused rather than resolved.
 * @returns {{ servedPath: string } | { error: string }}
 */
export function publicKeyServedPath(keyId) {
  if (typeof keyId !== 'string' || keyId === '') return { error: 'signature key id must be a non-empty string' };
  if (keyId === '.' || keyId === '..' || keyId.includes('/') || encodeURIComponent(keyId) !== keyId) {
    return { error: `signature key id must be a literal URL segment: ${keyId}` };
  }
  const servedPath = `${PUBLIC_KEY_DIRECTORY}/${keyId}.pem`;
  try {
    assertLiteralRoutePath(servedPath, 'published public key path');
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }
  return { servedPath };
}

/**
 * Canonical SHA-256 of a public key: the key is re-exported as SPKI PEM before digesting,
 * so line endings and trailing whitespace in the published file cannot change the value.
 * @returns {{ sha256: string, pem: string } | { error: string }}
 */
export function canonicalPublicKeySha256(pem) {
  let key;
  try {
    key = createPublicKey(pem);
  } catch (error) {
    return { error: `published public key is not a readable key: ${error?.message ?? String(error)}` };
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    return { error: `published public key must be ed25519, got ${String(key.asymmetricKeyType)}` };
  }
  const canonical = key.export({ type: 'spki', format: 'pem' }).toString();
  return { sha256: createHash('sha256').update(canonical).digest('hex'), pem: canonical };
}

/**
 * Resolve one identifier to the served path it must be answered at.
 * The path rule lives in the profile builder and is reused here, never restated.
 * @returns {{ servedPath: string } | { error: string }}
 */
export function servedPathForIdentifier(identifier, label = 'Jinn identifier') {
  try {
    return { servedPath: identifierServedPath(identifier, label) };
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }
}

/**
 * A served document's self-identifying claim.
 *
 * JSON only, and fixtures excluded: a fixture's `profile` names the vocabulary the record
 * instance conforms to, not where the fixture is served.
 * @returns {{ identifier: string, field: string } | { error: string } | null}
 */
export function selfIdentifyingClaim(servedPath, bytes) {
  if (!servedPath.endsWith('.json') || servedPath.split('/').includes('fixtures')) return null;
  let document;
  try {
    document = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return { error: `${servedPath} is served as JSON but does not parse` };
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;
  const claims = [];
  for (const field of ['$id', 'profile']) {
    const identifier = document[field];
    if (typeof identifier === 'string' && identifier.startsWith(IDENTIFIER_ORIGIN_WITH_SLASH)) {
      claims.push({ field, identifier });
    }
  }
  if (claims.length > 1) {
    return { error: `${servedPath} declares multiple self-identifying claims under ${IDENTIFIER_ORIGIN}` };
  }
  return claims[0] ?? null;
}

// --- I/O shell (fetch injected; default global fetch) -----------------------

const sleep = (ms) => (ms > 0 ? new Promise((done) => { setTimeout(done, ms); }) : Promise.resolve());

const sha256Of = (bytes) => createHash('sha256').update(bytes).digest('hex');

const transportRetryable = (status) => status === 429 || status === 408 || status >= 500;

/**
 * Discover the release groups a deploy bundle carries.
 *
 * Each group's inventory lives at `<group>/manifest.json`, so an immediate subdirectory is
 * a group exactly when the manifest inside it names *that* directory. A document that
 * happens to be served at `profiles/manifest.json` names something else and stays a
 * document. The bundle's `vercel.json` is host configuration, never the inventory, and is
 * not read here.
 * @returns {Array<{ name, manifest, manifestBytes }>} sorted by group name
 */
export function discoverBundleGroups(bundleDir) {
  const root = resolve(bundleDir);
  if (!existsSync(root)) throw new Error(`deploy bundle does not exist: ${bundleDir}`);
  const groups = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const manifestPath = join(root, entry.name, MANIFEST_FILE_NAME);
    if (!existsSync(manifestPath)) continue;
    const manifestBytes = readFileSync(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch {
      continue;
    }
    if (manifest?.releaseGroup !== entry.name) continue;
    if (!Array.isArray(manifest.documents) || manifest.documents.length === 0) {
      throw new Error(`bundled release group ${entry.name} declares no documents`);
    }
    groups.push({ name: entry.name, manifest, manifestBytes });
  }
  groups.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return groups;
}

/**
 * One exact GET. Redirects are never followed: a redirect is a hosting defect, so it must
 * surface as a non-200 status rather than be silently resolved. Retries absorb transport
 * flakiness only; a 2xx, 3xx or ordinary 4xx answer is returned as-is on the first attempt.
 * @returns {{ status, redirected, headers, bytes } | { error: string }}
 */
async function getExact(url, { fetchImpl, timeoutMs, attempts, retryDelayMs }) {
  let last = `GET ${url} failed`;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (transportRetryable(response.status) && attempt < attempts) {
        last = `GET ${url} returned ${response.status}`;
        await sleep(retryDelayMs);
        continue;
      }
      return {
        status: response.status,
        redirected: response.redirected === true,
        headers: response.headers,
        bytes: Buffer.from(await response.arrayBuffer()),
      };
    } catch (error) {
      last = `GET ${url} network error: ${error?.message ?? String(error)}`;
      if (attempt < attempts) await sleep(retryDelayMs);
    }
  }
  return { error: last };
}

/** A fetched document must be 200, undirected, exact media type and exact bytes. */
function checkServedResponse(response, url, { mediaType, bytes }) {
  if (response.error) return response.error;
  if (response.status !== 200) return `${url} returned ${response.status}, expected 200`;
  if (response.redirected) return `${url} was redirected; the host must serve manifest paths exactly`;
  const contentType = response.headers?.get?.('content-type');
  if (!mediaTypeMatches(contentType, mediaType)) {
    return `${url} served content-type ${String(contentType)}, expected ${mediaType}`;
  }
  if (Buffer.compare(response.bytes, bytes) !== 0) {
    return `${url} bytes differ from the deployed bundle (served sha256 ${sha256Of(response.bytes)}, bundled ${sha256Of(bytes)})`;
  }
  return null;
}

/** Run `worker` over `items` with bounded concurrency, stopping at the first failure. */
async function pooled(items, limit, worker) {
  let cursor = 0;
  let failure = null;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const reason = await worker(items[index]);
      if (reason) failure = reason;
    }
  });
  await Promise.all(runners);
  return failure;
}

const fail = (reason) => ({ ok: false, reason });

/** Verify one release group of the bundle against the origin. */
async function verifyGroup({
  group, bundleRoot, origin, registered, options, once, concurrency,
}) {
  const { name, manifest, manifestBytes } = group;
  try {
    assertReleaseGroupSegment(name);
  } catch (error) {
    return { error: error?.message ?? String(error) };
  }

  // --- the hosted manifest -------------------------------------------------
  const manifestUrl = `${origin}/${name}/${MANIFEST_FILE_NAME}`;
  const hostedManifest = await getExact(manifestUrl, options);
  const manifestFailure = checkServedResponse(hostedManifest, manifestUrl, {
    mediaType: MANIFEST_MEDIA_TYPE,
    bytes: manifestBytes,
  });
  if (manifestFailure) return { error: manifestFailure };

  // --- the hosted signature and the published keys --------------------------
  const localSignaturePath = join(bundleRoot, name, SIGNATURE_FILE_NAME);
  if (!existsSync(localSignaturePath)) {
    return { error: `deploy bundle has no ${name}/${SIGNATURE_FILE_NAME}; a live host must serve a signed manifest` };
  }
  const localSignatureBytes = readFileSync(localSignaturePath);
  const signatureUrl = `${origin}/${name}/${SIGNATURE_FILE_NAME}`;
  const hostedSignature = await getExact(signatureUrl, options);
  const signatureFailure = checkServedResponse(hostedSignature, signatureUrl, {
    mediaType: MANIFEST_MEDIA_TYPE,
    bytes: localSignatureBytes,
  });
  if (signatureFailure) return { error: signatureFailure };

  let envelope;
  try {
    envelope = JSON.parse(hostedSignature.bytes.toString('utf8'));
  } catch {
    return { error: `${signatureUrl} is not valid JSON` };
  }
  if (envelope?.payloadType !== PAYLOAD_TYPE) {
    return { error: `${signatureUrl} payload type is ${String(envelope?.payloadType)}, expected ${PAYLOAD_TYPE}` };
  }
  if (typeof envelope.payload !== 'string') return { error: `${signatureUrl} payload must be a base64 string` };
  // The envelope must cover the bytes the host serves, not merely bytes that hash the same
  // way somewhere else.
  if (Buffer.compare(Buffer.from(envelope.payload, 'base64'), hostedManifest.bytes) !== 0) {
    return { error: `${signatureUrl} does not envelope the exact bytes the host serves at ${manifestUrl}` };
  }
  if (!Array.isArray(envelope.signatures) || envelope.signatures.length === 0) {
    return { error: `${signatureUrl} carries no signature` };
  }
  const keyIds = [...new Set(envelope.signatures.map(({ keyid }) => keyid))];
  if (keyIds.some((keyId) => typeof keyId !== 'string' || keyId.length === 0)) {
    return { error: `${signatureUrl} does not name its key id` };
  }

  const publicKeys = [];
  let verified = false;
  for (const keyId of keyIds) {
    const derived = publicKeyServedPath(keyId);
    if (derived.error) return { error: `${signatureUrl}: ${derived.error}` };
    const keyUrl = `${origin}/${derived.servedPath}`;
    const response = await getExact(keyUrl, options);
    if (response.error) return { error: response.error };
    if (response.status !== 200) {
      return { error: `${keyUrl} returned ${response.status}, expected 200; the origin must publish the signing key` };
    }
    // The key's own media type is not asserted. It is a published byte string, not a
    // protocol document, and it carries no route in the generated host configuration.
    const publicKey = canonicalPublicKeySha256(response.bytes.toString('utf8'));
    if (publicKey.error) return { error: `${keyUrl}: ${publicKey.error}` };
    publicKeys.push({ keyId, url: keyUrl, sha256: publicKey.sha256 });
    if (verifyEnvelope(envelope, publicKey.pem)) verified = true;
  }
  if (!verified) {
    return { error: `${signatureUrl} does not verify against any key published under ${origin}/${PUBLIC_KEY_DIRECTORY}/` };
  }

  // --- every document, and its own self-identifying claim -------------------
  const documentFailure = await pooled(manifest.documents, concurrency, async ({ path, sha256, mediaType }) => {
    try {
      assertLiteralRoutePath(path, 'profile manifest document path');
    } catch (error) {
      return error?.message ?? String(error);
    }
    const localPath = join(bundleRoot, ...path.split('/'));
    if (!existsSync(localPath)) return `deploy bundle is missing declared document ${path}`;
    const localBytes = readFileSync(localPath);
    if (sha256Of(localBytes) !== sha256) {
      return `deploy bundle document ${path} does not match its own manifest digest`;
    }
    const url = `${origin}/${path}`;
    const response = await getExact(url, options);
    const failure = checkServedResponse(response, url, { mediaType, bytes: localBytes });
    if (failure) return failure;

    const claim = selfIdentifyingClaim(path, response.bytes);
    if (claim?.error) return claim.error;
    if (claim) {
      const derived = servedPathForIdentifier(claim.identifier, `${path} ${claim.field}`);
      if (derived.error) return derived.error;
      if (derived.servedPath !== path) {
        return `${url} declares ${claim.field} ${claim.identifier}, which resolves to ${derived.servedPath}, not ${path}`;
      }
    }
    return null;
  });
  if (documentFailure) return { error: documentFailure };

  // --- the registered identifiers actually dereference ----------------------
  const servedPaths = new Set(manifest.documents.map(({ path }) => path));
  for (const entry of registered) {
    const derived = servedPathForIdentifier(entry.identifier, `resolvableIdentifiers ${entry.identifier}`);
    if (derived.error) return { error: derived.error };
    const declared = manifest.documents.find(({ path }) => path === entry.entryPoint);
    if (!declared) {
      return { error: `${entry.identifier} names entry point ${entry.entryPoint}, which is not a served document` };
    }
    const entryBytes = readFileSync(join(bundleRoot, ...declared.path.split('/')));
    if (entry.resolution === 'document') {
      if (derived.servedPath !== entry.entryPoint) {
        return { error: `${entry.identifier} resolves to ${derived.servedPath}, not its entry point ${entry.entryPoint}` };
      }
    } else if (entry.resolution === 'prefix') {
      if (servedPaths.has(derived.servedPath)) {
        return { error: `${entry.identifier} is registered as a prefix but the manifest serves a document at it` };
      }
      // A bare prefix must not answer 200. One probe, never retried: a 200 here is a
      // verdict, not flakiness.
      const bare = await getExact(`${origin}/${derived.servedPath}`, once);
      if (bare.error) return { error: bare.error };
      if (bare.status === 200) {
        return { error: `${origin}/${derived.servedPath} is a registered prefix but the host answers 200 at the bare identifier` };
      }
    } else {
      return { error: `${entry.identifier} declares unknown resolution ${String(entry.resolution)}` };
    }
    const entryUrl = `${origin}/${entry.entryPoint}`;
    const response = await getExact(entryUrl, options);
    const failure = checkServedResponse(response, entryUrl, {
      mediaType: declared.mediaType,
      bytes: entryBytes,
    });
    if (failure) return { error: failure };
  }

  return {
    releaseGroup: name,
    lane: manifest.lane ?? null,
    manifestSha256: sha256Of(manifestBytes),
    signatureSha256: sha256Of(localSignatureBytes),
    keyIds,
    publicKeys,
    documentsVerified: manifest.documents.length,
    resolvableIdentifiersVerified: registered.length,
  };
}

export async function verifyLiveHost({
  bundleDir,
  repoRoot = process.cwd(),
  origin: requestedOrigin = DEFAULT_ORIGIN,
  release = null,
  fetch: fetchImpl = globalThis.fetch,
  concurrency = 8,
  timeoutMs = 20000,
  attempts = 3,
  retryDelayMs = 500,
  run = {},
  now = () => new Date(),
}) {
  const resolvedOrigin = normalizeOrigin(requestedOrigin);
  if (resolvedOrigin.error) return fail(resolvedOrigin.error);
  const origin = resolvedOrigin.origin;
  const options = { fetchImpl, timeoutMs, attempts, retryDelayMs };
  const once = { fetchImpl, timeoutMs, attempts: 1, retryDelayMs: 0 };

  const bundleRoot = resolve(bundleDir);
  let groups;
  let inventory;
  try {
    groups = discoverBundleGroups(bundleRoot);
    inventory = loadInventory(resolve(repoRoot));
  } catch (error) {
    return fail(error?.message ?? String(error));
  }
  if (groups.length === 0) {
    return fail(`deploy bundle has no ${MANIFEST_FILE_NAME} in any immediate subdirectory: ${bundleDir}`);
  }
  // A release deploys the whole origin, so a bundle that carries fewer groups than the
  // inventory declares is a partial deployment, not a smaller release.
  const declared = releaseGroupNames(inventory).slice().sort();
  const bundled = groups.map(({ name }) => name);
  if (declared.join(',') !== bundled.join(',')) {
    return fail(`deploy bundle carries release groups ${bundled.join(', ')}, but the inventory declares ${declared.join(', ')}`);
  }

  const registerFor = (name) => {
    const entry = inventory.releaseGroups.find(({ releaseGroup }) => releaseGroup === name);
    return entry?.resolvableIdentifiers ?? [];
  };

  const verifiedGroups = [];
  for (const group of groups) {
    const result = await verifyGroup({
      group,
      bundleRoot,
      origin,
      registered: registerFor(group.name),
      options,
      once,
      concurrency,
    });
    if (result.error) return fail(result.error);
    verifiedGroups.push(result);
  }

  // --- anti-fallback probes -------------------------------------------------
  // A catch-all that answers 200 for everything makes every check above vacuous. The last
  // two probes are not about catch-alls: the origin root carries neither manifest nor
  // sidecar, because either would be one release group's inventory answering for every
  // group, so a 200 there is a stale single-group deployment rather than a guessing host.
  const catchAll = 'the host has a catch-all that makes byte verification vacuous';
  const probes = [
    { url: `${origin}/${randomUUID()}`, reason: catchAll },
    { url: `${origin}/${bundled[0]}/${MANIFEST_FILE_NAME}.sha256`, reason: catchAll },
    { url: `${origin}/@jinn-network/not-a-published-package-${randomUUID()}/package.json`, reason: catchAll },
    {
      url: `${origin}/${MANIFEST_FILE_NAME}`,
      reason: 'the origin root must serve no manifest; each release group serves its own',
    },
    {
      url: `${origin}/${SIGNATURE_FILE_NAME}`,
      reason: 'the origin root must serve no signature sidecar; each release group serves its own',
    },
  ];
  for (const { url, reason } of probes) {
    const response = await getExact(url, once);
    if (response.error) return fail(`anti-fallback probe could not be completed: ${response.error}`);
    if (response.status === 200) return fail(`${url} answers 200; ${reason}`);
  }

  const documentsVerified = verifiedGroups.reduce((total, { documentsVerified: count }) => total + count, 0);
  return {
    ok: true,
    reason: `${origin} serves ${documentsVerified} documents and a verifying signature for ${bundled.join(', ')}`,
    report: {
      schemaVersion: 1,
      origin,
      release,
      groups: verifiedGroups,
      documentsVerified,
      probesRefused: probes.map(({ url }) => url),
      run: { id: run.id ?? null, url: run.url ?? null },
      verifiedAt: now().toISOString(),
    },
  };
}

// --- CLI entry (guarded so `import` is side-effect-free) ---------------------

export function parseArgs(argv) {
  const fields = new Map([
    ['--bundle', 'bundleDir'],
    ['--repo-root', 'repoRoot'],
    ['--origin', 'origin'],
    ['--release', 'release'],
    ['--out', 'outputPath'],
  ]);
  const parsed = { repoRoot: process.cwd(), origin: DEFAULT_ORIGIN, release: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const field = fields.get(flag);
    if (!field) throw new Error(`unknown argument: ${flag}`);
    if (value === undefined) throw new Error(`${flag} requires a value`);
    parsed[field] = value;
  }
  for (const [field, flag] of [['bundleDir', '--bundle'], ['outputPath', '--out']]) {
    if (!parsed[field]) throw new Error(`${flag} is required`);
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    const args = parseArgs(process.argv.slice(2));
    result = await verifyLiveHost({
      ...args,
      run: {
        id: process.env.GITHUB_RUN_ID ?? null,
        url: process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
          ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
          : null,
      },
    });
    if (result.ok) {
      const outputPath = resolve(args.outputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(result.report, null, 2)}\n`, 'utf8');
    }
  } catch (error) {
    result = fail(error?.message ?? String(error));
  }
  console.log(result.ok ? `OK: ${result.reason}` : `FAIL: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}
