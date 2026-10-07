// Only main timeline entries: quoted tweets and retweet originals are not recent authored posts.
const idPattern = /^\d{1,30}$/;
const decodeText=text=>String(text||'').replace(/&(amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#\d+);/gi,(entity,key)=>{
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"};
  if(Object.hasOwn(named,key.toLowerCase()))return named[key.toLowerCase()];
  const value=key.toLowerCase().startsWith('#x')?parseInt(key.slice(2),16):Number(key.slice(1));
  return Number.isInteger(value)&&value>0&&value<=0x10ffff&&!(value>=0xd800&&value<=0xdfff)?String.fromCodePoint(value):entity;
});
export function parseRecentPosts(payload, userId, username, limit = 3) {
  if (!idPattern.test(String(userId)) || !/^[a-z0-9_]{1,15}$/i.test(username || '')) throw new Error('成员身份无效');
  if (payload?.errors?.length) throw new Error('X 未返回可用帖子');
  const user = payload?.data?.user?.result;
  if (user?.__typename === 'UserUnavailable') throw new Error('账号资料不可用');
  if (user?.rest_id && String(user.rest_id) !== String(userId)) throw new Error('帖子所属账号不匹配');
  const instructions = user?.timeline?.timeline?.instructions;
  if (!Array.isArray(instructions)) throw new Error('帖子数据结构无法识别');
  const posts = new Map();
  for (const instruction of instructions) {
    const entries = instruction.entries || (instruction.entry ? [instruction.entry] : []);
    for (const entry of entries) {
      const content = entry.content;
      const items = content?.items ? content.items.map(item => item.item?.itemContent) : [content?.itemContent];
      for (const item of items) {
        if (!item || item.promotedMetadata || content.promotedMetadata) continue;
        let tweet = item.tweet_results?.result;
        if (tweet?.__typename === 'TweetWithVisibilityResults') tweet = tweet.tweet;
        const legacy = tweet?.legacy;
        if (!idPattern.test(tweet?.rest_id || '') || !legacy || legacy.in_reply_to_status_id_str || legacy.retweeted_status_result || tweet.retweeted_status_result) continue;
        if (String(legacy.user_id_str) !== String(userId)) continue;
        const author = tweet.core?.user_results?.result;
        const screenName = author?.core?.screen_name || author?.legacy?.screen_name;
        if (author?.rest_id && String(author.rest_id) !== String(userId)) continue;
        if (screenName && screenName.toLowerCase() !== username.toLowerCase()) continue;
        const createdAt = Date.parse(legacy.created_at);
        if (!Number.isFinite(createdAt)) continue;
        const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
        posts.set(tweet.rest_id, {id:tweet.rest_id,userId:String(userId),username:username.toLowerCase(),
          text: decodeText(tweet.note_tweet?.note_tweet_results?.result?.text || legacy.full_text || ''),
          createdAt, url:`https://x.com/${username.toLowerCase()}/status/${tweet.rest_id}`,
          liked:typeof legacy.favorited === 'boolean' ? legacy.favorited : null,
          likes:count(legacy.favorite_count), replies:count(legacy.reply_count),
          limited: Boolean(tweet.limitedActionResults || tweet.tweet_interstitial),
          hasMedia: Boolean(legacy.extended_entities?.media?.length || legacy.entities?.media?.length)});
      }
    }
  }
  return [...posts.values()].sort((a,b)=>b.createdAt-a.createdAt).slice(0,Math.max(1,Math.min(20,limit)));
}
