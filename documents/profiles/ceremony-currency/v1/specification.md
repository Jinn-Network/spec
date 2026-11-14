# Ceremony currency

**Identifier:** `https://spec.jinn.network/profiles/ceremony-currency/v1`

**Applies to:** the profiled SIWE ceremonies of key bindings, `eoa` and `safe`, for records citing `https://spec.jinn.network/trust/key-binding/v1`

**Status:** candidate

The key words **MUST**, **MUST NOT** and **MAY** are to be interpreted as described by RFC 2119 and RFC 8174. *Effective start*, *readable*, *deployment profile* and the outcome names are those of the key authority text, `https://spec.jinn.network/profiles/key-authority/v1`.

## 1. What this text settles

A ceremony is an account's signature saying that it vouches a working key for an Agent IRI. Of the signatures on a key binding, only the ceremony speaks for the account. The envelope signature on a key-binding record proves possession of the key and nothing more.

A ceremony's message names the Agent IRI and the key, and the record must match them. That stops a ceremony being lifted to another key or another Agent, and it says nothing else. A record's `relationship`, `scope`, `validFrom` and `expiresAt` are sealed by the key being bound, so without more they are that key's word, not the account's. The holder of a key with an old ceremony could seal a new record over it, stating terms the account never saw.

This text lets an account commit to a record's terms, says what a ceremony's own times mean, and ties a ceremony to the site and purpose it was asked for. Nonce tracking is not the answer here: an offline verifier holds no nonce store.

## 2. What a ceremony commits to

The *terms* of a binding are a JSON object with the binding's `relationship`, `scope` and `validFrom`, and its `expiresAt` when it has one, each exactly as the record states it. No other field is a term. The *terms digest* is the SHA-256 of the RFC 8785 canonical form of the terms, as 64 lowercase hexadecimal digits.

A ceremony *commits to terms* when the last entry of its message's `resources` is `urn:jinn:trust:binding-terms:v1:sha256:` followed by a terms digest.

The account signs the `resources`, so a commitment is the account's word. A key that holds a ceremony cannot state other terms over it.

The record whose terms are `{"relationship":"controls","scope":["deliveries","verdicts","bindings"],"validFrom":"2026-07-28T00:00:00Z"}` has the terms digest `b6e3f9b48d4b2b992439e8f8d8081dff7668df5cadb8b0ec90f2b1aef7851bb9`. The same record with `"expiresAt":"2026-08-28T00:00:00Z"` has `1494223e6ce203bd9bbe3fa9f79508208acfad5e7d7afe323c416c70075c639e`. RFC 8785 sorts the keys, so `expiresAt` comes first in the canonical form.

## 3. Checking the commitment

When a ceremony's `resources` hold any entry that begins `urn:jinn:trust:binding-terms:`, a verifier MUST require that exactly one does, that it is the last entry, and that it equals the commitment recomputed from the record. Otherwise the ceremony fails. A record that states other terms binds nothing, whoever signed it.

The entries before the commitment keep their positions. The first two are the Agent IRI and the key. An entry a profile adds comes after them and before the commitment.

## 4. A ceremony's own window

A ceremony's *window* runs from its `issuedAt` to its `expirationTime`, both inclusive. With no `expirationTime` it has no end. `expirationTime` stays optional. The profiled message carries no `notBefore`.

A binding's effective start MUST lie in the window of the ceremony it relies on. Otherwise the ceremony fails. A record cannot take effect before the account vouched, or after the account's offer to vouch has ended.

This comparison uses the record's effective start and nothing else. A verifier MUST NOT compare a ceremony's times with its own clock. Evidence verifies offline forever, so a verdict over a given store does not depend on when it is reached.

A ceremony time that cannot be read fails the ceremony. These times are limits the account set, so an unreadable one is not dropped.

## 5. Where a ceremony was asked for

A ceremony's message names a `domain` and a `uri`. The `domain` names the site that asks the account to sign, and the `uri` names what it asks for.

Each deployment profile names one *ceremony domain* and one *key-binding ceremony URI*. A verifier MUST require a ceremony's `domain` to equal the ceremony domain and its `uri` to equal the key-binding ceremony URI, each compared as written, code unit for code unit. Otherwise the ceremony fails. A message that names another site, or another purpose, binds nothing, whoever signed it.

## 6. Requiring the commitment

Each deployment chooses whether to require the commitment. A deployment profile that requires anchors MAY name an instant, its *terms cutover*. A binding whose effective start is at or after the cutover, and whose ceremony does not commit to terms, fails its ceremony.

