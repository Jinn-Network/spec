# Duplicates and conflicts in the observation log

**Identifier:** `https://spec.jinn.network/profiles/observation-log/v1`

**Applies to:** Attempt logs of observations under `https://spec.jinn.network/profiles/task-execution/v1`

**Status:** candidate

The key words **MUST**, **MUST NOT** and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.

## 1. What this text settles

An Attempt's state is a fold over its observation log. Two readers holding the same log must derive the same state. Observations are deduplicated on their `source` and `id`, which are unique per producer. That is right for a replay, where the same observation arrives twice. This text also covers two observations that share the pair and disagree, and two different observations that share one `sequence`. Without it, a reader that keeps the first of a disagreeing pair lets array position decide the Attempt's state: `delivered` in one order, `failed` in the other.

## 2. One observation, emitted twice

Two observations share a *dedupe key* when they have the same `source` and the same `id`. They *agree* when they have the same `sequence`, the same `type`, and `data` with the same RFC 8785 canonical form. Attributes the fold does not read, such as `time` and `traceparent`, are not compared, because a producer that rebuilds its log may restate them.

Observations that share a dedupe key and agree are one observation. A reader keeps one and drops the rest.

## 3. A dedupe key that disagrees

Observations that share a dedupe key and do not agree break the uniqueness of the pair. Keeping either would let array position pick the Attempt's state. If they fall inside the fold, a reader MUST refuse the log. The Attempt has no derived state, and the refusal has the category `protocol-violation`.

The refusal MUST NOT depend on the order of the log. It is for that Attempt alone.

## 4. What is inside the fold

The fold reads the authoritative source's observations: those whose `source` is the `data.source` of the first `attempt-engaged` in order. An observation from any other source is outside it, so a disagreement there has no effect, and a producer outside the source cannot take an Attempt's state away from the source that owns it. If no `attempt-engaged` pins a source, every source is inside.

A disagreement between two `attempt-engaged` observations is always inside the fold. The source they would pin is itself in doubt, so the fold refuses rather than let the content of a payload decide which one pins. A producer outside the source can therefore make the fold refuse an Attempt by contradicting itself in `attempt-engaged`. That is a refusal, never a wrong state.

A contradiction between two `attempt-terminal` observations with different dedupe keys is not this case, and this text does not change how the fold resolves it.

## 5. Order

A reader orders a log by `sequence`, comparing the fixed-width strings. Different observations with one `sequence` order by `source`, then by `id`, comparing UTF-16 code units. No array position decides anything.

## 6. Conformance

An implementation conforms to this text when it produces every expected outcome in `@jinn-network/task-execution-protocol/fixtures/observation-conflict-v1/`. Each case is a directory holding an Attempt's `observations.json`. The directory's `manifest.json` lists the cases with an `expectedDisposition` in words, in the shape of `adversarial-v1/manifest.json`, and an `expected` value: the derived `state` and `contradictory` flag, or `{"refused": "protocol-violation"}`. In these cases the fold derives `pending` from an `attempt-engaged`, `running` once an `attempt-started` is read, nothing from `progress`, and otherwise the `data.state` of the terminal that holds. Every outcome MUST be the same in every order of the log.

## 7. Why these rules (non-normative)

**Refuse rather than choose.** A rule that keeps the first in `sequence` still needs a rule for two with one `sequence`, and it turns a broken producer's output into a state that looks clean. A disagreement on a dedupe key is not two facts. It is a producer saying two things under one name, and a reader has no ground to choose.

**Not the `contradictory` flag.** That flag is for two terminals that are each well formed under their own names, where the order is known. A flagged state is still a state, and one built on a pair whose content is in doubt would claim more than the log shows.

**Compare only what the fold reads.** A producer that rebuilds its durable log must re-emit its original pairs, and the rebuilt log can differ in `time` or `traceparent` and mean the same. Comparing every attribute would refuse that honest case.

**Canonical forms for `data`.** Key order is not content. RFC 8785 is what every record in this protocol is canonicalized with, and it gives one comparison two implementations can match byte for byte.

**Only inside the fold.** A blanket refusal would let any producer outside the authoritative source wedge any Attempt by contradicting itself in a log that holds several sources. With no engagement nothing is authoritative, so nothing can be set aside. A disagreement in `attempt-engaged` is the exception, because it puts in doubt which source is authoritative at all.
