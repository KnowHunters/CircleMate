import {normalizeUser} from './domain.js';
export class PostInteractions {
  constructor(adapter,{now=Date.now}={}){this.adapter=adapter;this.now=now;this.cache=new Map();this.cooldowns=new Map();}
  async read(s,username,refresh=false){
    if(!/^[a-z0-9_]{1,15}$/i.test(username||''))throw new Error('成员账号无效');
    username=username.toLowerCase();const key=s.accountId+':'+username,cached=this.cache.get(key);
    if(!refresh&&cached&&this.now()-cached.at<60000)return structuredClone(cached);
    const retryAt=this.cooldowns.get(s.accountId)||0;
    if(retryAt>this.now())throw Object.assign(new Error('帖子请求正在冷却，请稍后重试'),{retryAt,code:'HTTP_429'});
    try{
      const user=normalizeUser(await this.adapter.profile(s,username));
      if(!user||user.username!==username)throw new Error('成员身份无法核验');
      const posts=await this.adapter.recentPosts(s,user);
      const result={accountId:s.accountId,username,userId:user.id,posts,at:this.now()};
      this.cache.delete(key);this.cache.set(key,result);if(this.cache.size>100)this.cache.delete(this.cache.keys().next().value);
      return structuredClone(result);
    }catch(error){if(error.retryAt)this.cooldowns.set(s.accountId,error.retryAt);throw error;}
  }
  async like(s,message,state,checkpoint){
    if(message.accountId!==s.accountId||typeof message.liked!=='boolean'||!/^\d{1,30}$/.test(message.tweetId||''))throw new Error('操作参数或登录账号不匹配');
    const retryAt=this.cooldowns.get(s.accountId)||0;if(retryAt>this.now())throw Object.assign(new Error('点赞操作正在冷却'),{retryAt,code:'HTTP_429'});
    const data=await this.read(s,message.username,true),post=data.posts.find(p=>p.id===message.tweetId);
    if(!post||typeof post.liked!=='boolean'||post.limited)throw new Error('此帖当前不能点赞，请查看原帖');
    state.postLikeIntents ||= {};
    const pending=state.postLikeIntents[post.id];
    if(pending&&post.liked!==pending.liked)throw new Error('上次点赞结果仍未确认，请稍后刷新核验');
    if(post.liked===message.liked){delete state.postLikeIntents[post.id];await checkpoint(s,state);return data;}
    if(Object.keys(state.postLikeIntents).length>=100&&!pending)throw new Error('待核验操作过多，请先处理已有结果');
    state.postLikeIntents[post.id]={liked:message.liked,username:message.username,at:this.now()};
    await checkpoint(s,state);
    try{await this.adapter.setPostLike(s,post.id,message.liked);}catch(error){if(error.retryAt)this.cooldowns.set(s.accountId,error.retryAt);if(['HTTP_429','API_ERROR','WRITE_NOT_SENT'].includes(error.code)){delete state.postLikeIntents[post.id];await checkpoint(s,state);}throw error;}
    this.cache.delete(s.accountId+':'+data.username);
    const verified=await this.read(s,message.username,true),after=verified.posts.find(p=>p.id===post.id);
    if(after?.liked!==message.liked)throw new Error('点赞结果未确认，请刷新核验');
    delete state.postLikeIntents[post.id];await checkpoint(s,state);return verified;
  }
}
