#!/usr/bin/env node
// Regenerate `documents/`, `inventory.json` and `manifests/` from a checkout of the
// TypeScript implementation, `Jinn-Network/mono`.
//
// Source commit of the import in this repository:
//   34359891760dc199e5688690ff3abf87f7ae51d7
//
// The first release of this repository is a byte-identical import: the served documents
// keep their bytes, their digests and their served paths, so that no record that cites
// one of them changes meaning. This script is the import, written down. Run it against a
// mono checkout and it produces the same tree it produced before, or it refuses.
//
// It refuses on any digest that differs from the reference. The reference is the mono's
// own builder, run here as a subprocess for each release group: whatever that builder
// says a document hashes to at the given commit is what the copy in `documents/` must
// hash to. A drifted byte is a failed import, never a quiet re-import.
//
// What crosses is a rule, not a list. The rules below are the whole of it. Two release
// groups are served today; the sealed group crosses almost whole, the implementations
// group crosses only in the parts that are protocol rather than implementation.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  DOCUMENTS_DIRECTORY,
  INVENTORY_PATH,
  MANIFEST_FILE_NAME,
  manifestBytes,
  profileManifest,
} from './build-profile-root.mjs';

export const SOURCE_REPOSITORY = 'Jinn-Network/mono';
export const MANIFESTS_DIRECTORY = 'manifests';
export const MONO_BUILDER = '.github/scripts/build-profile-root.mjs';

/**
 * Record kinds owned by the benchmarking product rather than by the protocol. They follow
 * the protocol's disciplines, but their owner publishes them; a second implementation
 * does not need them to meet the interoperability floor.
 */
const BENCHMARKING_PACKAGES = new Set([
  '@jinn-network/benchmarking-records',
  '@jinn-network/benchmarking-testing',
  '@jinn-network/benchmarking-protocol',
  '@jinn-network/record-discovery-facts-benchmarking',
]);

/**
 * Fixture trees captured from a first-party product run. Every vector here is derived
 * from the text or from a reference construction described in the text, so a captured
 * run does not cross even when it sits inside a package that otherwise does.
 */
const CAPTURED_FIXTURE_TREES = [
  'fixtures/autopilot-issue-1697/',
  'fixtures/swe-rebench-golden/',
];

/** The evidence repository bindings: optional binding specifications, both protocol. */
const REPOSITORY_BINDING_PACKAGES = new Set([
  '@jinn-network/evidence-repository-ipfs',
  '@jinn-network/evidence-repository-oci',
]);

/** Conformance-kit vectors that cross whole. */
const CONFORMANCE_KIT_PACKAGES = new Set([
  '@jinn-network/task-execution-testing',
  '@jinn-network/trust-testing',
]);

/**
 * The information world record. A sealed record kind outside the five named families
 * that crosses anyway: the chain environment record, which is in the specification,
 * cites it by digest, and discovery carries a facts profile for it. A second
 * implementation cannot verify the chain environment family without it. The record kind,
 * its schema and its vectors cross; the replay service that consumes it does not.
 */
const INFORMATION_WORLD_PACKAGE = '@jinn-network/information-world';

const capturedFixture = (path) => CAPTURED_FIXTURE_TREES.some(
  (tree) => path.includes(`/${tree}`) || path.startsWith(tree),
);

/**
 * The sealed group crosses whole, minus the benchmarking product's record kinds and
 * vectors and minus the captured fixture trees.
 */
export function crossesFromSealedPlatform({ path, sourcePackage }) {
  if (BENCHMARKING_PACKAGES.has(sourcePackage)) return false;
  if (capturedFixture(path)) return false;
  return true;
}

/**
 * The implementations group is mostly implementation. Four things in it are protocol:
 * the discovery facts profiles, which say which fields of each record kind a feed
 * carries; the evidence repository bindings; the conformance-kit vectors for task
 * execution and trust; and the information world record. Nothing else crosses.
 */
export function crossesFromImplementations({ path, sourcePackage }) {
  if (BENCHMARKING_PACKAGES.has(sourcePackage)) return false;
  if (capturedFixture(path)) return false;
  if (path.startsWith('facts/')) return !path.startsWith('facts/benchmark-');
  if (REPOSITORY_BINDING_PACKAGES.has(sourcePackage)) return true;
  if (CONFORMANCE_KIT_PACKAGES.has(sourcePackage)) return path.includes('/fixtures/');
  if (sourcePackage === INFORMATION_WORLD_PACKAGE) return true;
  return false;
}

