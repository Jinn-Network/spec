---
number: 0001
title: Provenance vocabulary
status: draft
sponsor: none
supersedes: none
superseded-by: none
---

# 0001: Provenance vocabulary

## Problem

A reader who finds a judged result asks the same four questions every time, whatever application produced it:

1. Who executed the work: which key signed for it, and is that key bound to an identity the reader can inspect?
2. Who evaluated it, and is the evaluator a different party from the executor?
3. Can the verdict be recomputed from the published bytes, or is it only attested?
4. Is the independence of the parties established, and by what?

The records already carry most of what answers these questions. Execution Evidence names an executor Agent (Execution Evidence Profile 1.0, section 3.3). Result Evaluation Evidence is a signed in-toto Statement that names its evaluator, the exact Task and Results it judged, and optionally the evaluation specification it applied (section 4). Key-binding records bind a key to an Agent IRI through a ceremony; the first implementation derives each binding's strength from the ceremony type and rejects a record that states otherwise, and section 3 of the text below writes that rule into the specification. Signatures are DSSE over exact bytes.

What is missing is the vocabulary. The specification gives no name to any answer and no rule for deriving one. Each application therefore invents its own words, derives them its own way, and often lets the producer of a record state them. A record whose producer writes "independently evaluated" into it tells a reader nothing, because the producer is the party whose claim is in question. Two applications that both say "verified" may mean different things, and a reader cannot filter records from several applications by one question.

## Change

Add a new draft document, the Provenance Vocabulary 1.0, with the identifier `https://spec.jinn.network/profiles/provenance-vocabulary/v1`, following the precedent of `profiles/trace-vocabulary/v1`, and a vector corpus for it. Its text is below, marked as the text to install. No existing document changes.

This is a proposal rather than a draft pull request because it adds a new vector format: a vector here is a set of records plus a trust policy, with an expected label set.

The text is written here, inside the proposal, because the serving pipeline today inventories only documents produced by an implementation package, and this document is written in this repository. The implementing pull request that follows acceptance serves the text at its identifier and makes the pipeline able to carry a document that originates here.

### Text to install

