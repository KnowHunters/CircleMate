(() => {
  const api = globalThis.CircleMate ||= {};
  const reserved = new Set(['home','explore','search','notifications','settings','messages','i','compose','tos','privacy','premium','bookmarks','communities','login','logout']);
  api.isTimelinePath = pathname => {
    if (/^\/home\/?$/.test(pathname)) return true;
    const match = pathname.match(/^\/([a-z0-9_]{1,15})(?:\/(with_replies|media|reposts|highlights))?\/?$/i);
    return Boolean(match && !reserved.has(match[1].toLowerCase()));
  };
})();
