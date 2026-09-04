#!/usr/bin/env node
// Build one release group's profile root: the served documents of that group plus the
// group manifest that inventories them.
//
// The inventory is `inventory.json` beside the tree under `documents/`. It names, per
// release group, the served-path prefixes the group may use and every document in it,
// with the document's media type and the package that produced it. Digests are never
// written by hand: this script hashes the bytes under `documents/` and the manifest it
// writes is the result. Running it over an unchanged tree reproduces
// `manifests/<group>/manifest.json` byte for byte, which is what the test suite asserts
// and what makes an edit to a served document impossible to land without its digest.
//
// A media type cannot be derived from a served path here. Forty-two served documents
// carry no file extension, and the type of those was decided by the name of the file the
// document was produced from, which this repository does not keep. The inventory carries
// the media type instead.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32,
} from 'node:path';
import { pathToFileURL } from 'node:url';

export const INVENTORY_PATH = 'inventory.json';
export const DOCUMENTS_DIRECTORY = 'documents';
export const MANIFEST_FILE_NAME = 'manifest.json';
export const IDENTIFIER_ORIGIN = 'https://spec.jinn.network/';

// The set a served document may declare. Anything else is a typo or a new kind of
// document that has not been thought about, and either way it should stop the build
// rather than reach a host as `application/octet-stream` by accident.
export const MEDIA_TYPES = new Set([
  'application/schema+json',
  'application/ld+json',
  'application/json',
  'text/markdown',
  'text/plain',
  'application/octet-stream',
]);

// Files the profile root generates for itself. A document may not claim either name.
const GENERATED_PROFILE_ROOT_PATHS = new Set([MANIFEST_FILE_NAME, 'manifest.dsse.json']);

export function loadInventory(repoRoot) {
  const path = join(repoRoot, INVENTORY_PATH);
  let inventory;
  try {
    inventory = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`${INVENTORY_PATH} is not readable JSON: ${error?.message ?? String(error)}`);
  }
  if (inventory.version !== 1) throw new Error(`${INVENTORY_PATH} must declare version 1`);
  if (!Array.isArray(inventory.releaseGroups) || inventory.releaseGroups.length === 0) {
    throw new Error(`${INVENTORY_PATH} declares no release groups`);
  }
  return inventory;
}

export function inventorySha256(repoRoot) {
  return createHash('sha256').update(readFileSync(join(repoRoot, INVENTORY_PATH))).digest('hex');
}

export function releaseGroupNames(inventory) {
  return inventory.releaseGroups.map(({ releaseGroup }) => releaseGroup);
}

function selectReleaseGroup(inventory, requested) {
  const groups = inventory.releaseGroups;
  if (requested === undefined) {
    if (groups.length !== 1) {
      throw new Error(
        `--release-group is required: ${INVENTORY_PATH} declares ${releaseGroupNames(inventory).join(', ')}`,
      );
    }
    return groups[0];
  }
  const group = groups.find((entry) => entry.releaseGroup === requested);
  if (!group) {
    throw new Error(
      `unknown release group ${requested}: ${INVENTORY_PATH} declares ${releaseGroupNames(inventory).join(', ')}`,
    );
  }
  return group;
}

/**
 * The relative served path a `https://spec.jinn.network/` identifier addresses.
 *
 * A protocol identifier is a name first and a locator second, so this refuses anything
 * that would resolve to a different byte sequence than it reads as: another origin, a
 * query or fragment, a percent-escape, a backslash, a dot segment, or one of the names
 * the profile root generates for itself.
 */
export function identifierServedPath(identifier, label = 'identifier') {
  const invalid = () => {
    throw new Error(`${label} must name a canonical relative ${IDENTIFIER_ORIGIN} path`);
  };
  if (typeof identifier !== 'string'
    || !identifier.startsWith(IDENTIFIER_ORIGIN)
    || identifier.includes('?')
    || identifier.includes('#')
    || identifier.includes('%')
    || identifier.includes('\\')) invalid();

  let parsed;
  try {
    parsed = new URL(identifier);
  } catch {
    invalid();
  }
  if (parsed.href !== identifier || `${parsed.origin}/` !== IDENTIFIER_ORIGIN) invalid();

  const servedPath = identifier.slice(IDENTIFIER_ORIGIN.length);
  const segments = servedPath.split('/');
  if (servedPath === ''
    || isAbsolute(servedPath)
    || win32.isAbsolute(servedPath)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || GENERATED_PROFILE_ROOT_PATHS.has(servedPath)) invalid();
  return servedPath;
}

// A served path can be a document or a directory prefix, never both: no host can serve
// bytes at a URL that is also a directory. Without this the build fails later at
// copyFileSync with an opaque ENOTDIR.
export function assertNoPrefixCollision(documents) {
  const paths = new Set(documents.map(({ path }) => path));
  for (const path of paths) {
    const segments = path.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      const ancestor = segments.slice(0, index).join('/');
      if (paths.has(ancestor)) {
        throw new Error(`${ancestor} is both a document and a directory prefix of ${path}`);
      }
    }
  }
}

