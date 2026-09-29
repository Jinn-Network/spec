# The Jinn protocol

Jinn is a protocol for work that is done by one party for another and judged by a third, where the whole record of it can be found and re-verified by anyone.

Work described by one party can be done by a second, its execution recorded, judged by a third, and the record of all of it found and re-verified by anyone. Every party is attributable, every record is exact, every execution is observable, and every implementation is replaceable.

This repository is the specification. It is the only place the specification is written. It contains the normative text, the machine-readable schemas, the conformance vectors, the changelog, and the process by which any of it changes. It contains no implementation.

## What two implementations must be able to do

The protocol defines an interoperability floor. Any two implementations, written independently from this text alone, must be able to:

1. read each other's records and agree on what they say and whether they are valid, and
2. find each other's records.

Everything beyond the floor is a choice made by an implementation or by a network: which venue matches requesters to operators, how work is paid for, which runtime executes it, where records are stored. The protocol says how work is described, done, evidenced, judged, trusted, and found. It does not say how work is paid for.

The protocol does carry offers. The holder of any record can publish an **offer** for it: a record that names the record by its digest, states a price on one or more payment rails together with the address to pay on each (or no price, for a free offer), and names the gate where a buyer asks for the record. The protocol carries the offer and lets anyone find and verify it. It does not settle payment: a buyer pays the address the offer names, directly, outside the protocol.

The protocol does say what a venue must supply so that records stay exact: a strictly increasing attempt number per task, a deadline per attempt, and the digests it anchors. A network publishes its own venue binding beside the protocol, not inside it.

## The record families

Every record is a sealed JSON document with a published schema, a stable identifier, and a digest. The families:

- **Task execution.** Task, Submission, Attempt, Lifecycle Observation, Delivery. How work is described, claimed, observed while it runs, and handed back.
- **Execution evidence.** Execution Evidence, Result Evaluation, Execution Verification, Offer. What happened during an execution, what a judge concluded about the result, what a verifier concluded about the judge, and the terms on which a record's holder will release it: the record's digest, a price and where to pay, and where to ask for it.
- **Trust.** Key bindings, authorizations, trust policies. Which keys speak for which accountable identities, and what a reader is willing to believe.
- **Record discovery.** Announcement entries and source heads. How a source publishes what it holds, and how a reader walks it, over HTTP.
- **Task profiles.** Task profiles and evaluation specifications. Reusable shapes of work and the rules by which a result is judged.

Alongside the families: the shared record disciplines every family follows, the identifier and namespace rules, the discovery facts profiles that say which fields of each record kind a feed carries, the HTTP serving rules for discovery, and the repository binding specifications for evidence storage.

Record kinds defined by applications on top of the protocol, such as benchmark records, follow the same disciplines but are not part of this specification. Their owners publish them.

## Verifying a record by hand

No Jinn code is needed to verify a record. The rules:

- A record is I-JSON. It was canonicalized exactly once, at sealing, with RFC 8785 (JSON Canonicalization Scheme). The bytes produced at that moment are the record.
- A record's digest is `sha256:` followed by the lowercase hexadecimal SHA-256 of those exact bytes. A reader hashes the bytes it received. A reader never re-canonicalizes.
- A record validates against the JSON Schema its type identifier names. Type identifiers are URLs under `https://spec.jinn.network/` and carry a major version only. A published identifier never changes and never changes meaning; a breaking change is a new name.
- A signed record is a DSSE envelope carrying an in-toto Statement. Signatures are verified over the DSSE pre-authentication encoding of the exact payload bytes, against keys that a trust record binds to an accountable identity.
- A reference from one record to another is by digest. Where a record is stored is never its identity.

The normative text for each family states which of these rules apply to which record kind, and the procedures a reader follows to verify a lifecycle, a trust chain, or a discovery feed.

## Conformance vectors

Every family ships vectors: a corpus of inputs paired with expected outcomes, expressed as data, with a digest manifest over the corpus. An implementation conforms to a family when it produces every expected outcome. The vector format for each family is written in that family's text.