> # Jinn Provenance Vocabulary 1.0
>
> **Vocabulary URI:** `https://spec.jinn.network/profiles/provenance-vocabulary/v1`
>
> **Status:** draft
>
> The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.
>
> ## 1. What this vocabulary is
>
> This vocabulary names the answers to four questions a reader asks of a judged result, and gives, for each answer, the rule a checker uses to derive it from records.
>
> A **provenance label** is an output of verification. A checker derives it. A producer never writes it.
>
> - A checker MUST derive every label from verified inputs only: valid signatures over exact bytes, key-binding and revocation records it has verified and accepts under its trust policy, anchors it has verified, and bytes it holds whose digests match the references that name them.
> - A checker MUST NOT take a label's value from any field of any record. A field that states a label's value is ignored. A producer can never raise a label by stating it.
> - Where an input a rule needs is missing, unverifiable, or ambiguous, the checker MUST output the lowest value that rule allows.
> - A label set is not evidence. A published label set is one checker's output; a reader who relies on it SHOULD derive the labels again from the records.
>
> The specification owns the names of the labels, their allowed values, and their derivations. Applications own presentation: an application MAY show labels in its own words, and MAY combine them into its own composite terms, provided each composite is a predicate over these labels and the underlying labels stay available to the reader (section 7).
>
> A subject **verifies** when every record the checker uses is valid under its family's rules, every signature on those records is valid, and no recomputation contradicts it (section 5.4). A checker MUST NOT label a subject that does not verify; it reports why instead.
>
> ## 2. The subject and the inputs
>
> The **subject** of a label set is one Result Evaluation Evidence record, identified by the digest of its envelope. It judges one Task and one or more Results.
>
> A checker labels the subject using:
>
> - **The evaluation:** the subject itself, a DSSE envelope over an in-toto Statement with predicate type `https://spec.jinn.network/attestations/result-evaluation/v1`.
> - **The execution:** the Execution Evidence whose Task digest equals the subject's task subject and whose Results include every Result the subject judges. If the checker holds none, or more than one, there is no execution for the purposes of this vocabulary.
> - **Executor attestations:** records sealed in a DSSE envelope, valid under their own family's rules, signed by the party that executed, that name the execution's metadata digest. A Delivery sealed in a DSSE envelope is an executor attestation when an `evidenceRecords` entry has family `execution-evidence` and that digest. The `agent` field of the Execution Evidence is the producer's claim about who executed, and is never, on its own, an executor attestation. An Execution Verification record is signed by a verifier, not the executor, and is not an executor attestation.
> - **Key bindings and revocations:** key-binding and revocation records obtained from the sources the checker's trust policy names, never only from records supplied with the subject. Records that would lower a label cannot be withheld by leaving them out of a bundle.
> - **Anchors:** verified anchors, accepted under the trust policy, that prove a record's bytes existed by a time.
> - **The evaluation specification:** the bytes named by the subject's `evaluationSpecification`, when present.
>
> Execution Verification records, and the `supersedes` and `disputes` references of an evaluation, are not inputs in this version. A surface that shows a subject SHOULD show whether a later record supersedes or disputes it.
>
> **The state of the records today.** No record kind in this specification is yet defined as signed by its executor: the Delivery vectors are unsigned, and Execution Evidence is not itself signed. Until one is, no subject has an executor attestation, and `executed-by` and `evaluator-distinct` are `not-established` for every subject. The rule is written now so that the label rises when executors sign, and not before.
>
> ## 3. Resolving a signature
>
> Several labels depend on who signed a record. A checker resolves a valid DSSE signature over a record to one of `identified-strong`, `identified-weak`, or `key-only`.
>
> **The resolution time.** The resolution time is the earliest time at which a verified anchor, accepted under the trust policy, proves the signed record's exact bytes existed. Without such an anchor it is the time the checker checks. A time the record states for itself, such as `evaluatedAt`, is never used: a signer cannot keep an expired or revoked binding in force by stating an earlier time.
>
> **Accepted bindings.** A key-binding record resolves the signing key when all of these hold:
>
> 1. The checker has verified it and accepts it under its trust policy.
> 2. It names a ceremony. A binding with no ceremony does not resolve.
> 3. Its `relationship` is `controls`.
> 4. Its `scope` includes `verdicts` when the signed record is an evaluation, or `deliveries` when it is an executor attestation.
> 5. It is in force at the resolution time: from its `validFrom`, or from its earliest verified anchor time where that is later, until the earlier of its `expiresAt` and the `effectiveFrom` of any accepted revocation that targets it. A binding with no verified anchor of its own is in force from its `validFrom` only when the resolution time is the time the checker checks; at any earlier resolution time it does not resolve. If a source the trust policy names cannot be reached, no binding resolves.
>
> **The result.**
>
> - `identified-strong`: at least one accepted binding resolves the key, all that do name one Agent IRI and one voucher identity, and the weakest strength derived from their ceremony types is strong.
> - `identified-weak`: as `identified-strong`, but the weakest derived strength is weak.
> - `key-only`: the signature is valid and no accepted binding resolves the key, or the bindings that resolve it name more than one Agent IRI or more than one voucher identity.
>
> Strength is derived from the ceremony type, never read from the binding's own `strength` field. A GitHub-human ceremony derives weak; account ceremonies (an externally owned account, a Safe, an agent identifier composed with an account ceremony) and machine identity ceremonies derive strong. Strong describes how firmly the key is tied to the identity, not how costly the identity was to create: accounts can be created freely.
>
> An identified result carries three things: the key id, the bound **Agent IRI**, and the **voucher identity**, which is the inspectable identity the ceremony proved, compared in the form of its ceremony type plus the identity's stable identifier (an account address, a machine identity's subject, a profile's numeric id; never a profile URL, which can change). Two identified results **match** when their key ids are equal, their Agent IRIs are equal, or their voucher identities are equal.
>
> ## 4. Out of scope in this version
>
> Two things are left out, and for both the answer is `not-established`:
>
> - the ceremony that binds a key to a real organization; and
> - wording for work run by a third party on another party's behalf. Where the key that signed an executor attestation is bound to an Agent other than the executor the Execution Evidence names, this version does not say the work was run by a third party. It says the executor is `not-established`.
>
> ## 5. The labels
>
> ### 5.1 `executed-by`: who executed the work
>
> | Value | Meaning |
> | --- | --- |
> | `identified-strong` | Every executor attestation held resolves to `identified-strong` for the same Agent the Execution Evidence names. |
> | `identified-weak` | Every executor attestation held resolves to an identified value for the Agent the Execution Evidence names, and at least one is `identified-weak`. |
> | `key-only` | Every executor attestation held has a valid signature, and at least one resolves to `key-only`. |
> | `not-established` | There is no execution, no executor attestation, the attestations resolve to different Agents or voucher identities, or a bound Agent differs from the executor the Execution Evidence names. |
>
> Derivation: resolve every executor attestation held (section 3). An attestation with more than one valid signature is resolved as in 5.2. If there are none, or two identified resolutions name different voucher identities, or any identified resolution names an Agent other than the primary executor Agent IRI of the Execution Evidence, the value is `not-established`. Otherwise the value is the lowest resolution among them, in the order `identified-strong`, `identified-weak`, `key-only`.
>
> Alongside the value, the checker reports each signing key id and, for an identified value, the bound Agent IRI, the voucher identity, and the ceremony type.
>
> ### 5.2 `evaluated-by`: who evaluated it
>
> | Value | Meaning |
> | --- | --- |
> | `identified-strong` | A signature on the subject resolves to `identified-strong`, bound to the Agent the predicate names as `evaluator.id`. |
> | `identified-weak` | As above, with `identified-weak`. |
> | `key-only` | Otherwise: no signature resolves to an identity bound to `evaluator.id`. |
>
> Derivation: for each valid signature on the subject, resolve it (section 3); if it resolves to an identity whose Agent IRI differs from `evaluator.id`, treat it as `key-only`. Report the highest result, in the order `identified-strong`, `identified-weak`, `key-only`, and on a tie the one with the lexically smallest key id. Alongside the value, the checker reports the key id and, for an identified value, the bound Agent IRI, the voucher identity, and the ceremony type.
>
> The value is never `not-established`, because a subject that is not validly signed does not verify and is not labeled.
>
> ### 5.3 `evaluator-distinct`: is the evaluator a different party from the executor
>
> | Value | Meaning |
> | --- | --- |
> | `same-party` | Some signature on the subject and some executor attestation share a key, an Agent IRI, or a voucher identity. |
> | `distinct-identities` | `executed-by` and `evaluated-by` are both identified, and no signature on the subject matches any executor attestation. |
> | `not-established` | Otherwise. |
>
> Derivation: compare every signature on the subject with every executor attestation, using the match rule in section 3 and comparing key ids for results that are `key-only`. `same-party` is checked first. Two different keys with no bindings are `not-established`, never `distinct-identities`: one party can hold any number of keys.
>
> `distinct-identities` says two different identities are bound. It does not say two different people or organizations stand behind them; that is the question of 5.5.
>
> ### 5.4 `recomputation`: can the verdict be recomputed, or is it attested only
>
> | Value | Meaning |
> | --- | --- |
> | `re-derivable` | The checker recomputed the verdict from published bytes and obtained the verdict the subject states. |
> | `attested-only` | Otherwise. |
>
> Derivation: the value is `re-derivable` only when all of these hold:
>
> 1. The checker holds the exact bytes of the Task, of every Result the subject judges, and of the evaluation specification the subject names by digest.
> 2. The evaluation specification names a procedure the checker implements, and that procedure is deterministic over those bytes and needs nothing else: no network, no hosted model, no service, no clock, and no randomness that is not fixed by the bytes.
> 3. The checker ran the procedure, and its output, canonicalized with RFC 8785, is byte-equal to the subject's `verdict` canonicalized the same way.
>
> If conditions 1 and 2 hold and condition 3 does not, the subject does not verify. If condition 1 or 2 fails, the value is `attested-only`: the verdict rests on the evaluator's signature alone.
>
> A checker that does not implement a procedure reports `attested-only` for it, even when another checker could recompute it. The value states what this checker established, not what is possible in principle.
>
> ### 5.5 `independence`: is the independence of the parties established
>
> | Value | Meaning |
> | --- | --- |
> | `not-established` | No accepted record establishes that the executor and the evaluator are independent parties. |
>
> Derivation: in this version the value is always `not-established`.
>
> Independence of two parties in the world is not a fact a signature can prove. At most it can be an anchored assertion: a record, signed by a named party the reader accepts, stating that two bound identities are independent, anchored in time. No record kind in this specification carries such an assertion yet. A later version adds a value for an anchored assertion, naming the asserting party and the assertion's digest, when such a record kind exists. No version will add a value meaning that independence is proven.
>
> ## 6. The honest ceiling
>
> These labels state what records establish, and no more.
>
> - A key binding anchors a key to an inspectable identity: an account, a machine identity, or a profile, by the ceremony its type names. It does not establish who controls that identity in the world.
> - `distinct-identities` establishes that two different identities are bound, not that two independent parties exist.
> - `re-derivable` establishes that the verdict follows from the bytes by the named procedure. It does not establish that the procedure is a good test of the work, or that the result is good.
> - Independence of parties is at most an anchored assertion by a party the reader chooses to accept. It is never a proof.
>
> A label set depends on the checker's trust policy: which sources of bindings and revocations, which ceremonies, and which anchors it accepts. Two checkers with different policies can derive different labels from the same records. A checker MUST report, with each label set, the digest of the trust policy it applied, the digests of the bindings and revocations it consulted, and the time at which it checked.
>
> ## 7. What a reader surface must show
>
> A surface that presents a judged result to a person MUST make all five labels reachable from it, each with its value in words that do not overstate it. For an identified executor or evaluator it MUST show the voucher identity and the ceremony type, and for `key-only` it MUST say that the key is not bound to any identity. It MUST show `not-established` as not established, never as a blank, a neutral mark, or an implied yes. It MUST NOT show any label the checker did not derive, including any label the producer stated. A composite term an application defines MUST be one step away from the labels it is built from. The surface SHOULD show which trust policy the labels were derived under.
>
> ## 8. Output form
>
> A checker that emits labels as data uses this shape:
>
> ```json
> {
>   "vocabulary": "https://spec.jinn.network/profiles/provenance-vocabulary/v1",
>   "subject": "sha256:<digest of the Result Evaluation envelope>",
>   "checkedAt": "<RFC 3339 time>",
>   "trustPolicy": "sha256:<digest of the trust policy applied>",
>   "bindings": ["sha256:<digest of each binding and revocation consulted>"],
>   "labels": {
>     "executed-by": { "value": "not-established" },
>     "evaluated-by": { "value": "identified-strong", "keyid": "<key id>", "agent": "<Agent IRI>", "identity": "<voucher identity>", "ceremony": "<ceremony type>" },
>     "evaluator-distinct": { "value": "not-established" },
>     "recomputation": { "value": "attested-only" },
>     "independence": { "value": "not-established" }
>   }
> }
> ```
>
> `keyid` appears with every value that rests on a signature; `agent`, `identity` and `ceremony` appear only with an identified value. The object is a checker's report. It is not a record kind, and it is never an input to another label derivation.
>
> ## 9. Conformance
>
> A checker conforms when, for every vector in this vocabulary's corpus, it derives exactly the expected label set, or reports that the subject does not verify where the vector expects that. A vector whose expectation depends on recomputation names the procedure it uses and also gives the label set expected from a checker that does not implement that procedure, with `recomputation` as `attested-only`; such a checker conforms on that vector when it derives that label set.

