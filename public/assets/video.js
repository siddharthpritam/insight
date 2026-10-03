document.querySelectorAll('[data-youtube-id]').forEach(container => {
  const button = container.querySelector('button');
  button.addEventListener('click', () => {
    const id = container.dataset.youtubeId;
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1`;
    iframe.title = container.dataset.videoTitle || 'YouTube video';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    container.replaceChildren(iframe);
    iframe.focus();
  }, {once:true});
});
