# Release records

One file per build that leaves this machine, named `<date>-<profile>.md`, from
`TEMPLATE.md`. A build with no record here did not happen: the record is what
lets a second person install the same artifact, and what a rollback decision is
made from.

Nothing in a record is a secret. Project ids, build ids, checksums and artifact
URLs are identity; keys, keystores and service accounts never appear.
