import { escapeHtml as e } from './content.mjs';

export function validateDiscussion(config) {
  if (config == null) return { enabled: false };
  if (typeof config !== 'object' || Array.isArray(config) || typeof config.enabled !== 'boolean') {
    throw new Error('site.json: discussion.enabled must be true or false.');
  }
  if (!config.enabled) return { enabled: false };
  if (config.provider !== 'owner-qa') throw new Error('Use the owner-qa service to enforce owner-only answers.');
  let url;
  try { url = new URL(config.apiUrl); }
  catch { throw new Error('Set discussion.apiUrl to the deployed Q&A service HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('discussion.apiUrl must be an HTTPS origin without a path or credentials.');
  }
  if (typeof config.turnstileSiteKey !== 'string' || !config.turnstileSiteKey.trim()) {
    throw new Error('Set discussion.turnstileSiteKey before opening public questions.');
  }
  return { ...config, apiUrl: url.origin };
}

export function renderDiscussion(config, email, preview = false) {
  const board = validateDiscussion(config);
  const live = board.enabled && !preview;
  const status = preview ? 'Preview — questions cannot be posted from this file.' : !live ? 'Public posting is not open yet. You can write privately by email below.' : '';
  return `<div class="qa-board" data-qa-live="${live}"${live ? ` data-qa-api="${e(board.apiUrl)}" data-qa-key="${e(board.turnstileSiteKey)}"` : ''}>
<p class="discussion-note">Questions and answers are public. Only Siddharth Pritam can publish answers. No visitor account is needed.</p>
${status ? `<p class="discussion-status">${status}</p>` : ''}
<form class="qa-form"><fieldset${live ? '' : ' disabled'}><legend>Ask a public question</legend>
<label for="qa-name">Name <span class="discussion-note">(optional; shown publicly)</span></label>
<input id="qa-name" name="name" type="text" maxlength="80" autocomplete="nickname">
<label for="qa-question">Your question</label>
<textarea id="qa-question" name="question" rows="5" minlength="10" maxlength="3000" required aria-describedby="qa-question-help"></textarea>
<p id="qa-question-help" class="discussion-note">Please leave out email addresses and other private details. Use the email option below for a private message.</p>
<label class="qa-consent"><input type="checkbox" name="consent" required><span>I understand that my question and any name I enter will be public.</span></label>
<div class="qa-verification"></div><button type="submit">Post question</button></fieldset><p class="qa-status" role="status" aria-live="polite"></p></form>
<div class="qa-list" aria-label="Public questions and answers"><p class="discussion-note">${live ? 'Loading questions…' : 'Public questions and answers will appear here.'}</p></div>
<button class="qa-more" type="button" hidden>Load more questions</button>
${live ? '<noscript><p>JavaScript is needed for the public board. You can also write privately by email below.</p></noscript>' : ''}</div>`;
}
