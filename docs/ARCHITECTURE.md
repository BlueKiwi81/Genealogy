# Genealogy application architecture

## Purpose

A shared, moderated family-history network that can be re-centred on any family member and later produce personalised family notebooks or books.

## Principles

1. **The database is canonical.** The HTML/SVG tree is a renderer, not the source of truth.
2. **Family submissions are proposals.** A recollection or correction is preserved as submitted until an editor reviews it.
3. **Original language is retained.** Afrikaans, English, or another language can be stored exactly as contributed; an edited or translated version is separate.
4. **Evidence status stays visible.** Documented, strong, family-supplied, probable, hypothesis, and unresolved are distinct states.
5. **Adopted and biological children are not visually distinguished in the family-facing tree.** The family tree represents family belonging. If genetic ancestry matters for a specialised research view, it can be handled separately later.
6. **Relationship history is contextual, not adversarial.** Divorce or ended partnerships can be retained as life events or former-spouse relationships without visually breaking a person out of the family network.
7. **Living-person data is private by default.** The web shell may eventually be public, but family records require authentication and approval.

## Phase 1

- Static GitHub-hostable front end.
- Supabase passwordless sign-in.
- Approved family-member gate.
- People and relationship graph.
- Dynamic "make me the centre" ancestor fan.
- Person detail panel.
- Family contribution form.
- Moderator-ready contribution queue in the database.

## Later phases

- Editor dashboard and merge/reconciliation workflows.
- Source/document uploads and protected media storage.
- Rich narrative event timelines.
- Branch-specific permissions/editors.
- AI-assisted draft narratives that use approved family facts and sources.
- Personal book/notebook projects centred on a chosen person.
- Print-ready exports for perfect-bound books, ring binders, or digital notebooks.
