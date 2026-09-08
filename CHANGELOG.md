# Changelog

Every release of the specification, newest first. Each entry names the documents that changed status and the proposals ruled since the previous release.

## v0.1.0 — 2026-09-08

- Repository created with its front door, governance, contributing guide, proposal template, and license.
- Continuous integration: `check` runs the test suite on every pull request and on `main`; `release` builds, signs, deploys and then verifies the origin on a `v*.*.*` tag, gated by `scripts/verify-live-host.mjs`, a fail-closed live-host verifier with no "host unreachable, skip" branch. See [`docs/releasing.md`](docs/releasing.md).

### Imported: 535 documents

A byte-identical import of the sealed documents from the TypeScript implementation, `Jinn-Network/mono`, at commit `34359891760dc199e5688690ff3abf87f7ae51d7`. Same bytes, same digests, same served paths, so that nothing a record cites changes meaning.

`sealed-platform-v1`, 413 documents:

| Package | Documents |
| --- | --- |
| `@jinn-network/task-execution-profiles` | 133 |
| `@jinn-network/record-discovery-testing` | 66 |
| `@jinn-network/evidence-protocol` | 49 |
| `@jinn-network/task-execution-protocol` | 43 |
| `@jinn-network/chain-environment-record` | 32 |
| `@jinn-network/environment-record` | 23 |
| `@jinn-network/evidence-trace` | 23 |
| `@jinn-network/evidence-offer` | 21 |
| `@jinn-network/trust-core` | 13 |
| `@jinn-network/record-discovery-protocol` | 10 |

`implementations-v1`, 122 documents:

| Package | Documents |
| --- | --- |
| `@jinn-network/trust-testing` | 30 |
| `@jinn-network/information-world` | 25 |
| `@jinn-network/task-execution-testing` | 16 |
| `@jinn-network/evidence-repository-oci` | 12 |
| `@jinn-network/record-discovery-facts-task-execution` | 11 |
| `@jinn-network/record-discovery-facts-evidence` | 8 |
| `@jinn-network/evidence-repository-ipfs` | 6 |
| `@jinn-network/record-discovery-facts-chain-environments` | 6 |
| `@jinn-network/record-discovery-facts-trust` | 5 |
| `@jinn-network/record-discovery-facts-environments` | 2 |
| `@jinn-network/record-discovery-facts-offers` | 1 |

### Excluded, and why

- **The benchmarking product's record kinds and their vectors.** 106 documents: 52 from `@jinn-network/benchmarking-records` (including the six schemas that were served under `protocols/benchmarking/v1/`), 44 from `@jinn-network/benchmarking-testing`, and 10 discovery facts profiles from `@jinn-network/record-discovery-facts-benchmarking`. Benchmark records follow the protocol's disciplines but are defined by an application on top of it. Their owner publishes them.
- **Two fixture trees captured from first-party product runs.** 14 documents: `fixtures/autopilot-issue-1697/` (10, from `@jinn-network/evidence-protocol`) and `fixtures/swe-rebench-golden/` (4, from `@jinn-network/task-execution-profiles`). Every vector here is derived from the text or from a reference construction described in the text; a captured run is neither.
- **The implementation's own fixtures and bindings.** 153 documents from `implementations-v1`. Sixteen packages excluded whole: `attestation-issuer`, `benchmarking-interop`, `benchmarking-marketplace`, `chain-environment-verification`, `chain-scenarios`, `chain-state-extraction`, `environment-verification`, `evidence-trace-decode`, `execution-recorder`, `marketplace-binding`, `marketplace-testing`, `record-discovery-source-evidence-journal`, `task-admission`, `task-curation`, `task-derivation`, `task-execution-evaluator-adapters`. Plus the five fixtures of `@jinn-network/record-discovery-facts-offers`, whose facts profile crosses and whose fixtures do not. These describe how one implementation does its work, not what any implementation must do.

### What crossed that a reader might not expect

- **The information world record**, 25 documents. A sealed record kind outside the five named families. It crosses because the chain environment record, which is in the specification, cites it by digest, and discovery carries a facts profile for it: a second implementation cannot verify the chain environment family without it. The record kind, its schema and its vectors cross; the replay service that consumes it stays with the implementation.
- **The OCI evidence repository binding**, 12 documents, beside the IPFS one. The evidence repository bindings are optional binding specifications, and both are protocol.
- **Five code-shaped files** inside `@jinn-network/evidence-protocol/fixtures/golden-execution-evidence-v1/`: a two-file repository under test (`src/slug.ts`, `test/slug.test.ts`), the runner that executed it (`execution/runtime/runner.mjs`), and two claim scripts (`claims/result-evaluation/evaluator.mjs`, `claims/execution-verification/verifier.mjs`). They are that vector's input data, not implementation source. A reader replaying the vector needs their exact bytes.

### Differences against the origin served today

Every imported document is byte-identical to what `https://spec.jinn.network/` serves, with eight exceptions. The origin is currently refreshed by hand, and the implementation has moved on since the refresh at commit `dc7ec72c77ed6d0d2f833bc40e561fa230c3be10`. Six documents are new and two changed:

| Document | Difference |
| --- | --- |
| `@jinn-network/evidence-offer/fixtures/offer/invalid-equivalent-rail-spelling.json` | new |
| `@jinn-network/evidence-offer/fixtures/offer/invalid-spoofable-rail-destination.json` | new |
| `@jinn-network/record-discovery-testing/fixtures/vectors/head-issued-ahead/vector.json` | new |
| `@jinn-network/record-discovery-testing/fixtures/vectors/issued-at-regression-v2/vector.json` | new |
| `@jinn-network/record-discovery-testing/fixtures/vectors/refresh-by-ceiling-inverted-window/vector.json` | new |
| `facts/offer/v1` | new |
| `@jinn-network/evidence-offer/fixtures/manifest.sha256.json` | changed, covering the two new offer vectors |
| `@jinn-network/record-discovery-testing/fixtures/manifest.sha256.json` | changed, covering the three new discovery vectors |

The five new sealed-group vectors and their two fixture manifests are why the sealed group imports 413 documents where the served origin would have yielded 408.

### The pipeline

`scripts/` holds the pipeline that builds a release group's served root, signs its manifest, assembles the deploy bundle, and serves a bundle over HTTP so a live origin can be checked. It was moved from the implementation and trimmed of its dependency on that implementation's package catalog: here the inventory is `inventory.json` plus the tree under `documents/`. `scripts/import-from-mono.mjs` is the import itself, with the rules above encoded rather than described, so the import is reproducible and refuses on any digest that differs from the reference. `npm run check` runs the test suite, which asserts that each committed group manifest is reproduced byte for byte from the tree.
