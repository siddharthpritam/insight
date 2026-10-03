# Insight

A space to inquire together, as friends, into the nature of our psychological structure and the possibility of insight.

Live at **https://insight.siddharthpritam.com**, published from the separate [siddharthpritam/insight](https://github.com/siddharthpritam/insight) repository. GitHub Pages serves the website over HTTPS; Cloudflare serves the questions backend. Existing academic, root-domain, and mail records are preserved.

## What is included

- Home, Writings, Videos, Discussion, About, Connect, and individual article/video pages.
- A full-width misty-forest panorama extended from the user's photograph, contact links, and an email invitation to join the group.
- One Markdown file per writing or YouTube video.
- A YouTube player that loads only after the visitor selects Play, with a direct YouTube link as fallback. YouTube's own availability and embed restrictions still apply.
- Automatic writing/video lists, metadata, sitemap, mobile layout, and keyboard navigation.
- A GitHub Actions workflow that tests, builds, and deploys changes to `main`.
- One draft reflection, *Looking without a conclusion*, visible only in previews, and one selected video: *Instant insight* by J. Krishnamurti, linked to the official YouTube upload supplied by the user.
- An active public Q&A board with visitor questions and answers restricted to Siddharth's authenticated account, plus a separate private email option.

## Local preview

Install Node.js 24. The static website needs no dependency installation. The separate Q&A service has its own installation step, described below.

```sh
npm test
npm run build
npm run check
```

Open `dist/index.html` in a browser. Internal navigation and assets use relative paths so the built site can also be opened from the downloaded folder.

To build a preview that also includes any future drafts:

```sh
npm run preview
```

Open `preview/index.html`. This preview is marked noindex and is never uploaded by the publishing workflow. Draft files will still be visible as source if your GitHub repository is public; keep confidential drafts outside a public repository.

## Add a writing

1. Copy `templates/writing.md` to `content/writings/a-short-title.md`.
2. Fill in the title, summary, topic, and actual publication date.
3. Write the body as ordinary Markdown.
4. When ready, set `"draft": false`.
5. Commit the file to `main`. GitHub Actions rebuilds the list and article page.

## Add a YouTube video

1. Copy `templates/video.md` to `content/videos/a-short-title.md`.
2. Fill in the title, summary, date added to Insight, and the YouTube video's full URL. Set `creator` to the speaker or creator's name when sharing someone else's video; the name is displayed explicitly.
3. Add a description, notes, or transcript beneath the metadata.
4. Set `"draft": false` and commit.

YouTube watch URLs, `youtu.be` links, Shorts, and live-video URLs are accepted. A video must allow embedding to play on the site. Upload the video on YouTube first; no YouTube API key is required for a manual entry.

## Metadata

The small block between `---` lines is JSON: keep quotation marks around text, use `true` or `false` without quotes, and do not leave a comma after the last field. Copying a template is the easiest way to add content. Markdown comes after the closing `---`.

Filenames become page addresses. Renaming a published file changes its address, so keep published filenames stable. Dates use `YYYY-MM-DD`; future dates do not schedule publication. A file is public whenever `draft` is false and the change is deployed. Content is intended for trusted authors and may contain HTML.

## GitHub Pages setup

1. Create a new repository named `insight` under `siddharthpritam`. Use a public repository with GitHub Free, or an eligible paid plan for a private source repository.
2. Put the contents of this folder at the repository root, including `.github/workflows/pages.yml` and the vendored Markdown parser. Do not put them inside an extra `insight-site` folder.
3. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.
4. In **Settings → Pages → Custom domain**, set `insight.siddharthpritam.com` and save it before changing DNS. If domain verification is already present for `siddharthpritam.com` in the account, retain it.
5. At the domain's DNS provider, add only this subdomain record:

   | Field | Value |
   | --- | --- |
   | Type | CNAME |
   | Name / Host | insight |
   | Target / Value | siddharthpritam.github.io |
   | TTL | Automatic / default |

   With Cloudflare, use DNS only while GitHub provisions HTTPS. Preserve all existing root, www, email, and verification records. The target is the GitHub username hostname, without a repository path. Do not point it at `siddharthpritam.com`.
6. Run the **Publish Insight** workflow (Actions → Publish Insight → Run workflow) or push a change to `main`.
7. Once the DNS check and certificate are ready, enable **Enforce HTTPS** in Pages settings.

