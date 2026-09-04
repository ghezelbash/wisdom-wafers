# Backup, export and the restore drill

## What has to survive

| Data | Where | Recovery |
|---|---|---|
| Published bundles | Storage, immutable per revision | Never deleted; rollback is a pointer move |
| Catalogue metadata | Firestore `seeds`, `seedRevisions`, `topics`, `paths` | Scheduled export |
| Reader progress and reviews | Firestore under `users/{uid}` | Scheduled export |
| Reader reflections | The device only, by design | **Not recoverable** — say so in the UI |
| CMS drafts | Firestore `cmsDrafts` | Scheduled export |

## Scheduled export

```bash
gcloud firestore export gs://<bucket>/backups/$(date +%F) --project <project>
```

Daily, retained 30 days. Storage bundles need no backup while versioning is on:
every revision is its own object.

## The drill

A backup nobody has restored is a hope. Once a quarter:

1. Import the most recent export into a scratch project.
2. Point a staging build at it.
3. Open a seed, finish it, and check that progress and streak read correctly.
4. Record how long the whole thing took. That number is the real RTO.

## A reader asks for their data

Export covers every `users/{uid}` subcollection, their Storage files, and their
push tokens. Deletion is a Function for the same reason: a client delete cannot
reach subcollections, and half-deleted is worse than not started.

Reflections never left the device, so an export cannot include them — and the
delete-account screen has to keep saying so.