// Most https://spec.jinn.network/ URIs in the corpus are names, not locators -- values a
// reader compares rather than fetches. The register declares the ones that must
// dereference, so "does this identifier resolve" is a checked claim rather than an
// argument.
export function assertRegisteredIdentifiersResolve(register, documents) {
  const paths = new Set(documents.map(({ path }) => path));
  for (const entry of register ?? []) {
    const servedPath = identifierServedPath(entry.identifier, `resolvableIdentifiers ${entry.identifier}`);
    if (entry.resolution !== 'document' && entry.resolution !== 'prefix') {
      throw new Error(`${entry.identifier} declares unknown resolution ${entry.resolution}`);
    }
    if (servedPath !== entry.entryPoint && entry.resolution === 'document') {
      throw new Error(
        `${entry.identifier} is registered as a document but its entry point ${entry.entryPoint} is not its served path ${servedPath}`,
      );
    }
    if (!paths.has(entry.entryPoint)) {
      throw new Error(`${entry.identifier} resolves to no served document at ${entry.entryPoint}`);
    }
    if (entry.resolution === 'prefix') {
      if (paths.has(servedPath)) {
        throw new Error(`${entry.identifier} is registered as a prefix but a document is served at it`);
      }
      // A prefix must contain its own entry point. Existing somewhere in the tree is not
      // enough: an entry point outside the prefix means the identifier addresses one part
      // of the profile while its declared entry lives at another, and every relative
      // reference inside resolves against the wrong root.
      if (!entry.entryPoint.startsWith(`${servedPath}/`)) {
        throw new Error(
          `${entry.identifier} is registered as a prefix but its entry point ${entry.entryPoint} is not inside ${servedPath}/`,
        );
      }
    }
  }
}

export function assertPrefixDeclaration(group) {
  const prefixes = group.servedPathPrefixes ?? [];
  if (prefixes.length === 0) {
    throw new Error(`release group ${group.releaseGroup} declares no served path prefixes`);
  }
  for (const prefix of prefixes) {
    if (typeof prefix !== 'string' || !prefix.endsWith('/') || prefix.startsWith('/')) {
      throw new Error(`served path prefix must be a relative path ending in a slash: ${prefix}`);
    }
  }
  if (!Array.isArray(group.packages) || group.packages.length === 0) {
    throw new Error(`release group ${group.releaseGroup} declares no packages`);
  }
  return prefixes;
}

// A coarse claim, checked: a release group says which parts of the served namespace it
// occupies, so a document that wanders into another group's part of the origin is a
// build failure rather than a routing surprise at deploy time.
export function assertDocumentsUnderPrefixes(group, documents) {
  const prefixes = group.servedPathPrefixes ?? [];
  for (const { path } of documents) {
    if (!prefixes.some((prefix) => path.startsWith(prefix))) {
      throw new Error(`${path} is under no served path prefix declared by ${group.releaseGroup}`);
    }
  }
}