export const RELEASE_GROUPS = [
  { releaseGroup: 'sealed-platform-v1', lane: 'stable', crosses: crossesFromSealedPlatform },
  { releaseGroup: 'implementations-v1', lane: 'stable', crosses: crossesFromImplementations },
];

/**
 * Identifiers that must dereference to a served document. Carried across from the
 * implementation's register so the claim stays checked here; entries whose owner does not
 * cross are dropped with the package that owned them.
 */
export const RESOLVABLE_IDENTIFIERS = [
  {
    identifier: 'https://spec.jinn.network/profiles/task-execution/v1',
    resolution: 'document',
    entryPoint: 'profiles/task-execution/v1',
    owner: '@jinn-network/task-execution-protocol',
  },
  {
    identifier: 'https://spec.jinn.network/profiles/task-profile/v1',
    resolution: 'document',
    entryPoint: 'profiles/task-profile/v1',
    owner: '@jinn-network/task-execution-profiles',
  },
  {
    identifier: 'https://spec.jinn.network/profiles/trace-vocabulary/v1',
    resolution: 'document',
    entryPoint: 'profiles/trace-vocabulary/v1',
    owner: '@jinn-network/evidence-trace',
  },
  {
    identifier: 'https://spec.jinn.network/profiles/execution-evidence/v1',
    resolution: 'prefix',
    entryPoint: 'profiles/execution-evidence/v1/specification.md',
    owner: '@jinn-network/evidence-protocol',
  },
  {
    identifier: 'https://spec.jinn.network/profiles/evidence-repository-oci/v1',
    resolution: 'prefix',
    entryPoint: 'profiles/evidence-repository-oci/v1/specification.md',
    owner: '@jinn-network/evidence-repository-oci',
  },
];