## Effect on existing records and implementations

**Records.** No record changes and no record becomes invalid. The labels are computed over records that already exist. Records that carry a producer-written field resembling a label are unaffected; a conforming checker ignores that field.

**Implementations.** The TypeScript implementation in `Jinn-Network/mono` gains a checker that derives these labels. It already derives key-binding strength from ceremony type and already refuses a producer-asserted strength, which section 3 relies on. No record kind is yet signed by its executor, so until one is, the checker derives `executed-by` as `not-established` for every subject; defining a signed executor attestation is separate work. Its benchmarking application derives an integrity tier with the same two names as `recomputation` (`re-derivable`, `attested-only`) from a replay-variance receipt; that tier is the application's own and is unaffected. Where the application presents a protocol-level recomputation answer, it uses this vocabulary's derivation.

Nothing breaks, because nothing in the specification names these labels today.

## Vectors

The implementing pull request adds a vector corpus with a digest manifest, in the same form as the other families. Each vector is a set of records, a trust policy, and the expected label set or the expected failure. The corpus covers at least:

- an executor attestation and an evaluation signed by keys with strong bindings to different Agents: `identified-strong`, `identified-strong`, `distinct-identities`;
- the same key signing both: `same-party`;
- two unbound keys: `key-only`, `key-only`, `not-established`;
- a GitHub-human ceremony whose binding states `strength: strong`: resolves as `identified-weak`, proving strength is derived, not read;
- an expired binding, with `evaluatedAt` backdated into its validity window and no anchor: `key-only`;
- a binding revoked before the check, where the bundle supplied with the subject omits the revocation but the trust policy's source holds it: `key-only`;
- a key bound to two different Agents, where the bundle omits one binding: `key-only`;
- a binding with no verified anchor: resolves at the time of checking, and does not resolve for a signature anchored before the check;
- two bindings of one key that name the same Agent and voucher identity, one by a strong ceremony and one by a weak one: `identified-weak`;
- a binding whose `scope` lacks `verdicts`: the evaluation resolves as `key-only`;
- two keys bound to different Agent IRIs through the same voucher identity: `same-party`;
- an evaluation co-signed by the executor's key and a distinct evaluator key: `same-party`;
- an executor attestation signed by a key bound to an Agent other than the executor the Execution Evidence names (a third-party run): `executed-by` is `not-established`;
- an Execution Evidence whose `agent` differs from the executor key's bound Agent: `executed-by` is `not-established`;
- an evaluation whose `evaluator.id` differs from its key's bound Agent: `evaluated-by` is `key-only`;
- Execution Evidence with no executor attestation: `executed-by` is `not-established`;
- a subject that carries a producer-written `labels` field claiming the highest values: every label is derived as if the field were absent;
- a deterministic evaluation specification with all bytes present and a matching verdict: `re-derivable`;
- the same with a differing verdict: the subject does not verify;
- an evaluation specification that calls a hosted model: `attested-only`;
- every vector: `independence` is `not-established`.

