// node --test suite for build-profile-root.mjs -- zero-dependency, offline.
//
// The load-bearing assertion is byte identity: the manifests committed under
// `manifests/` must be exactly what the builder produces from `documents/` and
// `inventory.json`. A served document cannot then be edited without its digest moving in
// a tracked file, which is the whole of the identifier law's enforcement here.
//
// The refusal cases run against synthetic repositories in temporary directories, so no
// test needs to damage the real tree to prove the builder refuses damage.
//
// Run: `npm run check`.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';

import {
  DOCUMENTS_DIRECTORY,
  INVENTORY_PATH,
  MANIFEST_FILE_NAME,
  assertNoPrefixCollision,
  assertRegisteredIdentifiersResolve,
  buildProfileRoot,
  identifierServedPath,
  inventorySha256,
  loadInventory,
  manifestBytes,
  profileManifest,
} from './build-profile-root.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const MANIFESTS_DIRECTORY = 'manifests';
const inventory = loadInventory(repoRoot);
const groupNames = inventory.releaseGroups.map(({ releaseGroup }) => releaseGroup);

const temporaries = [];
after(() => {
  for (const path of temporaries) rmSync(path, { recursive: true, force: true });
});

function temporaryDirectory(prefix) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaries.push(path);
  return path;
}

function committedManifestBytes(releaseGroup) {
  return readFileSync(join(repoRoot, MANIFESTS_DIRECTORY, releaseGroup, MANIFEST_FILE_NAME), 'utf8');
}

function walk(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(join(directory, entry.name), path));
    else files.push(path);
  }
  return files.sort();
}

/**
 * A repository shaped like this one but small enough to break on purpose: one release
 * group, two documents, a real tree under `documents/`.
 */
