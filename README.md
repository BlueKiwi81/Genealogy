# Genealogy

This repository is the public deployment shell for a private, collaborative family-history application.

The browser application is intentionally static. Family data, evidence, research records, backend functions and database change history are stored outside the public deployment repository and are protected by authentication and database authorization rules.

## Public repository boundary

Only files required to build and operate the browser application belong here. In particular, do not commit:

- genealogical seed data or family-specific research notes
- database migrations, rollback scripts or database dumps
- backend/Edge Function source that contains private implementation or research context
- uploaded evidence, photographs or source documents
- service-role keys, secret keys, access tokens or other privileged credentials

The GitHub Pages workflow builds an allowlisted artifact from the browser dependency graph and refuses to publish SQL, Markdown or backend Supabase source into the site artifact.

## Family access

The public web shell does not grant access to the family archive. Family data is requested from Supabase only after authentication, and database row-level security and application authorization determine what an account may access.

## Credentials

The browser uses only a public/publishable Supabase client key. Privileged keys must never be committed to this repository.

## Development

Sensitive backend and research development belongs in the private source repository. This public repository should remain suitable for inspection by anyone without disclosing private family information.
