---
number: 0002
title: External-verifier grader family
status: sponsored
sponsor: ritsukai
supersedes: none
superseded-by: none
---

# 0002: External-verifier grader family

## Problem

An evaluation specification says how a result is judged. It names a grader family, and the family decides which fields describe the grader. The vectors in this repository use five families: `deterministic-process`, `model-graded`, `human-review`, `composite` and `state-predicate`. The first implementation treats the set as closed and rejects any other name. No vector states that today.

None of the five describes a task whose verdict comes from an external harness's own verifier. Such a harness ships each task as a package that holds a verifier, runs the verifier itself, and reports a reward. The party that seals the evaluation specification runs no grader. All it can truthfully say is which package was the judge, what that package declares, and how the harness's reward is read.

The nearest family is `deterministic-process`. Its block requires an image, a platform, a workspace, test material, a parser identity, expected test transitions and a timeout (`@jinn-network/task-execution-profiles/fixtures/family-blocks/golden/deterministic-process.json`). To see whether those fields can be filled truthfully for a real benchmark, the 89 task packages of Terminal-Bench 2.1 were read in full, as Harbor's registry publishes them (dataset `terminal-bench/terminal-bench-2-1`, revision `sha256:7d7bdc1cbedad549fc1140404bd4dc45e5fd0ea7c4186773687d177ad3a0699a`).

| What the family needs | Packages that state it | What they state |
| --- | --- | --- |
| Image reference | 89 of 89 | A tag in a public registry. |
| Image digest | 0 of 89 | No reference carries a digest. |
| Platform | 0 of 89 | Harbor's task format has no field for an architecture. |
| Timeout | 89 of 89 | A verifier timeout, in whole seconds. |
| Test material | 89 of 89 | The verifier's own files, 2 to 67 per package. |
| Parser identity | 0 of 89 | A shell script writes a reward, and the harness reads it with its own code. |
| Expected test transitions | 0 of 89 | No list of tests expected to change state. |

Three more things the packages show:

- Three packages describe arm64 as well as amd64 in their own text. For them `linux/amd64` would be false, not only unsourced.
- Every verifier script downloads software when it runs.
- Harbor names each package by a content hash. The hash covers the verifier's files and the image reference as a string. It does not cover the image that reference points at.

So a `deterministic-process` specification for one of these tasks has to invent a platform and a parser identity, leave the transition lists empty, and offer a movable tag where the family means a pinned image. Every such document seals. Every one says something its author does not know, or knows to be false, and a reader cannot tell it from a specification whose fields are real.

