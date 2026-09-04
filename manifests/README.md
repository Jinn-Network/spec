# Group manifests

A **release group** is a set of served documents that ship together and are inventoried
together. There are two: `sealed-platform-v1`, the record kinds, schemas, profiles and
vectors of the five families, and `implementations-v1`, the discovery facts profiles, the
evidence repository bindings, the conformance-kit vectors and the information world
record.

Each group's manifest is its inventory: for every document, the served path, the SHA-256
of its bytes, the media type a host must send with it, and the package the document was
produced from. A reader who has a document and a manifest can decide whether the bytes
are the published ones without trusting the host that served them.

The manifests are generated. `scripts/build-profile-root.mjs` reads `inventory.json` and
the tree under `documents/`, hashes every file, and writes the manifest. Running it over
an unchanged tree reproduces the committed file byte for byte, and the test suite asserts
exactly that. A served document therefore cannot be edited without its digest moving in a
file that shows up in a diff.

## Where they are served

A group manifest is served under the group's own name, never at the origin root:

    https://spec.jinn.network/sealed-platform-v1/manifest.json
    https://spec.jinn.network/implementations-v1/manifest.json

Per-group namespacing is what lets two groups share one origin. Documents keep their
identifier paths, which is the identifier law; only the root files move under the group
that wrote them. Nothing is served at `https://spec.jinn.network/manifest.json`: a root
inventory would be one group's answer for both.

Once releases are signed, a manifest gains a detached DSSE envelope beside it at
`<group>/manifest.dsse.json`, over the exact manifest bytes.

## What these manifests are not

They are not byte-identical to the manifests served today. The documents are: every
imported document's digest is the digest the served host carries for it, except where the
implementation has moved on since the host was last refreshed by hand, and the changelog
names those. The manifests differ because documents were removed from each group on the
way in. The benchmarking product's record kinds and vectors do not cross, two fixture
trees captured from product runs do not cross, and most of `implementations-v1` is
implementation rather than protocol. A manifest that still inventoried them would be
describing a set this repository does not hold.

## Fields

| Field | Meaning |
| --- | --- |
| `version` | Manifest format version. `1`. |
| `generatedFrom` | The repository and commit the documents were produced from. |
| `inventory` | The path and digest of the `inventory.json` that produced this manifest. |
| `releaseGroup` | The group's name, and the path segment its root files are served under. |
| `lane` | `stable` for a release, `canary` for a build off an unreleased commit. |
| `packages` | The packages that produced the documents, sorted. |
| `documents` | Every served document, sorted by path: `path`, `sha256`, `mediaType`, `sourcePackage`. |
