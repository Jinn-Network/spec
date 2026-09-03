# Governance

This document says who decides what goes into the Jinn protocol specification, and how.

## What this repository holds

Only the protocol, the way it changes, and its front door:

- the normative text for each record family and the shared record disciplines;
- the identifier and namespace rules;
- the schemas, profile documents, and vocabularies;
- the conformance vectors and their digest manifests;
- the changelog and the numbered proposals;
- this file, the contributing guide, the license, and the README.

Nothing else. No implementation source. No design history from any implementation. No planning documents. The reason behind a rule lives in the proposal that introduced it.

## Maintainers

The maintainers are the members of the Jinn Network organization listed in [`.github/CODEOWNERS`](.github/CODEOWNERS). A maintainer rules on proposals, reviews changes, and cuts releases.

Maintainers are added or removed by a proposal, like any other change.

## Document status

Every document in the repository carries one of three statuses.

| Status | Meaning | How it changes |
| --- | --- | --- |
| draft | Under active writing. May be wrong. | Pull request, one maintainer review. |
| candidate | Stable enough for implementations to test against. | Proposal. |
| sealed | Frozen. Records in the world cite it. | Never edited. Superseded by a new document through a proposal. |

A published identifier never changes and never changes meaning. This is the identifier law, and it governs every document from the moment it is served at `https://spec.jinn.network/`. A breaking change is a new name with a new major version.

Errata to conformance vectors are append-only: a vector is never removed or altered; a correction is a new vector plus a dated erratum entry in the family's manifest.

## Proposals

A change to a candidate or sealed document, a new record family, a new vector format, a change to this file, or a change to the maintainers is made by a proposal.

1. A proposal is a numbered document in [`proposals/`](proposals/), opened as a pull request. It follows the template there.
2. A proposal has one sponsoring maintainer, named in its header. Without a sponsor it stays a draft proposal.
3. Proposals are ruled one at a time, in the order they are sponsored. A ruling is one of **accepted**, **rejected**, or **withdrawn**, recorded in the proposal's header and in the changelog.
4. An accepted proposal is implemented by a follow-up pull request that changes the documents it names. That pull request cites the proposal and needs code-owner review.
5. A rejected proposal stays in the repository with its rationale. It may be superseded by a later proposal.

The bar for acceptance: the change is needed to meet the interoperability floor, or corrects an error, or is a new capability that at least one implementation intends to build. A change that benefits only one implementation is rejected.

## Releases

A release is a semantic-version tag of the whole repository.

- **Major**: a sealed document is superseded, or a family is removed.
- **Minor**: a new document reaches candidate or sealed status, or a new family is added.
- **Patch**: errata, editorial corrections to text that do not change meaning, and changes to draft documents.

Each release carries a manifest of every served document's digest, signed by the release key. Continuous integration builds the manifest and deploys the served origin from the tag. A release is cut by a maintainer; the changelog entry for it is part of the release pull request.

## Conformance

The conformance vectors in this repository are the definition of conformance. An implementation conforms to a family when it produces every expected outcome in that family's corpus. A runner that drives implementations through a fixed command-line contract lives in `Jinn-Network/conformance`; the runner's results are evidence, the vectors are the rule.

No implementation, including the first, is normative. Where an implementation and this text disagree, this text is right and the implementation has a bug, or a proposal is needed.