This has already happened once. A `deterministic-process` specification that the first implementation sealed for a run under another harness, Inspect (`sha256:088e64ec3bfb61b4a77fe2deda3bb536d517e96299a144d53fb6843a4cffa4bc`, in that implementation's Inspect runtime proof bundle), gives a Python distribution tree as its image, `python/3.11.0` as its platform, two empty transition lists, and a timeout of 86400 seconds, which is the value that intake writes when the run declares none.

What is missing is a family in which the true statement can be made: the verdict is the external harness's own, and this is exactly what is known about its judge.

## Change

Add one grader family, `external-verifier`, to the evaluation specification (`https://spec.jinn.network/profiles/evaluation-spec/v1`), which belongs to the Task profiles record family. A specification of this family names an external harness's task package as its grader and takes its measurements from the reward that harness reports.

No identifier is added, and none changes meaning. No existing document changes, with one exception: the digest manifest of the task-profiles vector corpus (`@jinn-network/task-execution-profiles/fixtures/manifest.sha256.json`) gains entries for the new vectors. No existing entry in it changes.

This is a proposal rather than a draft pull request because it changes which evaluation specifications are valid. A reader that knows five families rejects a sixth.

This repository carries the evaluation specification as vectors only. No text is served at its identifier. The rules of the new family are therefore written here, marked as the text to install. They become the family's section of the evaluation specification's text when that text is written. Until then this proposal is where the rules are written, and the vectors are what an implementation is checked against.

### Text to install

> # The `external-verifier` grader family
>
> **Family name:** `external-verifier`, in evaluation specifications that cite `https://spec.jinn.network/profiles/evaluation-spec/v1`
>
> **Status:** candidate
>
> The key words **MUST**, **MUST NOT** and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.
>
> ## 1. What the family says
>
> A specification of this family says that the task is judged by a verifier that an external harness ships and runs. Whoever seals the specification runs no grader. The specification names the harness, names the harness's task package as the grader, records what that package declares about its verifier, and says how the harness's reward becomes measurements.
>
> ## 2. The family block
>
> | Field | Type | Required | Meaning |
> | --- | --- | --- | --- |
> | `harness` | string, one of the names in section 6 | yes | The harness whose verifier judges the task. |
> | `verifierSemanticsVersion` | the string `"1"` | yes | The version of the rules in this text. They govern how the block, the grader digest and the measurements are read. |
> | `testMaterial` | array of resource descriptors, at least one | yes | The verifier's own files in the task package. |
> | `declaredImage` | non-empty string | no | The environment image reference, exactly as the task package declares it. |
> | `timeout` | positive integer | yes | The verifier timeout the task package declares, in seconds. |
>
> `testMaterial` MUST hold at least one entry. Each entry MUST carry `name`, the file's path inside the package, and `digest.sha256`, the SHA-256 of the file's exact bytes as 64 lowercase hexadecimal digits. An entry MUST NOT carry inline `content`. An entry MAY carry `accessClass`. Two entries MUST NOT share a `name`, and the entries MUST be in ascending order of `name`, comparing Unicode code points.
>
> `declaredImage` is recorded as declared. It MAY be unpinned: a tag is written as a tag. It is absent when the package declares no image.
>
> Any other key in the block MUST be a namespaced extension key, as in every family block. An extension adds information. It never changes how the fields above are read.
>
> The top-level `semanticsVersion` means what it means in every family. `verifierSemanticsVersion` versions this family's rules alone.
>
> ## 3. The grader
>
> `grader` MUST be a single resource descriptor, and it MUST carry `digest.sha256`. It MUST NOT carry inline `content`. The descriptor names the harness's task package. The digest is the content hash the harness itself assigns to that package, as 64 lowercase hexadecimal digits.
>
> This digest is not the SHA-256 of any file or archive. It is a SHA-256 that the harness computes over the package's files by its own rule, which section 6 gives for each harness. A reader MUST NOT expect any byte stream to hash to it. A reader that holds the package checks the digest by applying the harness's rule.
>
> `grader.name`, when present, is the name the harness gives the package.
>
> ## 4. Measurements
>
> For each trial the harness reports a reward map: a set of named values. Each measurement the specification declares is the value of the same-named key in that map.
>
> - The measurement's name is the key, unchanged.
> - The measurement's value is the harness's value, unchanged. A value that is a number is carried in the one form given under "Carrying a number" below.
> - A key the specification does not declare is not a measurement.
> - A declared measurement whose key is absent from the map has no value. Whoever records the measurements MUST NOT supply a default for it.
>
> A specification of this family MUST declare at least one measurement.
>
> The verdict comes from the specification's own `verdictRule` over these measurements. The family fixes no rule.
>
> ### Carrying a number
>
> Measurements go into sealed records, and a sealed record is compared by its bytes. So a reward that is a number MUST be carried in one form only, whoever records it. Three steps give that form.
>
> 1. **Read the number as a binary64 value.** It is the binary64 value nearest the number as written. If two are equally near, it is the one whose significand is even. This is the rounding that IEEE 754 calls round to nearest, ties to even. A JSON parser that keeps numbers as doubles and rounds correctly gives this value. From here on the reward is that binary64 value, however the harness wrote it. A number of magnitude 2^1024 - 2^970 or more reads as no finite value. It cannot be carried, and a reward map that holds one under a declared key is invalid.
> 2. **A whole number of magnitude at most 2^53 - 1 is carried as a number.** Such a value is a safe integer.
> 3. **Any other value is carried as a decimal string.** Take every decimal number that step 1 reads as this same binary64 value. Keep those with the fewest significant digits, counted from the first non-zero digit to the last non-zero digit. If more than one is left, keep the one nearest the binary64 value. If two are equally near, keep the one whose last significant digit is even. Write the number that is left with no exponent: `-` if it is negative; then its whole part, which is `0` when the magnitude is below 1 and has no leading zero otherwise; then, only if it has a fractional part, `.` and its fractional digits, with no trailing zero.
>
> Five rewards show the steps at work.
>
> | Reward | Carried as | Why |
> | --- | --- | --- |
> | 1, written `1.0` | the number `1` | A whole number of magnitude at most 2^53 - 1. |
> | One ten-millionth, written `1e-07` | `"0.0000001"` | One significant digit, written with no exponent. |
> | The binary64 sum of 0.1 and 0.2 | `"0.30000000000000004"` | Six numbers of 17 significant digits read as it, and no number of fewer digits does. This one is nearest. |
> | 2^60 + 256, which is 1152921504606847232 | `"1152921504606847200"` | Two numbers of 17 significant digits read as it, and no number of fewer digits does. This one is nearer. The exact value has 19 significant digits and is not what is carried. |
> | 2^49 + 0.25, which is 562949953421312.25 | `"562949953421312.2"` | Two numbers of 16 significant digits read as it, and they are equally near. This one ends in an even digit. |
>
> ## 5. What a specification of this family does not state
>
> - **The image that ran.** `declaredImage` is the reference the package declares. A tag can be moved to other bytes. The block carries no image digest, and a reader MUST NOT treat `declaredImage` as identifying an image.
> - **The platform.** The block names no operating system and no architecture.
> - **What the verifier fetched.** A verifier may download software when it runs. The grader digest covers the package's files and nothing they fetch.
> - **The run.** The harness version, the timeout that applied after any multiplier or override, and the digest of the image that was pulled are facts about one evaluation. They belong to the Result Evaluation Evidence that reports that evaluation, in `evaluationMethod` and `evidence`. They are never part of this document.
>
> It follows that a specification of this family does not make a verdict reproducible. It fixes which package, which verifier files and which declared environment were named as the judge.
>
> ## 6. Harnesses
>
> This version defines one harness name. A block that names any other harness is invalid.
>
> ### `harbor`
>
> A Harbor task package is a set of files with `task.toml` at its root.
>
> | Item | Where it comes from |
> | --- | --- |
> | Grader digest | Harbor's content hash of the package, by the rule below. A Harbor trial records the same value in two places, each time written with a `sha256:` prefix that is dropped here: `task_id.ref` in the trial's `result.json`, and `task.digest` of the trial's entry in the job's `lock.json`. `task_checksum` in the trial's `result.json` is a different hash and is not this digest. |
> | `grader.name` | `name` in the `[task]` table of `task.toml`. |
> | `testMaterial` | Every file under the package's `tests/` directory. `name` is the path from the package root, with `/` between segments. |
> | `declaredImage` | `docker_image` in the `[environment]` table of `task.toml`, character for character. |
> | `timeout` | `timeout_sec` in the `[verifier]` table of `task.toml`. |
> | Reward map | The object at `verifier_result.rewards` in the trial's `result.json`. Its values are numbers, so every measurement of a `harbor` specification is declared with type `number`. |
>
> **Content hash.** Take every file of the package, each with its path from the package root (with `/` between segments) and the SHA-256 of its bytes as 64 lowercase hexadecimal digits. Order the files by path, ascending, comparing Unicode code points. For each file in that order write one line: the path, one byte `0x00`, the hexadecimal digest, one byte `0x0A`, all encoded as UTF-8. The content hash is the SHA-256 of the lines joined together, as 64 lowercase hexadecimal digits.
>
> Which files a package holds is Harbor's decision. The rule covers every file of the package as published.
>
> A package of two files, `task.toml` whose digest is the digit `a` written 64 times and `tests/test.sh` whose digest is the digit `b` written 64 times, has the content hash `d9ab9cb898bc6518b5c3429a7bfd8bf0a6e420be644c8c0c1d2765c25627becf`.
>
> ## 7. Example
>
> A specification for that two-file package:
>
> ```json
> {
>   "protocol": "https://spec.jinn.network/profiles/evaluation-spec/v1",
>   "semanticsVersion": "4",
>   "family": "external-verifier",
>   "grader": {
>     "name": "example/sum-two-numbers",
>     "digest": { "sha256": "d9ab9cb898bc6518b5c3429a7bfd8bf0a6e420be644c8c0c1d2765c25627becf" },
>     "accessClass": "public"
>   },
>   "familyBlock": {
>     "harness": "harbor",
>     "verifierSemanticsVersion": "1",
>     "testMaterial": [
>       {
>         "name": "tests/test.sh",
>         "digest": { "sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
>         "accessClass": "public"
>       }
>     ],
>     "declaredImage": "registry.example.org/sum-two-numbers:20260101",
>     "timeout": 900
>   },
>   "measurements": [{ "name": "reward", "type": "number", "required": true }],
>   "verdictRule": { "threshold": { "measurement": "reward", "op": "eq", "value": 1 } },
>   "unscorable": [],
>   "evidenceConventions": { "requiredRefs": [] }
> }
> ```
>
> ## 8. Conformance
>
> An implementation conforms to this family when it produces every expected outcome in the vector families `external-verifier-block`, `external-verifier-package-digest` and `external-verifier-measurements`, and in the `external-verifier` cases under `evaluation-spec`.

## Effect on existing records and implementations

**Records.** No record changes and no record becomes invalid. Every evaluation specification that is valid today stays valid and means what it meant. Specifications already sealed under `deterministic-process` for a run of an external harness stay as they are. A sealed record is not sealed again.

**Readers.** A reader built before this change rejects a specification of the new family as invalid. It does not misread it. That is the only effect on a reader that does not change.

**Discovery.** The facts profile `facts/evaluation-spec/v2` does not change. For a specification of this family a feed carries `family`, `graderDigests` and `testMaterialDigests`. It carries no `imageDigest`, because there is none. The value under `graderDigests` is the harness's content hash. It joins specifications that name the same package, and it matches what the harness records. No bytes hash to it.

**Implementations.** The TypeScript implementation in `Jinn-Network/mono` adds the family to the set it accepts, validates the block and the rules of sections 3 and 4, and implements the content hash and the reading of the reward map for `harbor`. Its benchmarking application then seals one specification of this family for each Terminal-Bench 2.1 task and reads Harbor trial results through it.

The same implementation's Inspect intake does not move to this family. As that intake works today, Inspect assigns no content hash to a scorer, and the intake's measurement is a pass or fail projected from Inspect's score by the intake's own rule, not a key of a reward map. The family as written does not describe that, and this proposal does not bend it to.

Nothing breaks, because the change adds a family that no existing record uses.

## Vectors

The implementing pull request adds the vectors below under `@jinn-network/task-execution-profiles/fixtures/` and extends the digest manifest there. Each case has the form its part of the corpus already uses. In the three new vector families a case is an input paired with an expected outcome. Under `evaluation-spec/` a case is a whole specification, valid in `golden/` and invalid in `adversarial/`. No vector format is added. Every vector is built from the text, starting from the example in section 7, the worked content hash in section 6 and the worked rewards in section 4. None is captured from a run or copied from a published benchmark's packages.

`external-verifier-block/golden/`, each returned unchanged:

- `minimal.json`: the required fields and no `declaredImage`. The image reference is optional.
- `declared-image-tag.json`: `declaredImage` is a tag. An unpinned reference is valid as declared.
- `namespaced-extra-key.json`: a namespaced extension key is kept.

`external-verifier-block/adversarial/`, each rejected as an invalid document:

- `platform-key.json`: a `platform` key. The block has no place for a platform.
- `image-key.json`: an `image` descriptor with a digest. The block has no place for a pinned image.
- `unknown-harness.json`: a harness name this text does not define.
- `missing-semantics-version.json`: no `verifierSemanticsVersion`.
- `unknown-semantics-version.json`: `verifierSemanticsVersion` is `"2"`.
- `declared-image-descriptor.json`: `declaredImage` is a resource descriptor with a digest, not a string.
- `declared-image-empty.json`: `declaredImage` is the empty string.
- `timeout-zero.json`: `timeout` is 0, which is not positive.
- `timeout-fractional.json`: `timeout` is not an integer.
- `test-material-empty.json`: `testMaterial` is an empty array.
- `test-material-without-name.json`: an entry lacks `name`.
- `test-material-without-digest.json`: an entry lacks `digest.sha256`.
- `test-material-prefixed-digest.json`: an entry's digest is written with a `sha256:` prefix.
- `test-material-inlined-content.json`: an entry carries inline `content` beside its `name` and digest.
- `test-material-duplicate-name.json`: two entries share a `name`.
- `test-material-unsorted.json`: two entries whose names are not in ascending order.

`external-verifier-package-digest/`, the `harbor` content hash:

- `golden/two-files.json`: the worked package of section 6 and its hash.
- `golden/input-order-ignored.json`: the same files given in the other order give the same hash.
- `golden/code-point-order.json`: two paths that sort one way by Unicode code point and the other way by UTF-16 code unit. The hash follows code points.
- `adversarial/duplicate-path.json`: one path given twice.
- `adversarial/malformed-file-digest.json`: a file digest that is not 64 lowercase hexadecimal digits.

`external-verifier-measurements/`, a set of declarations and a reward map in, measurements out:

- `golden/whole-reward.json`: `reward` of 1 is the measurement `reward` with the number 1.
- `golden/fractional-reward.json`: `reward` of 0.5 is carried as the string `"0.5"`.
- `golden/small-fractional-reward.json`: a reward of one ten-millionth is carried as `"0.0000001"`, with no exponent.
- `golden/unsafe-whole-reward.json`: a reward of 2^53, a whole number that is not a safe integer, is carried as the string `"9007199254740992"`.
- `golden/nearest-digits-reward.json`: a reward of 0.30000000000000004, the binary64 sum of 0.1 and 0.2. Six numbers of 17 significant digits read as it and no number of fewer digits does. The nearest is carried: `"0.30000000000000004"`.
- `golden/large-whole-reward.json`: a reward written as the whole number 1152921504606847232, which is 2^60 + 256. It is carried as `"1152921504606847200"`, the nearer of the two numbers of 17 significant digits that read as it, and not as its exact value.
- `golden/tied-digits-reward.json`: a reward of 562949953421312.25, which is 2^49 + 0.25. Two numbers of 16 significant digits read as it and are equally near. The one that ends in an even digit is carried: `"562949953421312.2"`.
- `golden/undeclared-key-dropped.json`: a key the specification does not declare is not a measurement.
- `golden/required-key-absent.json`: the map lacks a required key. No measurement is produced for it and no default appears.
- `adversarial/non-numeric-value.json`: a `harbor` reward that is not a number.
- `adversarial/out-of-range-value.json`: a `harbor` reward written as `1e400`, which is too large to read as a finite binary64 value.
- `adversarial/not-a-map.json`: the reward map is absent or is not an object.

`evaluation-spec/`, whole specifications, as the existing cases there are:

- `golden/external-verifier-minimal.json`: the example of section 7. It seals, and its digest is pinned beside it in `golden/external-verifier-minimal.sha256`, the way the other golden specifications there are pinned.
- `adversarial/external-verifier-grader-without-digest.json`: the grader carries only a `uri`.
- `adversarial/external-verifier-grader-prefixed-digest.json`: the grader's digest is written with a `sha256:` prefix.
- `adversarial/external-verifier-grader-inlined-content.json`: the grader carries inline `content` beside its digest.
- `adversarial/external-verifier-grader-list.json`: `grader` is an array.
- `adversarial/external-verifier-no-measurements.json`: no measurement is declared.
- `adversarial/external-verifier-boolean-measurement.json`: a `harbor` specification declares a measurement of type `boolean`.
- `adversarial/external-verifier-wrong-block.json`: the family is `external-verifier` and the block is a `deterministic-process` block.
- `adversarial/unknown-family.json`: a family name the specification does not define. The set of families is closed, and no vector said so before.

## Rationale

**Why a new family and not a looser reading of `deterministic-process`.** A family's required fields are what a reader relies on. If `platform` may be blank and `transitions` may be empty for a grader that has neither, the fields stop meaning anything for the graders that do have them. Four narrower routes were tried against the first implementation's validator: a blank platform, a `composite` with no parts, a minimal `human-review` block, and a namespaced extension key beside the required fields. Each seals. Each states something untrue. An extension may add information; it cannot excuse a required field.

**Why the block carries so little.** Every field had to pass one test: can it be read from the task package with nothing invented? `harness`, `testMaterial`, `declaredImage` and `timeout` pass. A platform, an image digest, a parser identity and a list of test transitions fail, so the family has no place for them, and the vectors reject a block that tries to carry one.

**Why `testMaterial` is strict.** The block names at least one verifier file, names each by its digest and never carries its bytes, and lists the files in one order. A block that pinned no verifier file would name a judge and fix nothing about what it checks with. A digest is what a reader compares with the package, so inline bytes would only add a second way to say the same thing. One order means that two parties who describe the same package write the same block, and a specification's digest does not depend on who listed the files.

**Why the grader digest is the harness's own hash, under `sha256`.** The harness's content hash is the one name that the package's publisher, the harness and every trial record already share. A trial is tied to the specification by comparing two strings. A digest of an archive would tie to nothing the harness records. The value is a SHA-256, so it sits under `sha256`, and the text says what it is a SHA-256 of. A reader reaches this digest only through a specification whose family it knows, since it rejects the others, so no reader meets the value without the rule that explains it. A separate digest key was considered. It would hide the grader from every reader that looks under `sha256`, and it would add no truth the text does not already state.

**Why `declaredImage` is a string.** A resource descriptor invites a reader to treat it as a reference to fixed bytes. A tag is not that. A plain string with this name says what it is: what the package declared.

**Why a reward that is not a safe integer becomes a string.** The corpus already writes a quantity that is not a safe integer as a decimal string: the threshold `"0.5"` in `@jinn-network/task-execution-profiles/fixtures/evaluation-spec/golden/fractional-threshold.json` is one. JSON implementations do not all read and write a fraction, or a whole number beyond 2^53 - 1, the same way, and measurements are recorded in sealed records, which are compared by digest. Two recorders must write the same measurement for the same reward, so the text has to name the one string they write.

**Why the string is fixed in three steps.** "The shortest decimal string that reads back as the same value" sounds like one string and is not. Six numbers of 17 significant digits read as the binary64 sum of 0.1 and 0.2, and no number of fewer digits does. Past 2^53 neighboring whole numbers read as one binary64 value: 9007199254740992 and 9007199254740993 are the same length and both read as 2^53. A reader that keeps a whole number exact also starts from a different value than a reader that keeps a double, so the two differ on a reward written as 9007199254740993 before either chooses a digit. The rule therefore fixes the reading first, then the digits, then the notation. Each step leaves one answer. Each choice the rule makes has a vector: the nearest of several, the even digit of a tie, a whole number whose digits are not its exact value, and a number too large to read.

**Why the fewest digits, and not the exact value.** Every binary64 value has an exact decimal expansion, and carrying it would also name one string. It was set aside for three reasons. The exact value of the binary64 nearest 0.1 has 55 significant digits, where 0.1 has one. A split rule, exact for whole numbers and fewest digits for fractions, is two rules where one will do. And fewest digits, then nearest, then even is the choice RFC 8785 makes when it writes a number, and RFC 8785 is what every record in this protocol is canonicalized with. Its own samples write 2^68, which is 295147905179352825856, as 295147905179352830000. An implementation can take the digits from an RFC 8785 number serializer and write out the exponent, if there is one, as zeros. The cost is stated plainly: past 2^53 the string is not the exact value of the binary64. 2^60 + 256 is 1152921504606847232 and is carried as `"1152921504606847200"`. Both read as the same binary64 value, and after the first step that value is all the reward is.

**Why the facts of a run stay out.** Which image ran, on what platform, under which harness version and with what timeout are true of one evaluation and can differ in the next. A specification is sealed before any evaluation and is shared by all of them. Result Evaluation Evidence already has `evaluationMethod` and `evidence` for what one evaluation did.

**Why one harness, in a closed set.** The grader digest and the reward map mean nothing without the harness's rule. A harness name with no written rule would be a field that two readers could read two ways. A closed set with one member can be widened by a later proposal without touching a sealed specification. An open set could never be narrowed. Every restriction in this family follows the same reasoning: it can be loosened later, and it could not be added later.

**Why the family fixes no verdict rule.** Benchmarks differ in what a reward means. One passes at 1. Another reports partial credit. The specification's `verdictRule` already says how measurements become a verdict, and a reader evaluates it again for itself. A specification for a benchmark whose verifier writes only 0 or 1 can use the existing rule vocabulary to pass at 1, fail at 0 and answer inconclusive for any other value.

**Why the block has its own version.** The top-level `semanticsVersion` is shared by every family. The rules here, the content hash above all, belong to this family and describe software the specification does not control. If a harness changes how it hashes a package, this family needs a new version and the others do not.

**The bar for acceptance.** This is a new capability that an implementation intends to build. The TypeScript implementation in `Jinn-Network/mono` intends to build it and to use it for Terminal-Bench 2.1. One implementation exists, so one is all that can be counted. The family is not shaped to that implementation: it names a third-party harness, states that harness's public rules, and asks for nothing a second implementation could not build from this text. The same implementation's Inspect intake would not use the family as written, for the reason given under the effect on implementations. That is said here so the count is not read as two.

**The release.** Minor. The family's text is accepted at candidate status. No sealed document is superseded and no vector is altered.

**Alternatives set aside.**

- *Resolving the tag to a registry digest when the specification is sealed.* The digest would be true on that day. The package does not state it, the tag can be pushed again, and a Harbor trial records no image digest to compare it with.
- *An open `harness` string.* Any name would validate, and a reader that does not know the name could not say what the grader digest means.
- *A family wide enough for Inspect as well.* It would need a rule for projecting a score into a measurement, which is a different statement from "the measurement is the harness's own reward". It is left for a proposal of its own.
- *Putting the harness version or the observed platform in the block.* Both are facts about a run. A specification that carried them would be false for the next run on another machine.
- *Fixing the verdict rule in the family, as `state-predicate` does.* That family's rule follows from its predicates. Here the meaning of a reward belongs to the benchmark, not to the family.

## Ruling

Filled in by the sponsoring maintainer: the ruling, the date, and one sentence of reason.