function syntheticRepository(mutate = (draft) => draft) {
  const root = temporaryDirectory('jinn-spec-root-');
  const documents = [
    ['schemas/example/v1', '{"$id":"https://spec.jinn.network/schemas/example/v1"}\n'],
    ['schemas/example/v1.md', '# example\n'],
  ];
  for (const [path, body] of documents) {
    const absolute = join(root, DOCUMENTS_DIRECTORY, ...path.split('/'));
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, body, 'utf8');
  }
  const draft = mutate({
    version: 1,
    generatedFrom: { repository: 'Jinn-Network/mono', commit: '0'.repeat(40) },
    releaseGroups: [{
      releaseGroup: 'example-v1',
      lane: 'stable',
      servedPathPrefixes: ['schemas/'],
      resolvableIdentifiers: [],
      packages: [{
        name: '@example/schemas',
        documents: [
          { path: 'schemas/example/v1', mediaType: 'application/schema+json' },
          { path: 'schemas/example/v1.md', mediaType: 'text/markdown' },
        ],
      }],
    }],
  });
  writeFileSync(join(root, INVENTORY_PATH), `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
  return root;
}

test('the inventory declares the release groups this repository publishes', () => {
  assert.deepEqual(groupNames, ['sealed-platform-v1', 'implementations-v1']);
  assert.equal(inventory.generatedFrom.repository, 'Jinn-Network/mono');
  assert.match(inventory.generatedFrom.commit, /^[0-9a-f]{40}$/u);
});

test('every committed group manifest is reproduced byte for byte from the tree', () => {
  for (const releaseGroup of groupNames) {
    const { manifest } = profileManifest({ repoRoot, releaseGroup });
    assert.equal(
      manifestBytes(manifest),
      committedManifestBytes(releaseGroup),
      `${releaseGroup} manifest is not what the builder produces from ${DOCUMENTS_DIRECTORY}/`,
    );
  }
});

test('building a profile root emits the attested bytes and the same manifest', () => {
  for (const releaseGroup of groupNames) {
    const outDir = temporaryDirectory(`jinn-spec-${releaseGroup}-`);
    const manifest = buildProfileRoot({ repoRoot, outDir, releaseGroup });
    assert.equal(manifestBytes(manifest), committedManifestBytes(releaseGroup));
    assert.deepEqual(
      walk(outDir),
      [MANIFEST_FILE_NAME, ...manifest.documents.map(({ path }) => path)].sort(),
      `${releaseGroup} profile root holds exactly its manifest and its documents`,
    );
    for (const { path, sha256 } of manifest.documents) {
      const emitted = readFileSync(join(outDir, ...path.split('/')));
      assert.equal(
        Buffer.compare(emitted, readFileSync(join(repoRoot, DOCUMENTS_DIRECTORY, ...path.split('/')))),
        0,
        `${path} is not the bytes under ${DOCUMENTS_DIRECTORY}/`,
      );
      assert.equal(createHash('sha256').update(emitted).digest('hex'), sha256);
    }
  }
});

test('the manifests pin the inventory that produced them', () => {
  const digest = inventorySha256(repoRoot);
  for (const releaseGroup of groupNames) {
    const manifest = JSON.parse(committedManifestBytes(releaseGroup));
    assert.deepEqual(manifest.inventory, { path: INVENTORY_PATH, sha256: digest });
    assert.equal(manifest.generatedFrom.commit, inventory.generatedFrom.commit);
    assert.equal(manifest.lane, 'stable');
  }
});

test('the tree under documents/ is exactly what the groups declare, and no path is in two groups', () => {
  const declared = new Map();
  for (const group of inventory.releaseGroups) {
    for (const pkg of group.packages) {
      for (const { path } of pkg.documents) {
        const owner = declared.get(path);
        assert.equal(owner, undefined, `${path} is declared by both ${owner} and ${group.releaseGroup}`);
        declared.set(path, group.releaseGroup);
      }
    }
  }
  assert.deepEqual(walk(join(repoRoot, DOCUMENTS_DIRECTORY)), [...declared.keys()].sort());
  assertNoPrefixCollision([...declared.keys()].map((path) => ({ path })));
});

test('a release group must be named when the inventory declares more than one', () => {
  assert.throws(() => profileManifest({ repoRoot }), /--release-group is required/u);
  assert.throws(
    () => profileManifest({ repoRoot, releaseGroup: 'not-a-group' }),
    /unknown release group not-a-group/u,
  );
});

test('a commit that disagrees with the imported source commit is refused', () => {
  assert.throws(
    () => profileManifest({ repoRoot, releaseGroup: groupNames[0], commit: 'f'.repeat(40) }),
    /does not match the imported source commit/u,
  );
  assert.throws(
    () => profileManifest({ repoRoot, releaseGroup: groupNames[0], lane: 'nightly' }),
    /lane must be canary or stable/u,
  );
});

test('a declared document that is absent, misdescribed or outside the tree is refused', () => {
  const missing = syntheticRepository((draft) => {
    draft.releaseGroups[0].packages[0].documents.push({
      path: 'schemas/example/v2',
      mediaType: 'application/schema+json',
    });
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: missing, releaseGroup: 'example-v1' }),
    /documents\/schemas\/example\/v2 is declared by the inventory but absent/u,
  );

  const mistyped = syntheticRepository((draft) => {
    draft.releaseGroups[0].packages[0].documents[0].mediaType = 'application/yaml';
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: mistyped, releaseGroup: 'example-v1' }),
    /declares unknown media type application\/yaml/u,
  );

  const escaping = syntheticRepository((draft) => {
    draft.releaseGroups[0].packages[0].documents[0].path = 'schemas/../../inventory.json';
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: escaping, releaseGroup: 'example-v1' }),
    /escapes documents\//u,
  );

  const reserved = syntheticRepository((draft) => {
    draft.releaseGroups[0].packages[0].documents[0].path = MANIFEST_FILE_NAME;
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: reserved, releaseGroup: 'example-v1' }),
    /the profile root is reserved/u,
  );
});

test('a document outside the declared served-path prefixes is refused', () => {
  const strayed = syntheticRepository((draft) => {
    draft.releaseGroups[0].servedPathPrefixes = ['profiles/'];
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: strayed, releaseGroup: 'example-v1' }),
    /is under no served path prefix declared by example-v1/u,
  );
});

test('the same served path claimed twice is refused', () => {
  const doubled = syntheticRepository((draft) => {
    draft.releaseGroups[0].packages.push({
      name: '@example/other',
      documents: [{ path: 'schemas/example/v1', mediaType: 'application/schema+json' }],
    });
    return draft;
  });
  assert.throws(
    () => profileManifest({ repoRoot: doubled, releaseGroup: 'example-v1' }),
    /is claimed by both @example\/schemas and @example\/other/u,
  );
});

test('a served path that is also a directory prefix is refused', () => {
  assert.throws(
    () => assertNoPrefixCollision([{ path: 'profiles/a' }, { path: 'profiles/a/b.json' }]),
    /profiles\/a is both a document and a directory prefix of profiles\/a\/b\.json/u,
  );
  assertNoPrefixCollision([{ path: 'profiles/a' }, { path: 'profiles/ab/b.json' }]);
});

test('the registered identifiers of every group resolve to a served document', () => {
  for (const group of inventory.releaseGroups) {
    const documents = group.packages.flatMap(({ documents: entries }) => entries);
    assert.ok(group.resolvableIdentifiers.length > 0, `${group.releaseGroup} registers no identifiers`);
    assertRegisteredIdentifiersResolve(group.resolvableIdentifiers, documents);
  }
});

test('a registered identifier that resolves to nothing is refused', () => {
  const documents = [{ path: 'profiles/example/v1/specification.md' }];
  assert.throws(
    () => assertRegisteredIdentifiersResolve(
      [{
        identifier: 'https://spec.jinn.network/profiles/absent/v1',
        resolution: 'document',
        entryPoint: 'profiles/absent/v1',
      }],
      documents,
    ),
    /resolves to no served document/u,
  );
  assert.throws(
    () => assertRegisteredIdentifiersResolve(
      [{
        identifier: 'https://spec.jinn.network/profiles/example/v1',
        resolution: 'prefix',
        entryPoint: 'profiles/other/v1/specification.md',
      }],
      documents,
    ),
    /resolves to no served document/u,
  );
});

test('an identifier that is not a canonical origin path is refused', () => {
  assert.equal(identifierServedPath('https://spec.jinn.network/facts/task/v1'), 'facts/task/v1');
  for (const identifier of [
    'https://example.com/facts/task/v1',
    'https://spec.jinn.network/facts/task/v1?x=1',
    'https://spec.jinn.network/facts/task/v1#x',
    'https://spec.jinn.network/facts/%2e%2e/v1',
    'https://spec.jinn.network/facts/../v1',
    'https://spec.jinn.network/',
    'https://spec.jinn.network/manifest.json',
  ]) {
    assert.throws(() => identifierServedPath(identifier), /canonical relative/u, identifier);
  }
});