function sha256Of(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(monoRoot, ...args) {
  return execFileSync('git', ['-C', monoRoot, ...args], { encoding: 'utf8' }).trim();
}

/** Run the implementation's own builder for one group and read back its manifest. */
export function referenceManifest({ monoRoot, releaseGroup, lane, commit, workDirectory }) {
  const builder = join(monoRoot, MONO_BUILDER);
  if (!existsSync(builder)) {
    throw new Error(`${monoRoot} is not a mono checkout: no ${MONO_BUILDER}`);
  }
  const outDir = join(workDirectory, releaseGroup);
  execFileSync(process.execPath, [
    builder,
    '--root', monoRoot,
    '--out', outDir,
    '--commit', commit,
    '--release-group', releaseGroup,
    '--lane', lane,
  ], { cwd: monoRoot, stdio: ['ignore', 'ignore', 'inherit'] });
  return { root: outDir, manifest: JSON.parse(readFileSync(join(outDir, MANIFEST_FILE_NAME), 'utf8')) };
}

/** The served-path prefixes a set of documents occupies, one segment deep, or two under a scope. */
export function servedPathPrefixes(documents) {
  const prefixes = new Set();
  for (const { path } of documents) {
    const segments = path.split('/');
    const depth = segments[0].startsWith('@') ? 2 : 1;
    prefixes.add(`${segments.slice(0, depth).join('/')}/`);
  }
  return [...prefixes].sort();
}

export function inventoryFor({ commit, groups }) {
  return {
    version: 1,
    generatedFrom: { repository: SOURCE_REPOSITORY, commit },
    releaseGroups: groups.map(({ releaseGroup, lane, documents }) => {
      const byPackage = new Map();
      for (const entry of documents) {
        if (!byPackage.has(entry.sourcePackage)) byPackage.set(entry.sourcePackage, []);
        byPackage.get(entry.sourcePackage).push({ path: entry.path, mediaType: entry.mediaType });
      }
      return {
        releaseGroup,
        lane,
        servedPathPrefixes: servedPathPrefixes(documents),
        resolvableIdentifiers: RESOLVABLE_IDENTIFIERS
          .filter((entry) => byPackage.has(entry.owner))
          .map(({ identifier, resolution, entryPoint }) => ({ identifier, resolution, entryPoint })),
        packages: [...byPackage.keys()].sort().map((name) => ({
          name,
          documents: byPackage.get(name).sort((left, right) => (
            left.path < right.path ? -1 : left.path > right.path ? 1 : 0
          )),
        })),
      };
    }),
  };
}

export function importFromMono({ monoRoot, repoRoot, commit }) {
  const mono = resolve(monoRoot);
  const boundCommit = commit ?? git(mono, 'rev-parse', 'HEAD');
  if (!/^[0-9a-f]{40}$/u.test(boundCommit)) {
    throw new Error('commit must be a 40-character lowercase commit SHA');
  }
  const workDirectory = mkdtempSync(join(tmpdir(), 'jinn-spec-import-'));
  try {
    const groups = [];
    const claimed = new Map();
    for (const { releaseGroup, lane, crosses } of RELEASE_GROUPS) {
      const { root, manifest } = referenceManifest({
        monoRoot: mono, releaseGroup, lane, commit: boundCommit, workDirectory,
      });
      const documents = manifest.documents.filter(crosses);
      if (documents.length === 0) throw new Error(`${releaseGroup} contributes no documents`);
      for (const { path } of documents) {
        const owner = claimed.get(path);
        if (owner !== undefined) {
          throw new Error(`served path ${path} is claimed by both ${owner} and ${releaseGroup}`);
        }
        claimed.set(path, releaseGroup);
      }
      groups.push({ releaseGroup, lane, root, documents, total: manifest.documents.length });
    }

    // Rebuilt from nothing every run, so a document that stops crossing stops existing.
    const documentsRoot = join(repoRoot, DOCUMENTS_DIRECTORY);
    rmSync(documentsRoot, { recursive: true, force: true });
    for (const { root, documents, releaseGroup } of groups) {
      for (const { path, sha256 } of documents) {
        const source = join(root, ...path.split('/'));
        const target = join(documentsRoot, ...path.split('/'));
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
        const actual = sha256Of(readFileSync(target));
        if (actual !== sha256) {
          throw new Error(
            `${releaseGroup} document ${path} imported as ${actual}, reference says ${sha256}`,
          );
        }
      }
    }

    const inventory = inventoryFor({ commit: boundCommit, groups });
    writeFileSync(join(repoRoot, INVENTORY_PATH), `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

    // The group manifests are written by the moved builder reading `documents/` and
    // `inventory.json`, not by the import holding on to what it copied. What this
    // repository publishes is therefore what this repository's own pipeline produces, and
    // the digests are checked against the reference a second time on the way out.
    const written = [];
    for (const { releaseGroup, documents, total } of groups) {
      const { manifest } = profileManifest({ repoRoot, releaseGroup });
      if (manifest.documents.length !== documents.length) {
        throw new Error(
          `${releaseGroup} manifest covers ${manifest.documents.length} of ${documents.length} documents`,
        );
      }
      const reference = new Map(documents.map(({ path, sha256 }) => [path, sha256]));
      for (const built of manifest.documents) {
        const expected = reference.get(built.path);
        if (expected === undefined) throw new Error(`${releaseGroup} manifest adds ${built.path}`);
        if (built.sha256 !== expected) {
          throw new Error(
            `${releaseGroup} manifest digest for ${built.path} is ${built.sha256}, reference says ${expected}`,
          );
        }
      }
      const manifestPath = join(repoRoot, MANIFESTS_DIRECTORY, releaseGroup, MANIFEST_FILE_NAME);
      mkdirSync(dirname(manifestPath), { recursive: true });
      writeFileSync(manifestPath, manifestBytes(manifest), 'utf8');
      written.push({ releaseGroup, imported: manifest.documents.length, total });
    }
    return { commit: boundCommit, groups: written };
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
    const monoRoot = valueOf('--mono');
    const repoRoot = valueOf('--root') ?? resolve(import.meta.dirname, '..');
    const commit = valueOf('--commit');
    if (!monoRoot) throw new Error('--mono <path to a Jinn-Network/mono checkout> is required');
    if (args.includes('--commit') && !commit) throw new Error('--commit <40-character sha> requires a value');
    const result = importFromMono({ monoRoot, repoRoot, commit });
    for (const group of result.groups) {
      console.log(`${group.releaseGroup}: imported ${group.imported} of ${group.total} served documents`);
    }
    console.log(`source commit ${result.commit}`);
  } catch (error) {
    console.error(error?.message ?? String(error));
    process.exitCode = 1;
  }
}
