(() => {
  const board = document.querySelector('[data-qa-live="true"]');
  if (!board) return;
  const api = board.dataset.qaApi;
  const form = board.querySelector('form');
  const list = board.querySelector('.qa-list');
  const status = board.querySelector('.qa-status');
  const more = board.querySelector('.qa-more');
  const submit = form.querySelector('button[type="submit"]');
  let token = '', widget, cursor = null;
  const seen = new Set();
  function text(tag, value, className) {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function entry(item) {
    const article = document.createElement('article');
    article.className = 'qa-entry';
    article.append(text('p', 'Question from ' + (item.name || 'a reader'), 'qa-byline'), text('p', item.question, 'qa-text'));
    if (item.answer) {
      const answer = document.createElement('div');
      answer.className = 'qa-answer';
      answer.append(text('p', 'Siddharth Pritam', 'qa-byline'), text('p', item.answer, 'qa-text'));
      article.append(answer);
    } else article.append(text('p', 'Awaiting an answer.', 'discussion-note'));
    return article;
  }
  async function load(reset = false) {
    more.disabled = true;
    try {
      const response = await fetch(api + '/questions' + (!reset && cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Questions could not be loaded. Please try again later.');
      if (reset) { list.replaceChildren(); seen.clear(); }
      for (const item of data.questions) {
        if (!seen.has(item.id)) { list.append(entry(item)); seen.add(item.id); }
      }
      cursor = data.nextCursor;
      more.hidden = !cursor;
      if (!seen.size) list.replaceChildren(text('p', 'No questions yet. You are welcome to ask the first.', 'discussion-note'));
    } catch {
      if (!seen.size) list.replaceChildren(text('p', 'Questions could not be loaded. Please reload the page to try again.', 'discussion-note'));
      else status.textContent = 'More questions could not be loaded. Please try again.';
    } finally { more.disabled = false; }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (!token) { status.textContent = 'Please complete the verification before posting.'; return; }
    submit.disabled = true;
    status.textContent = 'Posting your question…';
    const fields = new FormData(form);
    try {
      const response = await fetch(api + '/questions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: fields.get('name'), question: fields.get('question'), consent: fields.get('consent') === 'on', turnstileToken: token })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your question could not be posted. Please try again.');
      form.reset();
      status.textContent = 'Your question is now public. Siddharth can answer it here.';
      await load(true);
    } catch (error) {
      status.textContent = error instanceof TypeError ? 'The connection failed. Your text is still here; please try again.' : error.message;
    } finally {
      token = '';
      if (widget !== undefined && window.turnstile) window.turnstile.reset(widget);
      submit.disabled = false;
    }
  });
  window.insightTurnstileReady = () => {
    widget = window.turnstile.render(board.querySelector('.qa-verification'), {
      sitekey: board.dataset.qaKey, action: 'question', theme: 'light', size: 'flexible',
      callback: value => { token = value; },
      'expired-callback': () => { token = ''; },
      'error-callback': () => { token = ''; status.textContent = 'Verification could not load. Please reload the page or write privately by email.'; }
    });
  };
  const verification = document.createElement('script');
  verification.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=insightTurnstileReady&render=explicit';
  verification.async = true;
  verification.onerror = () => { status.textContent = 'Verification could not load. Please reload the page or write privately by email.'; };
  document.head.append(verification);
  more.addEventListener('click', () => load());
  load(true);
})();
