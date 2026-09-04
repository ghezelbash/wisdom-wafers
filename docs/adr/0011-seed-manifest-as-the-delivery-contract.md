# 11. The seed manifest is the content delivery contract

Date: 2026-09-04 · Status: accepted

## Context

The publish pipeline recorded a `bundlePath` on the catalogue document and the
client handed that value straight to `fetch()`. It is a Storage object path, not
a URL, so remote downloads could never have worked: on web the request resolved
against whatever origin the app was served from, and on device it failed
outright. The download path also read `bundleUrl` and `checksum` off the `Seed`
domain object, which `bundleToSeed` never produces — so the branch was dead and
every download fell through to a simulated seven-tick progress bar.

Three smaller faults sat behind the same seam. The catalogue document carried no
size and no schema version, so nothing could quote a real download cost or
reason about compatibility. `saveCatalog` wrote `revision: 1` for every entry,
so a device could not tell which revision it was holding. And `lastSyncedAt`
advanced on a refresh that had thrown, so the offline banner stated a freshness
the content could not back up.

## Decision

One type, `SeedManifest`, in `packages/content-schema` — shared by the
publisher, the client and the tests:

```
seedId · revision · storagePath · checksum · bytes · schemaVersion · publishedAt
```

`publishSeed` writes it onto both the revision document and the catalogue
document; `rollbackSeed` restores the manifest of the revision it points back
to, so no field can drift out of step with the artifact it describes.

`storagePath` is an **object path**, and the schema refuses a value carrying a
scheme, a leading slash or a `..` segment. `assertStoragePath` applies the same
rule again at the transport boundary. Bytes are fetched by resolving that path
through the Storage SDK (`getDownloadURL`, then `fetch` on the URL the SDK
produced) behind a `BundleStorage` interface — so no path from the catalogue is
ever used as a URL, and the transport is substitutable in tests.

On the device, `DeviceCatalog` is the single path to catalogue state, with two
backends behind one API: SQLite on device, a key-value document elsewhere. Two
invariants hold on every path through it:

- **Nothing unverified enters.** A bundle is checked against the manifest
  checksum before it is written, and again on every read of the kept file.
- **A refresh either commits or changes nothing.** Seeds, manifests and the
  sync point land in one transaction, so the sync time cannot move without the
  content that justifies it.

## Consequences

- Migration 2 adds `seed_manifest` and `catalog_sync`, and adds `seed_json`
  beside `catalog_seed.manifest_json` — the old column always held the seed, not
  a manifest, and the name became actively misleading. Nothing is dropped.
- Deleting a download deletes the row *and* the file; the manifest stays,
  because the seed is still published.
- A kept copy that stops matching its checksum becomes `corrupt` on the next
  launch and is re-fetched. It is never parsed and never rendered.
- `imageBytes` is zero until images are actually downloaded, and the storage
  screen's image row reads zero rather than a fabricated 780 KB per block. The
  download button quotes the manifest's size or no size at all.
- **Known limit.** The device's SQLite copy of a seed is written only from
  checksum-verified bytes, but is not independently re-verified on read — the
  kept file is. Making the row self-verifying means storing the bundle rather
  than the seed, which is a change to the catalogue read path and is deferred.
- `RemoteContentSource.fetchSeed` takes a manifest and returns the seed, the
  bundle and the manifest together, so a caller can persist exactly what it
  verified rather than re-deriving it.
