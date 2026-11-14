# Key authority

**Identifier:** `https://spec.jinn.network/profiles/key-authority/v1`

**Applies to:** records citing `https://spec.jinn.network/trust/key-binding/v1` or `https://spec.jinn.network/trust/revocation/v1`

**Status:** candidate

The key words **MUST**, **MUST NOT** and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174.

## 1. What this text settles

A key binding says that a working key speaks for an Agent IRI. A later binding, and a revocation, need authority from a binding that came before. This text says when a binding stands, who may give authority, and how revocations apply, so that two verifiers reading the same records reach the same verdict.

A verifier holds a *store*: the binding and revocation entries it has for an Agent. A store may hold anything. A verdict is a function of the set of entries in the store. It MUST NOT depend on the order a store lists them in.

A *key* is a working key in its `did:key` spelling. Two vouchers are *the same voucher* when they name one identity: the same `did`, the same `caip19`, the same `subject`, or the same `profile` and `id`. Other fields of a voucher do not count.

*Lowest digest* compares two `sha256:` digests by their UTF-16 code units.

A *deployment profile* is what a deployment publishes for these texts: whether it requires anchors, its trust policy, and whatever else a text leaves to it.

## 2. Time

**Reading a time.** A time is *readable* when it is an RFC 3339 date-time with hours, minutes and seconds, an optional fraction, and `Z` or a numeric offset, that names a day the calendar holds. Second 60 is readable only at the end of a UTC June 30 or December 31. Two readable times compare as instants at the full precision written, never as text. A time that cannot be read sorts after every readable time. Two such times sort by their UTF-16 code units.

**Effective start.** A record's *anchor time* is the earliest time an anchor surface reports for any of its anchor references. A binding's *effective start* is the later of its `validFrom` and its anchor time. A `validFrom` that cannot be read claims nothing, so the effective start is the anchor time. A binding with no anchor time is *unanchored*. Under a profile that requires anchors an unanchored binding has no effective start. Under any other profile its effective start is its `validFrom`, which, if it cannot be read, sorts after every readable time.

**Effective time.** A revocation's *effective time* is the later of its `effectiveFrom` and its anchor time. An `effectiveFrom` that cannot be read claims nothing, so the effective time is the anchor time. An unanchored revocation has no effective time and never takes effect, under any profile.

**Window.** A binding is *in window* at instant T when its effective start is at or before T and, if it has an `expiresAt`, T is at or before `expiresAt`. Both ends are inclusive. An `expiresAt` that cannot be read does not end the window for section 4, and a binding that holds one gives no authority and supports no evidence.

## 3. Stored entries

A *stored entry* is what a store holds for one record: the digest the store files it under, the record's fields as far as they can be read, its envelope, and any ceremony evidence the store holds with it. Its anchor references are its `anchors` field.

A binding entry is *placed* when it has a digest, its anchor references can be read, and it has an effective start. A placed entry is a *readable binding* when it also conforms to the key-binding schema and carries its envelope.

A placed entry counts when deciding what came first (section 5), whatever else it holds. Only a readable binding can resolve or give authority. An entry that is not placed has no effect.

A revocation entry is read when its anchor references can be read and it carries a `revokedBy` and its envelope. It need not otherwise conform. A revocation by a signer with authority does not lapse for how the rest of it is spelled.

**One digest, several entries.** A store that takes digests as given can file more than one entry under one digest. Every rule in this text judges an entry, not a digest. Whether an entry is placed, whether it is a candidate, whether it is usable, whether its chain holds and whether a revocation is authorized against it are decided from what that entry holds, and nothing decided for one entry is decided for another filed under the same digest. Where a rule names an entry by its digest, it names every entry filed under that digest. Entries alike in everything they hold, their digest included, are one entry.

## 4. What resolves for a key

The *candidates* for key K and Agent A at instant T are the readable bindings of K to A that are in window at T and whose envelope K signed. An `eoa` ceremony is checked offline, at step 4 of section 9. Any other ceremony counts only if a leg the verifier holds has verified it: a binding with a ceremony the verifier has no leg for is no candidate.

An `agentId` ceremony counts only on an `agentId` voucher, and its leg is composition. Composition holds at T when the account that the registry names as the agentId's owner holds a binding to the same Agent, under that account as voucher, that stands at T (section 6). Registry facts alone never vouch an Agent.

What *resolves* is the candidate with the earliest effective start, a tie going to the lowest digest, and among candidates filed under that digest to one that claims founding (section 5). A candidate whose ceremony fails MUST NOT beat one whose ceremony verifies, whatever its time. If no candidate's ceremony verifies, the same order runs over all of them, and verification names the failure at step 4 of section 9. If there is no candidate, nothing resolves.

