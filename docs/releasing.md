# Releasing, and how the origin is deployed

A release of this repository is a semantic-version tag. Pushing that tag builds the served
root of every release group, signs each group manifest, deploys the bundle to
`https://spec.jinn.network`, and then proves the origin serves it. There is no human step
between the tag and the origin, and nothing else deploys the origin.

## Cutting a release

1. Land the change on `main` through a pull request. `check` runs on every pull request and
   on every push to `main`; it asserts, among other things, that each committed group
   manifest is reproduced byte for byte from `documents/` and `inventory.json`.
2. Add the release's entry to [`CHANGELOG.md`](../CHANGELOG.md) under a version heading.
3. Tag that commit on `main` and push the tag:

   ```
   git tag v0.1.0
   git push origin v0.1.0
   ```

The tag must match `v<major>.<minor>.<patch>`. A branch push never deploys: the release
workflow refuses anything that is not a tag before it runs any other step.

## What the release workflow does

[`.github/workflows/release.yml`](../.github/workflows/release.yml), in order:

1. Refuses the run unless the ref is a `v*.*.*` tag.
2. Checks out the tag, installs, and runs `npm run check`. Nothing is built for deployment
   until the byte-identity assertion passes.
3. Refuses to continue unless every provisioned secret is present, naming the ones that are
   not.
4. Builds one served root per release group with `scripts/build-profile-root.mjs`
   (`--lane stable`), signs each group manifest with `scripts/sign-profile-manifest.mjs`,
   and refuses to continue if a signature sidecar is missing. An unsigned manifest is never
   deployed.
5. Assembles the deploy bundle with `scripts/build-profile-host-bundle.mjs`. The bundle is
   the exact attested bytes of every group plus one generated `vercel.json` that pins each
   document's media type, a digest-derived strong entity tag, and its cache lifetime. That
   file is load-bearing: many served documents carry no file extension, or carry a version
   segment like `1.0` that a host would read as one, so nothing about a document's type can
   be left to the host to guess.
6. Writes the signing key's public half into the bundle at `keys/<key id>.pem`, so any
   verifier can fetch it at `<origin>/keys/<key id>.pem`. The private half is read from the
   secret into the process environment and is never written to disk.
7. Uploads the bundle as a workflow artifact, before deploying, so a failed deploy still
   leaves the exact bytes that were meant to be served.
8. Deploys with the Vercel CLI: `vercel pull`, `vercel build --prod`, then
   `vercel deploy --prebuilt --prod`. There is no git integration and no build command, so
   the deployed bytes are the bundle's bytes.
9. Runs `scripts/verify-live-host.mjs` against `https://spec.jinn.network`. It fetches every
   document of every group and compares bytes and media type, fetches each group manifest
   and its signature sidecar, verifies the signature against the key the origin publishes,
   and probes the origin for fallback behavior, including that `<origin>/manifest.json` is
   not served. It has no "host unreachable, skip" branch: every step is fatal.
10. Uploads the verification report, attaches each group's manifest and signature sidecar to
    the GitHub release for the tag, and prints the tag, the manifest digests and the
    verification result to the run summary.

## When the workflow fails

**A failed deploy or a failed verification is an alarm, not a retry.** The origin serves
whatever the last successful deploy left there, and a red release means the tag's bytes are
not what is being served. Do not delete the tag, and do not deploy by hand to make the red
go away.

- **Verification failed after a deploy.** Read the failure message: it names the URL and
  what differed. Bytes differing means the host served something other than the bundle. A
  content type differing means the generated `vercel.json` did not take effect. A 200 on an
  anti-fallback probe means the project has a catch-all or a rewrite that must be removed.
  Fix the cause, then cut a new patch tag. The bundle from the failed run is attached to it
  as an artifact, which is what to compare against.
- **The deploy step failed.** Nothing was published. Fix the cause and re-run the job, or
  cut a new tag if the fix is in the repository.
- **Secrets are missing.** The job says which. See the next section.