The vectors are here, under [`documents/`](documents/), with their digest manifests under [`manifests/`](manifests/). A black-box conformance runner, which drives any implementation through a fixed command-line contract and reports per vector, will live in a sibling repository, `Jinn-Network/conformance`.

## Repository layout

- [`documents/`](documents/): every served document, at the served path its identifier resolves to. Schemas, profiles, vocabularies, normative text, and conformance vectors. These bytes are the published ones; nothing here is edited by hand.
- [`manifests/`](manifests/): one digest manifest per release group, generated from `documents/` and `inventory.json`. See [`manifests/README.md`](manifests/README.md).
- [`scripts/`](scripts/): the pipeline that builds a release group's served root, signs its manifest, assembles the deploy bundle, and serves a bundle over HTTP for verification. `inventory.json` beside them says which documents belong to which group.
- [`proposals/`](proposals/): numbered proposals, the way anything that is not a draft changes.

Five files inside the golden execution-evidence fixture look like code and are not: a two-file repository under test, the runner that executed it, and two claim scripts. They are that vector's input data, and a reader replaying the vector needs their exact bytes. They cross for the same reason a fixture's JSON does.

## Implementations and networks

- **TypeScript**, in `Jinn-Network/mono`. The first implementation, and the one from which the sealed documents here were originally produced. It pins a release of this repository.
- **The Jinn network on Base.** The first deployed instance of the protocol. The network publishes its own venue binding, contract addresses, and trust configuration; none of that is in this repository.

No second implementation exists yet. The smallest one would be a verifier in another language, written from this repository alone, that reads any sealed record, checks its digest and schema, verifies its signatures, resolves a trust policy, folds a lifecycle log, and verifies a discovery feed. It would produce nothing, execute nothing, and touch no venue. Passing every vector is the test.

## What is not yet proven

- **Interoperability.** One implementation exists. Until a second one passes the vectors, "written from the spec alone" is a claim, not a result.
- **Who holds the release key.** Releases are signed, and the public half of the key is served at `https://spec.jinn.network/keys/<key id>.pem`. No published record yet binds that key to the maintainers named in [`GOVERNANCE.md`](GOVERNANCE.md), so a reader can check which key signed a release but not, from records alone, whose key it is.
- **Attempt identity without a venue.** On the chain venue, the attempt number is minted by a contract. Between two implementations with no venue, the text must say who mints it and how two operators avoid colliding. This is open.
- **Vectors as data.** Some expectations in the first implementation still live in that implementation's tests rather than in the vector corpus. They are lifted into data before the corresponding family is marked sealed.

## Releases and document status

Releases are semantic-version tags of the whole set. Each release is a signed manifest of document digests. Old releases stay readable beside new ones.

Release `v0.1.0`, published on 2026-09-24, was the first built and deployed by this repository's own continuous integration: each release group's manifest is signed, the manifests and their signatures are attached to the GitHub release, and the release run verified the live origin against the signed bundle byte for byte. Anyone can repeat that check with the steps in [`docs/releasing.md`](docs/releasing.md). A signature proves which key signed a manifest; it does not by itself prove who holds that key (see "What is not yet proven").

Every document carries a status line:

- **draft**: may change without a proposal.
- **candidate**: changes only through a proposal; implementations are invited to test it.
- **sealed**: never edited. A change is a new document that supersedes it. Errata to vectors are append-only.

The served origin is `https://spec.jinn.network/`. A release tag builds the signed bundle and deploys it from this repository's continuous integration, and the deploy is not done until the origin has been verified against the bundle byte for byte. How a release is cut, what an operator provisions once, and how anyone checks the origin by hand are in [`docs/releasing.md`](docs/releasing.md).

## Proposing a change

Changes to anything that is not a draft happen through numbered proposals in [`proposals/`](proposals/). A proposal states the problem, the change, its effect on existing records and implementations, and its rationale. Proposals are ruled one at a time. The process is in [`GOVERNANCE.md`](GOVERNANCE.md); how to write one is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache License, Version 2.0. See [`LICENSE`](LICENSE).