Where more than one candidate exists, a verifier MAY report the conflict to its trust policy; the report changes no outcome except through step 9.

A record that resolves has not been judged. Sections 6 to 8 judge it.

## 5. What came first

The *genesis binding* of an Agent is decided over every placed entry for that Agent, not only those that resolve. Take the placed entries with the earliest effective start. An entry *claims founding* when it is a readable binding with `relationship` `controls` and no `consent`. If any of them claims founding, keep only those that do, and if those name more than one voucher, the Agent has no genesis binding. Otherwise the kept entry with the lowest digest holds the first place, and it is the genesis binding. If more than one kept entry is filed under that digest, each of them holds the first place and is a genesis binding, and what this text says of the genesis binding it says of each.

A record this verifier cannot check may be the true founder, and leaving it out would make the next record the founder of the Agent. So an entry that will never resolve can hold the first place. The binding after it is then not the genesis binding and needs authority like any other.

An Agent with no genesis binding has no binding whose chain holds, so every binding of it fails step 7 of section 9.

The *founding account* is the voucher of the genesis binding.

## 6. When a binding stands

Authority is named by key. The record that gives it is the one that resolves for that key and Agent at the instant being judged. A record that names the key and does not resolve there gives nothing, and neither does one that lost the conflict over the key.

A binding B is *usable* at instant T when all of these hold:

1. B is in window at T.
2. B's envelope was signed by the key it binds.
3. B's ceremony verifies.
4. No authorized revocation that reaches B (section 8) took effect strictly before T.

B *stands* at T when it is usable at T and its chain holds (section 7).

An incumbent, a consenter, a revoker and the account binding of a composition each give authority, and each MUST stand at the instant it gives it. An incumbent and a consenter are judged at the effective start of the binding they authorize. A revoker is judged at the revocation's effective time. So a later expiry or revocation of an authority takes nothing back, and a back-dated `validFrom` reaches no authority that had already ended.

## 7. Chains

The chain of the genesis binding holds. Any other binding B, with effective start S, needs an authority at S.

**Self-extension.** A readable binding in window at S with `relationship` `controls`, under the same voucher as B, names a key. What resolves for that key at S is a `controls` binding under the same voucher. That binding is the authority. A binding with an `agentId` voucher has no authority of this kind: an `agentId` ceremony signs no key, so such a binding joins only by consent.

**Consent.** B carries `consent`. The countersignature verifies: it is a DSSE signature by `consent.keyid` over the payload type `application/vnd.jinn.trust.key-binding.v1+json` and the RFC 8785 canonical bytes of the record with its `consent` field removed. What resolves for `consent.keyid` at S holds `bindings` scope. That binding is the authority. A countersignature that cannot be read is no signature.

An authority with an effective start before S gives authority when it stands at S.

**One instant.** An authority with an effective start equal to S gives authority when it is usable at S and its own chain holds. Bindings with one effective start may therefore authorize each other, in any order, and no digest decides which.

Chains are the least relation that satisfies this section: a binding's chain holds only if that can be shown from the genesis binding in finitely many steps. A binding cannot authorize itself. A set of bindings that authorize only each other holds nothing up, however it is entered.

**The founding account.** When the authority under self-extension is the genesis binding, step 4 of section 6 counts only revocations signed by the founding account. This exception is for self-extension alone. As a consenter and as a revoker the genesis binding falls to any authorized revocation, and as evidence it is revoked like any other.

So a founding account can mint a new binding, through a ceremony that account signed, after a working key has revoked the genesis binding. This ends in two ways: the genesis binding leaves its window, or the founding account's own revocation reaches it. A voucher that cannot revoke under section 8, a contract account or one that is not an account at all, leaves only the window to end it. Every other account stays removable: any authorized revocation of its binding ends its self-extension, and it returns only by consent.

## 8. Revocations

**What a revocation reaches.** Records are *siblings* when they are readable bindings of one key to one Agent under the same voucher and that key signed them. Their ceremonies are not asked. A revocation names a digest, and so every entry filed under it (section 3). It reaches each readable binding it names that its key signed, whether or not that record was in window at the revocation's effective time. It also reaches every sibling of such a record, if both were in window at the revocation's effective time. A revocation that names no readable binding its key signed reaches nothing.

So a replacement beside a revoked record cannot leave the revocation behind, and a record that ends later lifts nothing. A record that first takes effect after the revocation shares nothing with it. A record under another voucher shares nothing, and stands on its own chain.

**Who may revoke.** A revocation with effective time E, judged against a record B it reaches, is *authorized* when one of these holds:

