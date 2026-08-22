# Genealogy

A private, collaborative family-history application.

The project separates the **family graph** from the **tree renderer**. People, relationships, narratives, sources, and proposed corrections live in Supabase; the browser builds a family view from that shared data.

## Phase 1 goals

- passwordless family sign-in
- approval gate for family access
- re-centre the tree on any person
- clickable person detail panels
- submit stories, corrections, dates, places, relationships, or sources for review
- preserve evidence status and original-language contributions

## Hosting

The app is intentionally a static HTML/CSS/JavaScript front end so it can be hosted simply. Sensitive family information is not committed to this repository.

## Supabase

Project connection uses a public/publishable browser key only. Never commit a service-role or secret key.

The initial schema is in `supabase/migrations/001_initial_genealogy_schema.sql`.

## Development branch

Phase 1 is being built in `feat/phase-1-foundation` and reviewed through a draft pull request before merge to `main`.