## Rationale

**Why labels are derived and never written.** The four questions are asked because the reader does not trust the producer. A label the producer writes answers them with the producer's word. Deriving every label from signatures, bindings and bytes, and ignoring any stated value, is the only rule under which a label means the same thing whichever application produced the record. The rule that missing inputs yield the lowest value closes omission of inputs the checker needs. Omission of records that would lower a label, a conflicting binding or a revocation, is closed by taking bindings and revocations from the trust policy's sources rather than from the producer's bundle. Backdating is closed by never using a time a record states for itself: a signature resolves at its earliest anchor time, or at the time of checking.

**Why the specification owns the names.** A reader who filters records from several applications by "evaluated by a distinct identity" needs one name with one derivation. If each application owned its own, the names would drift and the filter would mean nothing. Presentation is left to applications because words for people vary by audience, while the derivation must not.

**Why five labels for four questions.** The second question has two parts, who evaluated and whether that party differs from the executor, and each part has its own inputs and its own lowest value. Folding them into one label would lose which part failed.

**Why `distinct-identities` and not `independent`.** Two bound identities can belong to one person. Naming the value for what the records establish keeps the label from claiming more than it can, and leaves independence to its own label.

**Why `independence` has one value today.** The honest answer, from the records that exist, is that independence is not established. Defining an `asserted` value before any record kind can carry an assertion would invite applications to fill it from their own claims. The value is added in the version that adds the record kind.

**Why recomputation is relative to the checker.** "Anyone could recompute this" is not checkable; "this checker recomputed it and got the same verdict" is. A reader who wants the stronger claim runs a checker that implements the procedure.

**Why the subject is the Result Evaluation.** The questions are about a judged result. The evaluation is the record that binds the Task, the Results and a verdict under one signature, so it is the natural thing to label; the execution and its attestation are reached from it by digest.

**Alternatives set aside.**

- *Composite labels such as "independently executed" in the specification.* Useful, but each is a predicate over these labels, and choosing which predicates matter is presentation. Left to applications, subject to section 7.
- *A single trust score.* A number hides which question failed and invites comparison across policies that are not comparable.
- *Carrying labels in announcement facts.* A fact published by the producer is a producer statement. Labels are computed by the reader's checker; a feed can carry the inputs, never the outputs.
- *Specifying the key-to-organization ceremony and third-party execution now.* Both are needed for `independence` to rise above `not-established` and for executors other than the record's own producer to be named. Both are larger than this vocabulary and are left out; the labels answer `not-established` until they exist.

## Ruling

Filled in by the sponsoring maintainer: the ruling, the date, and one sentence of reason.
