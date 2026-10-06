const kinds = new Set(['material','pending']);
export function updateCreatorLibrary(state, message, now = Date.now()) {
  const command = message.command;
  if (!['save','note','status','material','remove'].includes(command)) throw new Error('不支持的创作操作');
  const id = String(message.post?.id || message.postId || '');
  if (!/^\d{1,30}$/.test(id)) throw new Error('帖子编号无效');
  const library = state.creatorLibrary || { posts: [] };
  const existing = library.posts.find(p => p.id === id);
  if (command === 'save') {
    if (!kinds.has(message.kind)) throw new Error('收集类型无效');
    const author = String(message.post?.author || '').toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(author)) throw new Error('帖子作者无效');
    if (existing && existing.author !== author) throw new Error('帖子作者不一致');
    if (!existing && library.posts.length >= 300) throw new Error('已保存 300 条，请先导出备份');
    const post = existing || { id, author, url:`https://x.com/${author}/status/${id}`, text:String(message.post?.text || '').slice(0,20000), postedAt:String(message.post?.postedAt || '').slice(0,40), savedAt:now, note:'', material:false, replyStatus:null };
    if (message.kind === 'material') post.material = true;
    else post.replyStatus = 'pending';
    post.updatedAt = now;
    if (!existing) library.posts.push(post);
  } else {
    if (!existing) throw new Error('记录不存在');
    if (command === 'note') existing.note = String(message.note || '').slice(0,2000);
    if (command === 'status') {
      if (!['pending','done','skip'].includes(message.status)) throw new Error('回复状态无效');
      existing.replyStatus = message.status;
    }
    if (command === 'material') existing.material = message.material === true;
    if (command === 'remove') library.posts = library.posts.filter(p=>p.id!==id);
    existing.updatedAt = now;
  }
  state.creatorLibrary = library;
}
export function validateCreatorLibrary(library){
  if(!library)return;
  if(!Array.isArray(library.posts)||library.posts.length>300)throw new Error('创作收集备份无效');
  const ids=new Set();
  for(const p of library.posts){
    if(!p||typeof p.id!=='string'||!/^\d{1,30}$/.test(p.id)||ids.has(p.id)||!/^[a-z0-9_]{1,15}$/i.test(p.author||'')||typeof p.text!=='string'||p.text.length>20000||typeof p.note!=='string'||p.note.length>2000||!['pending','done','skip',null].includes(p.replyStatus)||typeof p.material!=='boolean')throw new Error('创作记录格式无效');
    ids.add(p.id);
  }
}
