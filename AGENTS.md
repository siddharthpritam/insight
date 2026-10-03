# Working on Insight

- This site is for Siddharth Pritam's videos and writings at `insight.siddharthpritam.com`.
- Keep the voice clear, personal, and independent of religion, tradition, or lineage. Follow the minimal style of siddharthpritam.com: Georgia typography, white background, simple blue links, and thin rules. Avoid oversized slogans, promotional buttons, or decorative section numbering.
- The current full-width forest header is an AI-assisted panoramic extension of the portrait supplied by the user. Its provenance and generation prompt are in `FOREST-IMAGE.md`. Preserve it unless asked to change it; do not describe it as an unedited photograph, CC0, or public domain. Choose verified freely reusable images for any future stock-photo additions.
- The main sections are About, Writings, Videos, Discussion, and Connect, in that navigation order. Meditation is a topic, not a separate application. Do not add links to the academic website.
- Keep authorship understated: the enlarged blue lotus sits at the top right on a transparent background, with no tile or border, and Siddharth Pritam's name appears in the footer directly above the email. The independence statement also belongs in the footer. The subtitle is “into the nature and structure of ourselves.” Show one latest writing and one latest video on the homepage. One writing is currently a draft visible only in previews.
- Show the entire forest panorama edge to edge using `width: 100%` and `height: auto`, keeping its natural proportions and avoiding side margins, stretching, or additional cropping. The original portrait remains as a source reference.
- Discussion is public Q&A: visitors can ask questions, and only Siddharth's authenticated account can publish answers. The service in `discussion-service/` enforces this on the server with Cloudflare Access; D1 stores posts and Turnstile verifies submissions. Do not replace it with unrestricted visitor replies or a frontend-only permission check. Keep private email separate. Public posting stays inactive until real service settings are supplied; previews never accept posts. Never place secrets or tokens in frontend files. See `DISCUSSION-SETUP.md`.
- Credit outside speakers explicitly using video metadata `creator`. Video `date` means date added to this site, rendered as “Added”; never imply that selected third-party talks are by Siddharth.
- Contact email is in `site.json`. The group-interest link opens a prefilled email; it does not create a membership, send a message automatically, or collect a mailing list. Do not invent group-platform URLs, meeting times, or subscription services.
- Add writing to `content/writings/` and YouTube entries to `content/videos/`; start from the files in `templates/`.
- Keep sample content as drafts. Publish an entry when the user requests publication. Do not invent videos, dates, quotations, credentials, or personal experiences.
- Keep published filenames stable because they determine addresses.
- Content metadata is JSON between `---` lines. Drafts have `"draft": true` and are excluded from normal builds.
- Run `npm test`, `npm run build`, and `npm run check` after changes to content handling or the publishing pipeline. For simple text changes, build and check the affected page.
- For Q&A service changes, run `npm ci`, `npm test`, and `npm run check` from `discussion-service/`. The last command bundles without deploying. Keep backend deployment separate from GitHub Pages. Preserve the server's owner-only authorization checks and fail-closed configuration.
- `npm run preview` includes drafts in `preview/`; deploy only `dist/`.
- The GitHub Actions workflow owns deployment. Never replace the academic site's repository or change root-domain DNS records as part of work on this subdomain.
- Marked is vendored with its license. No package installation is necessary to build the static site. The separate Q&A service has its own dependencies and lockfile.
