# Contributing

Thank you for reading the specification closely enough to want to change it.

## Before you open anything

- Read [`README.md`](README.md) for what the protocol is and [`GOVERNANCE.md`](GOVERNANCE.md) for how it changes.
- Check the document's status line. A **draft** takes a pull request. A **candidate** or **sealed** document takes a proposal.
- Search [`proposals/`](proposals/) for an existing proposal on the same question.

## Reporting an error

Open an issue that names the document, quotes the text or the vector, and says what you expected and why. If two implementations disagree on a vector, say what each produced. An issue that reproduces is worth more than an issue that argues.

## Writing a proposal

Copy [`proposals/0000-template.md`](proposals/0000-template.md) to `proposals/NNNN-short-name.md`, where `NNNN` is the next unused number. Fill every section. Open it as a pull request titled `proposal NNNN: short name`.

A proposal is complete when a reader who has never seen the discussion behind it can understand the problem, the change, what breaks, and why this change and not another. The rationale lives in the proposal, permanently. Do not link to conversations elsewhere as the rationale.

## Writing standard

Everything here is written for an intelligent outsider who has this repository and nothing else.

- Say why before what.
- Name things by what they are. One concept, one name, everywhere.
- Normative text uses MUST, MUST NOT, SHOULD, and MAY in their RFC 2119 senses, and uses them sparingly.
- A rule that cannot be checked against a vector is a rule that will drift. Prefer a vector to a paragraph.
- American English spelling throughout: canonicalize, serialize, behavior.
- No emoji. No pitch, no token, no roadmap.

## What does not belong here

This repository holds the protocol, the way it changes, and its front door. It does not hold:

- implementation source, in any language;
- design documents, decision records, plans, meeting notes, or session transcripts from any implementation, including the first one;
- fixtures captured from a particular product's run. Every vector is derived from the text or from a reference construction described in the text;
- generated output written by hand. The served origin is built by continuous integration from a release tag.

Normative text is written fresh for this repository. It is not copied from an implementation's design documents, even when those documents were its source.

## Pull requests

- One change per pull request. A proposal and its implementing change are two pull requests.
- Every change to a served document updates the family's digest manifest in the same pull request, and continuous integration checks that the manifest matches.
- A sealed document is never edited. If your diff touches one, stop and write a proposal that supersedes it.
- Changes to [`GOVERNANCE.md`](GOVERNANCE.md), [`.github/CODEOWNERS`](.github/CODEOWNERS), the identifier rules, or any candidate or sealed document need code-owner approval.

## License

By contributing you agree that your contribution is licensed under the Apache License, Version 2.0, the license of this repository.