## What an operator provisions once

Three things, none of which any workflow can do for itself.

1. **The signing key.** Generate an Ed25519 key offline, keep the private half out of this
   repository, and add it as the repository secret `JINN_PROFILE_MANIFEST_SIGNING_KEY` (the
   PKCS#8 PEM) together with its identifier as `JINN_PROFILE_MANIFEST_KEY_ID`. The key id
   becomes a path segment at the origin, so it must be one literal URL segment; the workflow
   refuses anything else. The public half is derived and published by the workflow, so there
   is nothing to upload by hand.

   ```
   openssl genpkey -algorithm ed25519 -out jinn-profile-manifest.key
   ```

2. **The Vercel project.** Add `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as
   repository secrets for the project that owns the origin. The project needs no build
   command, no framework and no git integration: this workflow deploys prebuilt output.

3. **The domain.** Point `spec.jinn.network` at that project as a production domain, and
   **remove the deployment protection** from it. An origin behind a login wall publishes
   nothing: a verifier that cannot fetch a document cannot check it, and the live-host
   verification step will fail on every fetch until the protection is off.

## Verifying the origin by hand

No Jinn code is needed. `curl`, `jq`, `sha256sum` and `openssl` are enough.

Fetch a group manifest and a document, and check the document's bytes and media type
against what the manifest says:

```
curl -sS -o manifest.json https://spec.jinn.network/sealed-platform-v1/manifest.json
curl -sS -D headers.txt -o document https://spec.jinn.network/profiles/task-execution/v1

jq -r '.documents[] | select(.path == "profiles/task-execution/v1") | .sha256, .mediaType' manifest.json
sha256sum document
grep -i '^content-type' headers.txt
```

The digest printed by `jq` and the digest printed by `sha256sum` must be the same string,
and the media type printed by `jq` must be the type and subtype of the `Content-Type`
header. A `charset` parameter on the header is fine; a different type or subtype is not.

Then verify the manifest's signature. The envelope is a
[DSSE](https://github.com/secure-systems-lab/dsse) envelope over the exact manifest bytes,
and its pre-authentication encoding is
`DSSEv1 <length of the payload type> <payload type> <length of the payload> <payload>`:

```
curl -sS -o manifest.dsse.json https://spec.jinn.network/sealed-platform-v1/manifest.dsse.json
curl -sS -o signing-key.pem \
  "https://spec.jinn.network/keys/$(jq -r '.signatures[0].keyid' manifest.dsse.json).pem"

jq -r '.payload' manifest.dsse.json | base64 -d > payload.json
jq -r '.signatures[0].sig' manifest.dsse.json | base64 -d > signature.bin
cmp payload.json manifest.json

printf 'DSSEv1 42 application/vnd.jinn.profile-manifest+json %d ' "$(wc -c < payload.json)" > pae.bin
cat payload.json >> pae.bin
openssl pkeyutl -verify -pubin -inkey signing-key.pem -rawin -in pae.bin -sigfile signature.bin
```

`cmp` proves the envelope covers the bytes the origin serves as the manifest, and `openssl`
prints `Signature Verified Successfully`. `42` is the byte length of the payload type
string. `-rawin` needs OpenSSL 3; the LibreSSL that ships as `openssl` on macOS does not
have it, so use an OpenSSL 3 build there.

What this proves is the whole chain: the key the origin publishes signs the manifest, the
manifest names the digest of every document, and each document's bytes hash to the digest
the manifest names. What it does not prove is who holds the key. No published record yet
binds the key to the maintainers named in [`GOVERNANCE.md`](../GOVERNANCE.md); see "What is
not yet proven" in the [README](../README.md).

## The previously generated host repository

Before this workflow existed, `spec.jinn.network` was served from a separate generated
repository that a person refreshed by hand from the implementation's build artifacts. Its
manifests carried no signature and it drifted from the implementation between refreshes.
Once this repository's first release has deployed and verified green, that repository is
archived with a front page pointing here, and nothing references it.
