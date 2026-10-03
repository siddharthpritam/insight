# Public questions and owner-only answers

The Discussion page now has a public question form, a read-only question-and-answer list for visitors, and a separate **Write privately** email link. Only Siddharth's authenticated account can publish or edit answers. The backend also lets him hide and restore questions.

**Current status:** implemented and tested locally; not connected to a live service. `discussion.enabled` stays `false` until setup is complete. Preview files never submit questions.

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

The existing Pages workflow deploys the static site only. Backend updates require running `npm run deploy` from `discussion-service/` separately. Build previews stay disabled even when the production board is enabled.

## Daily use

Visitors open **Discussion**, enter a question and optional name, consent to public posting, and complete verification. Questions and answers are shared across visitors and devices. The name is self-entered, not a verified visitor identity.

Siddharth opens `https://YOUR-SERVICE-HOST/admin/`, signs in, and publishes an answer beneath the relevant question. An answer can be edited. **Hide question** removes the question and answer from the public board; **Restore question** returns it. Hidden records remain in D1. There are no visitor replies, public answer editor, or automatic email notifications.

The **Write privately** link opens an email to `pritam.siddharth@gmail.com`. Those messages do not pass through the public question database and are not posted automatically. The form does not collect private email addresses.

## Activation checks

After deployment, verify reading and posting in a signed-out browser; an attempted admin request should require sign-in. Verify another account cannot enter the owner area. Sign in as Siddharth, answer a clearly labelled setup question, check that the answer appears publicly, and then hide that question. Test the private email link separately.

Local tests cover real SQLite inserts and pagination, rejected forged answer fields, Turnstile validation failures, signed-token authorization failures, owner answer updates, and hiding/restoring. The deployment bundle was also checked with Wrangler's dry run. Live Access login and production posting have not been tested yet.

References: [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Access applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [Access token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/).