function isStrictlyInside(child, parent) {
  const path = relative(parent, child);
  return path !== '' && path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function prepareOutputRoot(outDir) {
  const outputRoot = resolve(outDir);
  let stat = lstatIfPresent(outputRoot);
  if (!stat) {
    mkdirSync(outputRoot, { recursive: true });
    stat = lstatSync(outputRoot);
  }
  if (stat.isSymbolicLink()) throw new Error(`output root must not be a symbolic link: ${outDir}`);
  if (!stat.isDirectory()) throw new Error(`output root must be a real directory: ${outDir}`);
  return realpathSync(outputRoot);
}

function preflightOutputTarget(outputRoot, servedPath) {
  const target = resolve(outputRoot, ...servedPath.split('/'));
  if (!isStrictlyInside(target, outputRoot)) {
    throw new Error(`output target must remain strictly inside the output root: ${servedPath}`);
  }

  const segments = servedPath.split('/');
  let current = outputRoot;
  for (const [index, segment] of segments.slice(0, -1).entries()) {
    current = join(current, segment);
    const stat = lstatIfPresent(current);
    if (!stat) break;
    const partial = segments.slice(0, index + 1).join('/');
    if (stat.isSymbolicLink()) throw new Error(`output path ${partial} contains a symbolic link`);
    if (!stat.isDirectory()) throw new Error(`output path ${partial} must be a real directory`);
    if (!isStrictlyInside(realpathSync(current), outputRoot)) {
      throw new Error(`output path ${partial} escapes the output root`);
    }
  }

  const targetStat = lstatIfPresent(target);
  if (targetStat) {
    if (targetStat.isSymbolicLink()) throw new Error(`output target ${servedPath} is a symbolic link`);
    if (!targetStat.isFile()) throw new Error(`output target ${servedPath} must be a regular file`);
  }
  return target;
}

function sourcePathFor(repoRoot, servedPath) {
  const documentsRoot = resolve(repoRoot, DOCUMENTS_DIRECTORY);
  const source = resolve(documentsRoot, ...servedPath.split('/'));
  if (!isStrictlyInside(source, documentsRoot)) {
    throw new Error(`served path escapes ${DOCUMENTS_DIRECTORY}/: ${servedPath}`);
  }
  const stat = lstatIfPresent(source);
  if (!stat) throw new Error(`${DOCUMENTS_DIRECTORY}/${servedPath} is declared by the inventory but absent`);
  if (stat.isSymbolicLink()) throw new Error(`${DOCUMENTS_DIRECTORY}/${servedPath} is a symbolic link`);
  if (!stat.isFile()) throw new Error(`${DOCUMENTS_DIRECTORY}/${servedPath} is not a regular file`);
  return source;
}

/**
 * Read one release group out of the inventory and hash its documents.
 * @returns the group manifest, exactly as `manifests/<group>/manifest.json` holds it.
 */
export function profileManifest({ repoRoot, releaseGroup, commit, lane }) {
  const inventory = loadInventory(repoRoot);
  const group = selectReleaseGroup(inventory, releaseGroup);
  const boundCommit = commit ?? inventory.generatedFrom?.commit;
  if (!/^[0-9a-f]{40}$/u.test(String(boundCommit))) {
    throw new Error('commit must be a 40-character lowercase commit SHA');
  }
  if (commit !== undefined && commit !== inventory.generatedFrom?.commit) {
    throw new Error(
      `--commit ${commit} does not match the imported source commit ${inventory.generatedFrom?.commit}`,
    );
  }
  const boundLane = lane ?? group.lane;
  if (boundLane !== 'canary' && boundLane !== 'stable') {
    throw new Error(`lane must be canary or stable, got ${boundLane ?? '<missing>'}`);
  }
  assertPrefixDeclaration(group);

  const claims = new Map();
  const documents = [];
  const sources = new Map();
  for (const pkg of group.packages) {
    if (!Array.isArray(pkg.documents) || pkg.documents.length === 0) {
      throw new Error(`${pkg.name} declares no documents in ${group.releaseGroup}`);
    }
    for (const entry of pkg.documents) {
      const servedPath = entry?.path;
      const mediaType = entry?.mediaType;
      if (typeof servedPath !== 'string' || servedPath === '') {
        throw new Error(`${pkg.name} declares a document with no served path`);
      }
      if (!MEDIA_TYPES.has(mediaType)) {
        throw new Error(`${servedPath} declares unknown media type ${mediaType ?? '<missing>'}`);
      }
      if (GENERATED_PROFILE_ROOT_PATHS.has(servedPath)) {
        throw new Error(`the profile root is reserved: ${group.releaseGroup} declares a document at ${servedPath}`);
      }
      const claimed = claims.get(servedPath);
      if (claimed) throw new Error(`${servedPath} is claimed by both ${claimed} and ${pkg.name}`);
      claims.set(servedPath, pkg.name);
      const source = sourcePathFor(repoRoot, servedPath);
      sources.set(servedPath, source);
      documents.push({
        path: servedPath,
        sha256: createHash('sha256').update(readFileSync(source)).digest('hex'),
        mediaType,
        sourcePackage: pkg.name,
      });
    }
  }
  documents.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  assertNoPrefixCollision(documents);
  assertDocumentsUnderPrefixes(group, documents);
  assertRegisteredIdentifiersResolve(group.resolvableIdentifiers, documents);

  const manifest = {
    version: 1,
    generatedFrom: {
      repository: inventory.generatedFrom.repository,
      commit: boundCommit,
    },
    inventory: { path: INVENTORY_PATH, sha256: inventorySha256(repoRoot) },
    releaseGroup: group.releaseGroup,
    lane: boundLane,
    packages: group.packages.map(({ name }) => name),
    documents,
  };
  return { manifest, sources };
}

export function buildProfileRoot({ repoRoot, outDir, releaseGroup, commit, lane }) {
  const { manifest, sources } = profileManifest({ repoRoot, releaseGroup, commit, lane });
  const outputRoot = prepareOutputRoot(outDir);
  const preparedCopies = manifest.documents.map(({ path }) => ({
    source: sources.get(path),
    target: preflightOutputTarget(outputRoot, path),
  }));
  const manifestTarget = preflightOutputTarget(outputRoot, MANIFEST_FILE_NAME);
  for (const { source, target } of preparedCopies) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  writeFileSync(manifestTarget, manifestBytes(manifest), 'utf8');
  return manifest;
}

export function manifestBytes(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
    const outDir = valueOf('--out');
    const repoRoot = valueOf('--root') ?? process.cwd();
    const releaseGroup = valueOf('--release-group');
    const commit = valueOf('--commit');
    const lane = valueOf('--lane');
    if (!args.includes('--out') || !outDir) throw new Error('--out <directory> is required');
    if (args.includes('--release-group') && !releaseGroup) {
      throw new Error('--release-group <release group> requires a value');
    }
    if (args.includes('--commit') && !commit) throw new Error('--commit <40-character sha> requires a value');
    if (args.includes('--lane') && !lane) throw new Error('--lane <canary|stable> requires a value');
    const manifest = buildProfileRoot({ repoRoot, outDir, releaseGroup, commit, lane });
    console.log(`wrote ${manifest.documents.length} profile documents and ${MANIFEST_FILE_NAME} to ${outDir}`);
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}
