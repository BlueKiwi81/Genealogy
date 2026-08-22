# Deployment

The application is a static site and is prepared for GitHub Pages using `.github/workflows/pages.yml`.

## GitHub Pages setup

1. In the canonical `BlueKiwi81/Genealogy` repository, open **Settings > Pages**.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Merge the Phase 1 branch to `main` when ready. The workflow deploys only the site files (`index.html`, CSS, and browser JavaScript), not the Supabase schema or family seed data.
4. Copy the resulting Pages URL.

GitHub currently supports Pages from public repositories on GitHub Free. Pages from a private repository requires GitHub Pro, Team, Enterprise Cloud, or Enterprise Server. If the account does not support private-repository Pages, keep the data in Supabase and either make only the code repository public or use a different static host.

## Supabase Auth

After the production URL exists, add it to the Supabase Auth allowed redirect URLs/site URL. The browser already requests a redirect back to its current deployed URL.

## First administrator

1. Werner signs in through the deployed app with his email.
2. The app creates a pending access request.
3. Bootstrap that auth user once as an approved `admin` linked to the `werner` person record.
4. After that, the in-app editor desk can approve and link subsequent relatives without direct database administration.

## Privacy

The GitHub deployment contains no family seed data. The browser receives family information only from Supabase after authentication and RLS checks. Never add a Supabase service-role/secret key to client-side code.
