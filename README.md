# The Jinn protocol

Jinn is a protocol for work that is done by one party for another and judged by a third, where the whole record of it can be found and re-verified by anyone.

Work described by one party can be done by a second, its execution recorded, judged by a third, and the record of all of it found and re-verified by anyone. Every party is attributable, every record is exact, every execution is observable, and every implementation is replaceable.

This repository is the specification. It is the only place the specification is written. It contains the normative text, the machine-readable schemas, the conformance vectors, the changelog, and the process by which any of it changes. It contains no implementation.

## What two implementations must be able to do

The protocol defines an interoperability floor. Any two implementations, written independently from this text alone, must be able to:

1. read each other's records and agree on what they say and whether they are valid, and
2. find each other's records.

Everything beyond the floor is a choice made by an implementation or by a network: which venue matches requesters to operators, how work is paid for, which runtime executes it, where records are stored. The protocol says how work is described, done, evidenced, judged, trusted, and found. It does not say how work is paid for.

The protocol does say what a venue must supply so that records stay exact: a strictly increasing attempt number per task, a deadline per attempt, and the digests it anchors. A network publishes its own venue binding beside the protocol, not inside it.

## The record families

Every record is a sealed JSON document with a published schema, a stable identifier, and a digest. The families:

- **Task execution.** Task, Submission, Attempt, Lifecycle Observation, Delivery. How work is described, claimed, observed while it runs, and handed back.
- **Execution evidence.** Execution Evidence, Result Evaluation, Execution Verification. What happened during an execution, what a judge concluded about the result, and what a verifier concluded about the judge.
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

The vectors arrive with the first release of this repository. A black-box conformance runner, which drives any implementation through a fixed command-line contract and reports per vector, will live in a sibling repository, `Jinn-Network/conformance`.

## Implementations and networks

- **TypeScript**, in `Jinn-Network/mono`. The first implementation, and the one from which the sealed documents here were originally produced. It pins a release of this repository.
- **The Jinn network on Base.** The first deployed instance of the protocol. The network publishes its own venue binding, contract addresses, and trust configuration; none of that is in this repository.

No second implementation exists yet. The smallest one would be a verifier in another language, written from this repository alone, that reads any sealed record, checks its digest and schema, verifies its signatures, resolves a trust policy, folds a lifecycle log, and verifies a discovery feed. It would produce nothing, execute nothing, and touch no venue. Passing every vector is the test.

## What is not yet proven

- **Interoperability.** One implementation exists. Until a second one passes the vectors, "written from the spec alone" is a claim, not a result.
- **Signed releases.** The first release of this repository is a byte-identical import of the documents already served at `https://spec.jinn.network/`. Releases carry a signed digest manifest from the point at which this repository's own continuous integration publishes the origin.
- **Attempt identity without a venue.** On the chain venue, the attempt number is minted by a contract. Between two implementations with no venue, the text must say who mints it and how two operators avoid colliding. This is open.
- **Vectors as data.** Some expectations in the first implementation still live in that implementation's tests rather than in the vector corpus. They are lifted into data before the corresponding family is marked sealed.

## Releases and document status

Releases are semantic-version tags of the whole set. Each release is a signed manifest of document digests. Old releases stay readable beside new ones.

Every document carries a status line:

- **draft**: may change without a proposal.
- **candidate**: changes only through a proposal; implementations are invited to test it.
- **sealed**: never edited. A change is a new document that supersedes it. Errata to vectors are append-only.

The served origin is `https://spec.jinn.network/`. It is built and deployed from this repository's continuous integration.

## Proposing a change

Changes to anything that is not a draft happen through numbered proposals in [`proposals/`](proposals/). A proposal states the problem, the change, its effect on existing records and implementations, and its rationale. Proposals are ruled one at a time. The process is in [`GOVERNANCE.md`](GOVERNANCE.md); how to write one is in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Apache License, Version 2.0. See [`LICENSE`](LICENSE).