The workflow publishes `dist/` only; the custom domain must be configured in Pages settings. A CNAME file is not used by the custom Actions workflow. Before using a different GitHub account, update the DNS target to that account's `USERNAME.github.io` hostname.

Official guidance:
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site

## Editing the design

- Site identity: `site.json`
- Page layouts and introductory text: `scripts/build.mjs`
- Appearance: `public/assets/site.css`
- YouTube player: `public/assets/video.js`
- Discussion configuration: `site.json`; markup and validation: `scripts/discussion.mjs`
- Public question form and list: `public/assets/discussion.js`
- Q&A storage, owner permissions, and admin page: `discussion-service/`
- Publish workflow: `.github/workflows/pages.yml`

## Contact and group enquiries

The contact address is `pritam.siddharth@gmail.com`, configured in `site.json`. The **Email to join the group** links open the visitor's email application with a subject and editable introduction. Nothing is submitted until the visitor sends that email. The visible email address also allows visitors to copy it into their preferred email service.

There is no signup database or automatic membership: group enquiries arrive by email. If a group platform is chosen later, replace the invitation link with its actual invite URL. The site contains no links to the academic website.

## Public questions and private email

Discussion has a public question form and a read-only answer list for visitors. Only Siddharth's signed-in account can publish or edit answers; he can also hide and restore questions. Visitors do not need an account. Questions appear immediately after spam verification and consent to publication. There are no visitor reply controls.

The board is **enabled**. The Cloudflare Worker, D1 database, Turnstile widget, and Access sign-in are connected. Open [the owner page](https://questions.siddharthpritam.com/admin/) and sign in with an email code sent to `pritam.siddharth@gmail.com` to answer questions. Owner sign-in and authenticated loading are verified; the production posting/answering test awaits the browser's human-verification checkbox. Deployment and maintenance details are in [DISCUSSION-SETUP.md](DISCUSSION-SETUP.md).

The service enforces owner permissions on every admin request; this rule does not depend on hiding a button. Service dependencies are locked in `discussion-service/package-lock.json`. Updates to `main` deploy the static site through GitHub Actions and the service through its separate Cloudflare Git integration.

Preview files and unconfigured builds display a disabled question form and a clear status message. **Write privately** opens an email to `pritam.siddharth@gmail.com`; messages do not enter the public question database or get posted automatically. No private email is collected by the public form.

## Credits

Header image: an AI-assisted panoramic extension of the misty-forest photograph supplied by the user on 3 October 2026. The original is retained as `public/assets/forest-mist.jpg` (620 × 930 pixels). The site uses `public/assets/forest-panorama.webp` (2128 × 739 pixels, about 220 KB), generated with the built-in image-generation tool and optimized as WebP. The image scales naturally to fill the header width, without cropping, stretching, or side margins. Its full generation prompt and provenance are recorded in [FOREST-IMAGE.md](FOREST-IMAGE.md). No public-domain or stock-photo license is asserted for the source photograph.

The blue lotus emblem (`public/assets/blue-lotus.svg`) is original SVG artwork created for this site at the user's request, drawn on a transparent background with soft blue gradient petals, placed at the top right at 104px (80px on narrow screens). It does not indicate institutional affiliation. Siddharth Pritam's name appears in the footer as a copyright line (© and the build year) directly above the email, alongside the small independence note. The subtitle is configured by `tagline` in `site.json`.

Selected video: *Instant insight | Krishnamurti*, https://www.youtube.com/watch?v=HUrxA7139TU, Krishnamurti — Official Channel. The displayed date is when it was added to Insight, not the talk or upload date. Playback uses YouTube's player; a direct YouTube link remains available.

The typography, page width, and simple section structure take their cue from siddharthpritam.com: white background, Georgia text, modest blue links, and thin rules. Videos and writings remain the focus.

Markdown parser: Marked 17.0.5, https://marked.js.org, vendored under the MIT license in `vendor/MARKED-LICENSE.md`. Its original distribution is retained without modification. Keeping the parser in the repository makes builds reproducible without an npm installation step.

*Looking without a conclusion* is AI-assisted draft copy for Siddharth's review. It is marked `draft: true`, has no publication date, and is excluded from the public build.