1. **The voucher account.** `revokedBy` is the `did:pkh` of B's voucher, that voucher is not a contract account, and that account signed the revocation. The account needs no binding of its own.
2. **The key itself.** `revokedBy` is B's key, that key signed the revocation, and a record N the revocation names, B or a sibling of B, was in window at E, N's ceremony verifies, and N holds `bindings` scope. No chain is asked: a key giving up its own binding gives no authority to anyone. The scope is N's, not that of whichever record answers for the key at E.
3. **A key of the Agent.** `revokedBy` is a key, B's own included, that key signed the revocation, what resolves for it at E holds `bindings` scope, and that binding stands at E.

Any other revocation has no effect, whatever time it states. Authority is settled before the time is read. An authorized revocation whose effective time cannot be read counts at every instant.

**An account's signature.** An account signs a revocation with a DSSE signature whose `keyid` is the account's `did:pkh`. The `sig` is a 65-byte EIP-191 `personal_sign` signature, `r || s || v`, over the DSSE pre-authentication encoding of the envelope's payload type and payload. The address it recovers MUST be the account's. A revocation carries no ceremony. Its anchor places it in time, so no separate freshness applies.

**Contract accounts.** A voucher whose `contractAccount` is `true` is a contract account. It cannot revoke under this text, and a revocation whose `revokedBy` names one has no effect.

**When a revocation counts.** For evidence and for the settlement join, an authorized revocation counts from its effective time, that instant included. For authority it counts strictly before the instant judged (section 6). An act is judged by the state it was taken in, so a successor can revoke the binding it descends from, and two keys that revoke each other at one instant both take effect.

## 9. Verifying an envelope

Given an envelope signed by key K, claiming Agent A, for record family F, at time T, a verifier runs these steps in order and reports the first that fails.

| Step | Check | Outcome on failure |
| --- | --- | --- |
| 1 | T is readable. | `window-violation` |
| 2 | K signed the envelope. | `envelope-signature-invalid` |
| 3 | Something resolves for K and A at T (section 4). | `binding-not-resolved` |
| 4 | Its ceremony verifies. | `ceremony-verification-failed` |
| 5 | It is in window at T, and it has no `expiresAt` that cannot be read. | `window-violation` |
| 6 | Its `scope` covers F. | `scope-violation` |
| 7 | Its chain holds (section 7). | `consent-chain-violation` |
| 8 | No authorized revocation that reaches it counts at T (section 8). | `revoked` |
| 9 | The deployment's trust policy accepts it. | `policy-rejected` |

If every step passes, the outcome is `accepted`.

## 10. The settlement join

A join ties an evidence signature to an on-chain actor. It takes a verdict key, a settlement key, an Agent, a record family, the time T at which section 9 accepted the envelope, called the envelope's time below, and the claim time. It holds only if all of these hold, and a missing leg fails it.

1. **The verdict leg.** Something resolves for the verdict key and the Agent at the envelope's time. Its `scope` covers the family, and its `relationship` is `controls` or `signs-for`. No authorized revocation that reaches it counts at the envelope's time.
2. **The settlement leg at the envelope's time.** Something resolves for the settlement key and the Agent at that time, it holds `settlements` scope, no authorized revocation that reaches it counts at that time, and it stands at that time.
3. **The settlement leg at the claim time.** Something resolves for the settlement key and the Agent at the claim time, and it holds `settlements` scope. No authorized revocation counts at the claim time against this record, or against the record of step 2. A later record for the key does not lift a revocation of the record the envelope was joined to.

## 11. A stolen `bindings` key

A `bindings` key can revoke the Agent's bindings, and it can consent a new account. Its revocations are a denial of service with a stated way back: the founding account can mint a new binding under section 7, give it `bindings` scope, and through it consent any other account back in and revoke what the stolen key consented. An account that was consented in cannot recover by itself. Recovery lasts as long as the genesis binding's window, so a genesis binding with an `expiresAt` also bounds how long the founding account can return.

## 12. What this text does not state

- **What an anchor reference covers.** A verifier here reads a time from an anchor surface. This text does not say how a verifier checks what a referenced digest is a digest of. Until a text does, a place in time is only as good as the control over what enters the store.
- **Whether a ceremony is current.** A separate text covers it.
- **Which of two candidates under one digest resolves.** Section 4 breaks a tie between candidates filed under one digest only by a founding claim. Between two that still tie, section 1 rules out the order a store lists them in, but this text does not say which resolves, so two verifiers can resolve different entries for one key.
- **Whether a failed read is a refusal.** A verifier that could not read a dependency has not reached a verdict. This text covers verdicts.
- **The record schemas.** This text relies on the key-binding and revocation schemas, which this repository does not yet serve. Until it does, a binding's `validFrom` or `expiresAt` conforms when it is written `YYYY-MM-DDTHH:MM`, then optionally `:SS` from 00 to 59 and a fraction, then `Z`, and names a day the calendar holds. So a time without seconds conforms although section 2 cannot read it, and an offset or a second 60 does not conform although section 2 could read it.

