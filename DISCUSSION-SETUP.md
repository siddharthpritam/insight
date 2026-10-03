# Public questions and owner-only answers

The Discussion page now has a public question form, a read-only question-and-answer list for visitors, and a separate **Write privately** email link. Only Siddharth's authenticated account can publish or edit answers. The backend also lets him hide and restore questions.

**Current status (3 October 2026):** the website and questions service are deployed, and `discussion.enabled` is `true`. The public board loads the live D1 question list. Owner email-code sign-in, signed-token verification, and authenticated question loading have been verified in production. The Turnstile widget is rendering its human-verification checkbox; posting a test question and checking its owner answer remain pending that verification. Preview files never submit questions.

- Public board: https://insight.siddharthpritam.com/discussion/
- Owner page: https://questions.siddharthpritam.com/admin/
- Owner email: `pritam.siddharth@gmail.com`
- Access team: `https://insight-siddharth.cloudflareaccess.com`
- Access application: `Insight owner`; covers `/admin` and `/admin/*` only, with one owner-email Allow policy and email-code login.

The Worker variables contain the actual Access issuer and audience, and the public website configuration contains the actual API URL and Turnstile site key. The user stored `TURNSTILE_SECRET_KEY` directly in Cloudflare. No secret is committed to this repository. Revoke the temporary Access setup token after provisioning; normal website operation and Git-based deployments do not require it.

## Automated owner-login setup

The **Set up Insight owner login** GitHub Actions workflow runs only when manually dispatched on `main`. It uses the temporary repository secret `CLOUDFLARE_ACCESS_SETUP_TOKEN`. Grant that token only these **Account** permissions, scoped to the account already hosting `insight-questions`:

- Access: Apps and Policies — Edit
- Access: Organizations, Identity Providers, and Groups — Edit

The script preserves an existing Zero Trust organization, creates one only if absent, adds email-code login if needed, and creates one Access application covering `questions.siddharthpritam.com/admin` and `questions.siddharthpritam.com/admin/*`. Its single Allow policy includes only `pritam.siddharth@gmail.com`. Conflicting existing applications or policies stop setup for review; existing resources are never overwritten or deleted. No billing, DNS, Worker code, or database API is used. A subscription or account-onboarding error must be resolved in Cloudflare by the account owner.

The workflow prints only the public Access team URL, application audience, and application ID. Copy the team URL and audience into the Worker variables below, deploy through the existing Cloudflare Git integration, and verify owner login before enabling public posting. Revoke the temporary token in Cloudflare and remove its GitHub secret after setup is complete.

Safety checks can be run locally without credentials:

```sh
node --test scripts/setup-owner-access.test.mjs
```

## What runs where

The website remains on GitHub Pages. The small `discussion-service/` project runs on Cloudflare Workers, stores questions in D1, verifies visitors with Turnstile, and protects the owner area with Cloudflare Access. There is no visitor signup. Questions become public immediately after verification and explicit consent; this is not an approval queue.

The public API accepts question text and an optional display name only. It has no answer-writing route. Every owner request requires a signed Access token for the configured application and `pritam.siddharth@gmail.com`. Checking the email in a form or hiding a Reply button would not enforce this rule.

## 1. Prepare the service account and hostname

Use a Cloudflare account with Workers, D1, Turnstile, and Access available. This deployment recipe uses an unused service hostname in an **active Cloudflare DNS zone**. For example, `questions.siddharthpritam.com` can serve the Q&A backend while `insight.siddharthpritam.com` continues to serve GitHub Pages.

If your domains' DNS is managed elsewhere, this hostname prerequisite remains unresolved; these files do not move DNS or change nameservers. An existing Cloudflare-managed domain you own can host the service instead. Do not replace the academic site's root, www, mail, or existing Insight records.

In `discussion-service/`, with Node.js 24 installed:

```sh
npm ci
npm test
npm run check
npx wrangler login
npx wrangler d1 create insight-questions
```

Copy the returned database ID into `d1_databases[0].database_id` in `wrangler.jsonc`, replacing the all-zero placeholder. Keep the binding named `DB`. Apply the included schema:

```sh
npx wrangler d1 migrations apply insight-questions --remote
```

## 2. Protect the owner area

In Cloudflare Zero Trust, create a self-hosted Access application for the chosen service hostname. Cover `/admin` and every path beneath `/admin/` in the **same application**, including `/admin/app.js` and `/admin/api/*`. Leave `/questions` public. Do not enable whole-Worker sign-in: it would block readers and question submissions.

