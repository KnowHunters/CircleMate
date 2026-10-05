(() => {
  const messages = {
    compactPosts:['帖子','Posts'],compactReplies:['回复','Replies'],compactViews:['曝光','Views'],compactLikes:['点赞','Likes'],compactReceived:['获评','Received'],compactReposts:['转帖','Reposts'],compactBookmarks:['收藏','Saved'],compactQuotes:['引用','Quotes'],compactNet:['净增','Net'],
    noComparison:['暂无对比','No comparison'],newMetric:['新增','New'],negativeMetric:['转负','Turned negative'],
    exportBackup:['导出备份','Export backup'],restoreBackup:['恢复备份','Restore backup'],upgradeHelp:['升级时将新版文件覆盖到原扩展目录，在 Chrome 扩展页点重新加载，再刷新 X 页面。无需卸载。','To upgrade, replace files in the same extension folder, click Reload in Chrome extensions, then refresh X. No uninstall is needed.'],
    sevenDays:['近7天 · UTC','Last 7 days · UTC'],publishedPosts:['发布帖子','Posts published'],publishedReplies:['发布回复','Replies published'],impressions:['曝光次数','Impressions'],receivedLikes:['收到点赞','Likes received'],viewTrend:['曝光趋势','Impression trend'],creationTrend:['每日创作','Daily creation'],peakDay:['峰值 {date}','Peak {date}'],syncChart:['同步分析后显示趋势','Sync analytics to see trends'],noSeries:['接口未返回该项按日数据','No daily series returned'],chartScope:['来源：X 数据分析 · UTC 日桶。缺失数据留空，今日尚未结束。发帖为平台统计口径，与北京时间今日原创分开。','Source: X Analytics · UTC days. Missing data stays empty; today is incomplete. Post counts follow X’s metric definition, separate from today’s original posts.'],todayDetail:['今日时间线统计 · 北京时间','Today’s timeline · Beijing time'],
    syncingLabel:['同步中','Syncing'],cancel:['取消','Cancel'],confirm:['确认','Confirm'],
    followBackHint:['关注了你 · 待回关 {count} 人','Following you · {count} to follow back'],groupDataHint:['群聊 · 成员 · 关注关系','Groups · Members · Relationships'],
    analyticsTrends:['创作趋势','Creation trends'],
    receivedReplies:['收到回复','Received replies'],repostsMetric:['收到转帖','Reposts'],bookmarksMetric:['收藏','Bookmarks'],quotesMetric:['引用','Quotes'],newFollowers:['新增关注者','New followers'],lostFollowers:['流失关注者','Unfollowers'],netFollowers:['净增关注者','Net followers'],profileVisits:['主页访问','Profile visits'],engagementsMetric:['互动次数','Engagements'],engagementRate:['互动率','Engagement rate'],audienceData:['受众概览','Audience overview'],audienceHint:['关注者 · 认证 · 活跃','Followers · Verified · Active'],activeFollowers:['活跃关注者','Active followers'],periodCompare:['与前一周期对比','Compared with previous period'],metricTrend:['指标趋势','Metric trend'],
    followBackSources:['关注者 + 认证关注者 · 按已缓存关系筛选','Followers + verified followers · Cached relationships'],
    needFollowBack:['待回关列表','Follow-back list'],followBackAction:['回关','Follow back'],followBackEmpty:['暂无需回关账号','No accounts to follow back'],followBackPending:['关系名单待同步，未知关系不会列入','Waiting for relationship caches; unknown relationships are excluded'],followBackScope:['对方关注了你，你尚未关注对方','They follow you; you do not follow them'],followBackRequest:['已发送关注请求','Follow request sent'],followBackDone:['已回关','Followed back'],
    confirmSyncTitle:['同步{name}？','Sync {name}?'],confirmRebuildTitle:['重建{name}？','Rebuild {name}?'],
    confirmSyncMessage:['将向 X 请求更新数据。正在分页的名单会从已保存的位置继续。','Fetch updated data from X. Incomplete lists resume from the saved position.'],
    confirmRebuildMessage:['将从第一页重新同步这份名单。保留已有缓存，完整同步后更新。','Restart this list from page one. Keep the existing cache until the full sync completes.'],
    accountUpdated: ["更新于 {time}", "Updated {time}"],
    
    syncGreen: ['正在自动同步', 'Automatic sync in progress'], syncOrange: ['部分任务失败，后台仍在同步或等待重试', 'Some jobs failed; sync or retries continue'], syncRed: ['同步异常，等待重试', 'Sync failed; awaiting retry'],
    autoWaiting: ['等待续页', 'Waiting for next page'], autoPaging: ['后台自动续页，无需操作', 'Continues automatically'],
    autoRetryAt: ['将于 {time} 自动重试', 'Automatic retry at {time}'], manualResume: ['重试续传', 'Retry / resume'],
    listRequestFailed: ['请求失败（{code}），后台将自动重试', 'Request failed ({code}); automatic retry scheduled'],
    
    
    
    
    followsYou: ['关注了你', 'Follows you'], nativeCounts: ['数量来自当前原生页面显示', 'Counts read from the native page'],
    tagline: ["联系圈友，记录每次成长", "Connect with your circle"],
    minimize: ["最小化界面", "Minimize panel"], expand: ["展开界面", "Expand panel"],
    projectInfo: ["项目信息", "Project info"],
    projectDescription: ["在本机整理 X 账号关系、筛选群成员、管理关注队列，查看创作与曝光趋势。", "Organize X relationships locally, filter group members, manage follow queues, and review creation and impression trends."],
    navigation: ["CircleMate 页面", "CircleMate views"], live: ["实时", "Live"], data: ["数据", "Data"], guide: ["说明", "Guide"],
    accountOverview: ["账号概览", "Account overview"], syncAccount: ["同步账号", "Sync account"],
    idle: ["待同步", "Not synced"], ready: ["就绪", "Ready"], running: ["运行中", "Syncing"], failed: ["需重试", "Retry"],
    following: ["正在关注", "Following"], followers: ["关注者", "Followers"], verifiedFollowers: ["蓝V关注者", "Blue followers"],
    todayPosts: ["今日原创", "Posts today"], todayReplies: ["今日回复", "Replies today"], todayReposts: ["今日转帖", "Reposts today"],
     settings: ["关系同步", "Relationship sync"], settingsHint: ["关注 · 粉丝 · 蓝V", "Following · Followers · Blue checks"],
    relationshipSync: ["关系名单", "Relationship lists"], relationshipRefresh: ["刷新", "Refresh"], rebuild: ["重建", "Rebuild"], sync: ["同步", "Sync"], resume: ["续传", "Resume"],
     posts: ["原创", "Posts"], replies: ["回复", "Replies"], reposts: ["转帖", "Reposts"], 
     
      
     pendingList: ["待关注列表", "People to follow"], refresh: ["重新读取当前群", "Refresh current group"],
    search: ["搜索昵称或 @用户名", "Search name or @handle"], memberFilter: ["成员筛选", "Filter members"],
    notFollowing: ["未关注", "Not followed"], all: ["全部", "All"], mutual: ["互关", "Mutual"], follow: ["关注", "Follow"], view: ["查看", "View"],
    requested: ["已请求关注", "Requested"], followed: ["我已关注", "Following"], relationUnknown: ["关系未知", "Unknown"], blue: ["蓝V", "Blue verified"],
    followNote: ["逐个点击关注；私密账号可能需要对方批准。", "Follow one person at a time. Private accounts may require approval."],
      
      creatorData: ["创作与分析", "Posts & analytics"],
    syncContinue: ["同步 / 续传", "Sync / resume"], syncAnalytics: ["同步分析", "Sync analytics"], localStats: ["群成员数据", "Group member data"],
    groups: ["群聊", "Groups"], people: ["去重成员", "People"], gettingStarted: ["开始使用", "Getting started"],
    stepOne: ["打开 X 群信息并展开成员列表。", "Open a group on X and expand its member list."],
    stepTwo: ["登录后自动同步关注与粉丝名单。", "Following and follower lists sync automatically after sign-in."],
    stepThree: ["查看未关注成员，逐个关注；在数据页复盘创作。", "Follow people individually and review your posts in Data."],
    localNote: ["数据保存在本机。部分采集不代表完整名单；未知关系不会显示为未关注。", "Data stays on this device. Partial lists cannot prove a person is not followed."],
    sessionNote: ["安装或更新后刷新 X 页面，登录后即可同步。", "Refresh X after installing or updating. Sign in to sync."],
    local: ["本地记录", "Local data"], unknown: ["—", "—"], noAccount: ["请同步当前账号", "Sync your account"], currentGroup: ["当前群聊", "Current group"],
    noGroup: ["尚未捕获成员", "No members captured"], openGroup: ["打开群信息并展开成员列表", "Open group info and expand members"],
    groupSummary: ["{known} 人已补全 / {refs} 个引用 · 部分采集", "{known} profiles / {refs} references · Partial"],
    emptyTitle: ["先打开一个 X 群聊", "Open an X group"], emptyHint: ["打开群信息并展开成员列表，读取成员资料链接。", "Expand group members to collect profile links."],
    referencesTitle: ["已捕获成员引用，等待补全资料", "Members captured, profiles pending"], referencesHint: ["在配置中点击“补全下一批”，每次最多 10 人。", "Open Settings and load the next batch of up to 10 profiles."],
    noMatch: ["没有匹配成员", "No matching people"], filterHint: ["切换到全部可查看未知关系；同步关注名单可补全关系。", "Select All to see unknown relationships. Sync Following to resolve them."],
    
    
    
    
    requesting: ["正在处理…", "Working…"], updated: ["已更新", "Updated"], serviceError: ["服务不可用", "Service unavailable"], syncError: ["同步失败（{code}），请重试。", "Sync failed ({code}). Please retry."],
    
    
    
    complete: ["完整", "Complete"], partial: ["部分", "Partial"], syncPending: ["尚未同步", "Not synced"], listProgress: ["{count} 人 · {pages} 页 · {status}", "{count} people · {pages} pages · {status}"],
    retryAt: ["可重试时间 {time}", "Retry after {time}"], 
    
    creatorSummary: ["{date}：原创 {posts} · 回复 {replies} · 转帖 {reposts}", "{date}: {posts} posts · {replies} replies · {reposts} reposts"],
    creatorPending: ["点击同步今日，读取创作数据。", "Sync today to load your posts."], pages: ["{kind} {pages} 页 · {status}", "{kind}: {pages} pages · {status}"],
    
    estimate: ["（估计）", " (estimated)"], estimateUnknown: ["（估计口径未知）", " (estimate status unknown)"],
    analyticsPending: ["点击同步分析，读取近 7 个 UTC 日期的数据。", "Sync analytics for the last 7 UTC dates."],
    
    updatedAt: ["最近记录：{time}", "Updated: {time}"], noRecord: ["还没有同步记录", "No records yet"]
  };
  globalThis.CircleMate.i18n = {
    text(language, key, values = {}) {
      const message = messages[key]?.[language === "en" ? 1 : 0] || key;
      return message.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ""));
    }
  };
})();