## 13. Conformance

An implementation conforms to this text when it produces every expected outcome in the vectors under `@jinn-network/trust-testing/fixtures/key-authority-v1/`. Their format is in that directory's `README.md`. They do not yet cover `agentId` composition.

## 14. Why these rules (non-normative)

**An authority must stand.** A resolved record is data. The point of a consent chain is that a stranger's genuine ceremony over the stranger's own account binds nothing to someone else's Agent. If a second such record could draw authority from the first, the chain would stop nothing. So authority runs back to the genesis binding, through records that each verify.

**Authority is judged at the candidate's effective start.** That is the instant the act entered the record. `validFrom` is the author's claim, and judging there would let a back-dated record reach an authority that had ended. Evidence time is too late: a consented binding would fall when its consenter later expires, which would make expiry retroactive.

**Authority comes from what resolves.** A key can be named by several records. If any of them could give authority, a record that lost the conflict over a key could still lend that key's standing to its own voucher.

**Least relation, and no digest at one instant.** A walk that gives up on a repeat answers differently depending on where it enters a ring. The least relation has one answer. It lets a batch sealed in one session stand as a batch, while a ring of strangers at one instant stands on nothing. A digest order among same-instant bindings would make a real batch valid or invalid by chance.

**Strictly before for authority, at for evidence.** With an inclusive boundary an authority at instant T depends on revocations at T, whose signers are judged at T, and those can depend on the first authority. Two keys that revoke each other at one instant then have two consistent answers. With a strict boundary every revocation's signer is judged at a strictly earlier instant than the fact it decides, so the question always ends and has one answer. Evidence has no such loop. The cost: an act that lands at the same instant as the revocation of its authority holds, a window of one anchor tick.

**A founding claim goes first at a tie, and two vouchers found nothing.** A batch at the founding instant can include a delegate with `signs-for`, or a record consented by the genesis key. Neither should take the founding by digest. A digest is a value its author can try again for. That is fine for ordering records that agree, as records of one account do. An honest founding never ties across accounts, because a second account joins by consent, so two founding claims from two accounts at one instant have no honest reading, and the text refuses rather than let a digest choose.

**Every placed entry counts for what came first.** A verifier that drops a record it cannot read, or a ceremony type it cannot check, makes the next record the founder. Counting it fails closed. The cost: an entry that does not parse, placed before the genesis binding, displaces it, and the entry gains nothing.

**An entry is judged alone, whatever digest it is filed under.** A store that takes digests as given can file a stranger's entry under an honest record's digest. If a fact about one entry carried to the other, the stranger's entry could lend the honest record its failures, or borrow its standing, according to which one a verifier happened to read first. Judging each entry from what it holds gives one answer, and an entry gains nothing, and costs another nothing, by where it is filed.

**A start that cannot be read claims nothing, and an end that cannot be read gives nothing.** A stated start can only delay, and the anchor is the bound that matters. A stated end is a limit, and reading an unreadable one as no end would extend a key's life.

**Revocations are shared, within a window and a voucher.** Anyone who holds a key can seal it again, so revocation cannot stay with one digest. The reach is read at the revocation's own time so a record ending later lifts nothing. It stops at that window so a voucher can bind a key again once what was revoked has ended. It stops at the voucher because a record under another voucher has its own chain. A sibling whose ceremony fails still shares: a key entitled to revoke it could have revoked the key directly.

**A key's own revocation reads the record it names.** The record that answers for a key at an instant can change. If the act drew on that record, a replacement without `bindings` scope could undo it. It needs no chain because it gives nothing to anyone.

**The founding account can recover.** The alternatives each break something. If every account were alike, a key entitled to revoke could end the Agent, with no way back. If no working-key revocation ended any account's self-extension, an account consented in could never be put out. If nothing ended the founding account's, an owner could never retire it. The exception covers minting only, which needs a ceremony that the thief of a working key does not hold. It does not cover consent or revoking, which are the acts that thief would want.

**An account signs the revocation record.** A revocation already has a DSSE envelope and an anchor. A signature over the envelope's pre-authentication encoding fits what exists, verifies offline, and cannot be read as a login or a binding ceremony.