Create an Allow policy matching only the email `pritam.siddharth@gmail.com`. Enable an appropriate sign-in method, such as email one-time PIN. Do not add an Everyone or Bypass policy. Record the application's audience (AUD) and your Access team URL.

Fill these Worker variables in `wrangler.jsonc`:

| Variable | Value |
| --- | --- |
| `SITE_ORIGIN` | `https://insight.siddharthpritam.com`, without a trailing slash |
| `OWNER_EMAIL` | `pritam.siddharth@gmail.com` |
| `ACCESS_TEAM_DOMAIN` | Your actual `https://TEAM.cloudflareaccess.com` URL |
| `ACCESS_AUD` | The AUD of the owner Access application |

The Worker independently validates token signature, issuer, audience, expiry, application token type, and owner email. Missing or incorrect owner configuration prevents owner access. All admin mutations also check the request origin.

## 3. Deploy and add spam verification

Add the selected unused service hostname to `wrangler.jsonc` as a top-level field, replacing this example with your actual hostname:

```json
"routes": [
  { "pattern": "questions.siddharthpritam.com", "custom_domain": true }
]
```

Retain `workers_dev: false` and `preview_urls: false`. Then deploy the Worker:

```sh
npm run deploy
```

Create a managed Turnstile widget allowing the website hostname `insight.siddharthpritam.com`. Keep its public site key for the website configuration. Store its **secret key** in the Worker:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
```

Enter the secret at the prompt, not in source code. The Worker validates Turnstile on every question, including the expected hostname and `question` action. No secret belongs in `site.json`, frontend assets, or GitHub. Public posting fails until this secret is configured.

## 4. Connect the website

In the root `site.json`, replace `discussion` with your actual public values:

```json
"discussion": {
  "enabled": true,
  "provider": "owner-qa",
  "apiUrl": "https://questions.siddharthpritam.com",
  "turnstileSiteKey": "YOUR_ACTUAL_PUBLIC_SITE_KEY"
}
```

`apiUrl` must be the service origin only, with no `/questions` suffix. The build rejects missing values and non-HTTPS origins. From the project root, build and publish the website through its GitHub Pages workflow:

```sh
npm test
npm run build
npm run check
```

The existing Pages workflow deploys the static site only. The configured Cloudflare Workers Git integration deploys `main` separately, with project path `discussion-service`, build command `npm ci && npm test`, and deploy command `npx wrangler deploy`. A manual backend deployment can also be run with `npm run deploy` from `discussion-service/`. Build previews stay disabled even when the production board is enabled.

## Daily use

Visitors open **Discussion**, enter a question and optional name, consent to public posting, and complete verification. Questions and answers are shared across visitors and devices. The name is self-entered, not a verified visitor identity.

Siddharth opens https://questions.siddharthpritam.com/admin/, signs in with the code emailed to `pritam.siddharth@gmail.com`, and publishes an answer beneath the relevant question. An answer can be edited. **Hide question** removes the question and answer from the public board; **Restore question** returns it. Hidden records remain in D1. There are no visitor replies, public answer editor, or automatic email notifications.

The **Write privately** link opens an email to `pritam.siddharth@gmail.com`. Those messages do not pass through the public question database and are not posted automatically. The form does not collect private email addresses.

## Planned follow-up

Add permanent deletion for the authenticated owner, with a clear confirmation that the question and its answer will be removed permanently. Until implemented, **Hide question** and **Restore question** remain the available moderation actions.

## Activation checks

After deployment, verify reading and posting in a signed-out browser; an attempted admin request should require sign-in. Verify another account cannot enter the owner area. Sign in as Siddharth, answer a clearly labelled setup question, check that the answer appears publicly, and then hide that question. Test the private email link separately.

Local tests cover real SQLite inserts and pagination, rejected forged answer fields, Turnstile validation failures, signed-token authorization failures, owner answer updates, and hiding/restoring. `npm run check` creates the production bundle with Wrangler and runs the same tests against that bundle, including starting the served owner script without Worker build helpers. This catches a bundling issue found and fixed during the live deployment check.

Verified in production: successful GitHub Pages and Cloudflare Workers builds, an unauthenticated owner request leading to Access sign-in, owner email-code login, authenticated question loading, the public list loading, and the Turnstile widget rendering. Pending: posting the labelled setup question, publishing its answer, checking the public answer, and hiding that test question. A different real account has not been used for a live sign-in attempt; invalid and wrong-account signed tokens are covered by automated tests.

References: [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [Access token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
