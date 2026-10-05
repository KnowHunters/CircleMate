(() => {
  globalThis.CircleMate = globalThis.CircleMate || {};
  globalThis.CircleMate.readNativePage = (document, location, viewer) => {
    if (!/^[a-z0-9_]{1,15}$/i.test(viewer?.username || '')) return null;
    const owner = viewer.username.toLowerCase();
    const match = location.pathname.match(/^\/([a-z0-9_]{1,15})(?:\/(following|followers|verified_followers))?\/?$/i);
    if (!match || match[1].toLowerCase() !== owner) return null;
    const kind = ({ following: 'following', followers: 'followers', verified_followers: 'verifiedFollowers' })[match[2]] || null;
    const counts = {};
    for (const anchor of document.querySelectorAll('a[href]')) {
      let path; try { path = new URL(anchor.getAttribute('href'), location.origin).pathname.toLowerCase(); } catch { continue; }
      const field = path === '/' + owner + '/following' ? 'followingCount' : path === '/' + owner + '/followers' ? 'followersCount' : null;
      if (!field) continue;
      const label = (anchor.querySelector('span')?.textContent || anchor.textContent || '').trim();
      // Rounded K/M/万 labels are not exact totals.
      const value = label.match(/^([\d,，\s]+)(?:\s|正在关注|关注者|following|followers|$)/i)?.[1]?.replace(/[,，\s]/g, '');
      if (value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) counts[field] = Number(value);
    }
    const users = [];
    if (kind) for (const cell of document.querySelectorAll('[data-testid="UserCell"]')) {
      let username;
      for (const anchor of cell.querySelectorAll('a[href]')) {
        try { const url = new URL(anchor.getAttribute('href'), location.origin); const name = url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1];
          if (url.origin === location.origin && name && !['home','explore','search','notifications','settings'].includes(name.toLowerCase())) { username = name.toLowerCase(); break; }
        } catch {}
      }
      if (!username || username === owner || users.some(u => u.username === username)) continue;
      const buttons = [...cell.querySelectorAll('button')];
      const unfollow = cell.querySelector('[data-testid$="-unfollow"]') || buttons.find(b => /^(following|unfollow|pending|requested|正在关注|已关注|取消关注|已请求|待批准)$/i.test((b.textContent || '').trim()));
      const follow = cell.querySelector('[data-testid$="-follow"]') || buttons.find(b => /^(follow|follow back|关注|回关)$/i.test((b.textContent || '').trim()));
      const requested = /^(pending|requested|已请求|待批准)$/i.test((unfollow?.textContent || '').trim());
      const followedBy = kind !== 'following' ? true : /关注了你|follows you/i.test(cell.textContent || '') ? true : null;
      const nameLink = [...cell.querySelectorAll('a[href]')].find(a => { try { return (a.textContent || '').trim() && new URL(a.getAttribute('href'), location.origin).pathname.toLowerCase() === '/' + username; } catch { return false; } });
      users.push({ username, displayName: (cell.querySelector('[data-testid="UserName"]')?.textContent || nameLink?.textContent || username).split('@')[0].trim().slice(0,100),
        following: requested ? null : unfollow ? true : follow ? false : kind === 'following' ? true : null, followedBy, followRequested: requested || null });
    }
    return { owner, displayName: viewer.displayName || owner, kind, counts, users: users.slice(0,500), complete: false };
  };
})();