A profile that names no cutover admits such bindings. There a binding's `relationship`, `scope`, `validFrom` and `expiresAt` remain the bound key's word alone.

## 7. What a stolen working key is bounded by

Where a ceremony commits to terms, a stolen working key is bounded by `expiresAt`, `scope` and revocation, and the voucher account set the first two. Evidence signed between theft and an anchored revocation still attributes to the Agent, because revocation is never retroactive.

Where it does not, that bound holds only against a party who does not hold the key.

## 8. What this text does not state

- **Ceremonies with no SIWE message.** `agentId`, `oidc-machine` and `github-human` ceremonies carry no such message. Sections 3 to 6 do not apply to them, and section 7's bound is not claimed for them.
- **Other ceremony messages.** A profiled SIWE message that authorizes capabilities, rather than binding a key, is outside this text, and so is the URI a deployment names for it.
- **A store that omits records.** A verifier reads the store it holds. A revocation's reach, like the genesis binding itself, assumes the store is complete.
- **Revocations.** A revocation carries no ceremony. Its anchor places it in time.

## 9. Conformance

An implementation conforms to this text when it produces every expected outcome in the vectors under `@jinn-network/trust-testing/fixtures/ceremony-currency-v1/`. Their format is in that directory's `README.md`.

## 10. Why these rules (non-normative)

**Commit to the terms.** The content match plus validity windows is a replay defense only once the window is inside what the account signs. This is the smallest change that puts it there. It needs no new record field, no chain read and no nonce store, and it verifies offline forever.

**These fields and no others.** They are what bounds a stolen key. `agent` and `key` are already in the message. `voucher` is proven by the signature. `strength` is derived. `anchors` cannot be committed, because an anchor may cite a digest computed after signing. `consent` comes from another party, and its countersignature already covers the record. `supersedes` carries no authority. Extensions add information and never change how a field is read.

**The last position.** A reader that takes the first two entries keeps working, and so does a profile that reads a third.

**The effective start, not a clock.** A verifier that compares an expiration with its own clock gives a record one verdict today and another tomorrow. That makes expiry retroactive and ends offline verification. The effective start is fixed by the anchor, so the comparison gives one answer forever.

**`expirationTime` stays optional.** With the terms committed, a ceremony with no expiration can only restate what the account signed, and the key authority text keeps a revocation with the earlier record.

**A window as well as a commitment.** It gives the ceremony's times the meaning EIP-4361 gives them. It holds for a ceremony with no commitment, which is every ceremony sealed before this text. And `issuedAt` gives a lower bound the anchor cannot: an anchor shows only that a digest existed by a time, while `issuedAt` is the account saying when it vouched.

**A cutover, not a new record format.** A sealed ceremony vector in this repository, `@jinn-network/trust-core/fixtures/ceremony-v1/eoa-siwe.json`, carries two resources and no expiration and must keep verifying. Records citing `https://spec.jinn.network/trust/key-binding/v1` exist, and a published identifier never changes meaning. A cutover keeps old records readable, lets each deployment choose its moment, and is checkable, because under a profile that requires anchors the effective start is fixed by the anchor.

**Other rules considered.** `expirationTime` alone bounds when a record can start and not what it says, and closes nothing for ceremonies with no expiration. Requiring `issuedAt` to equal `validFrom` leaves a record that keeps its time free to change its scope and its end. Letting the first record that relies on a ceremony keep it decides by order, which the holder of a key can influence. Tying the ceremony to the record's digest is circular, since the record holds the ceremony's digest. Requiring `expiresAt` on every record leaves it the key's word.

**The deployment's domain and URI.** The content match ties a ceremony to a key and an Agent, and to nothing else. EIP-4361 has the wallet check a message's `domain` against the site that asks for the signature. So any site can have an account sign a message that names that site, and only the deployment's own site can have it sign one that names the deployment's domain without failing that check. A verifier that requires the deployment's domain accepts only the second kind. The `uri` names the purpose, so a signature asked for as a login, or for anything else, is not read as a key-binding ceremony. The values are the deployment's and not this text's, because a domain is the site where a deployment asks for ceremonies, and this repository holds no network's configuration. They are compared as written because two verifiers must agree, and a rule for which spellings name one host is one more thing to disagree on. Every key-binding ceremony vector that came before this rule names `trust.jinn.network` and `https://trust.jinn.network/ceremony/key-binding`, so under a profile that names them none of their outcomes changes.
