// Read the native outer post permalink immediately before a timeline reply.
export function timelineTargetInPage(input) {
  if (location.origin !== input.origin) return false;
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const time = article.querySelector('a[href] time');
    const anchor = time?.closest('a');
    if (!anchor || anchor.closest('article') !== article) continue;
    const url = new URL(anchor.href, location.origin);
    const match = url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,30})\/?$/i);
    if (url.origin !== location.origin || !match || match[2] !== input.tweetId || match[1].toLowerCase() !== input.username.toLowerCase()) continue;
    const reply = article.querySelector('[data-testid="reply"]');
    return Boolean(reply && reply.closest('article') === article && !reply.disabled && reply.getAttribute('aria-disabled') !== 'true');
  }
  return false;
}
