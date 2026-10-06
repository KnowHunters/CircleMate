# 群成员资料卡：最近帖子与快捷互动研究

研究日期：2026-10-06（北京时间）。仅研究，不改插件功能。请求来自已登录 X 的原生页面；不使用猜测端点。

## 目标与结论

目标是在群成员悬浮资料卡中查看最近帖子、点赞、回复，保留群成员列表和滚动位置，不进入用户主页。

| 项目 | 证据与结论 |
| --- | --- |
| 最近帖子读取 | 已抓取 UserOriginalsTimeline 原生 GET，HTTP 200，并解析到正文、日期与互动状态。 |
| 不离开群列表读取帖子 | 在已打开成员列表的页面重放完全相同的已捕获 GET，HTTP 200，返回 timeline，页面仍为群信息 URL。没有创建自定义 UI。 |
| 点赞与取消点赞 | 原生按钮分别触发 FavoriteTweet、UnfavoriteTweet；两次 HTTP 200，返回 Done，按钮状态切换。取消后独立重新读取帖子，favorited=false，计数恢复为 1。 |
| 回复编辑器 | 原生回复按钮打开 /compose/post 弹层，原帖与“回复 @password1688”正确，文本框可见。未输入或发送内容。 |
| 卡片内直接发送回复 | 未验证。未捕获发送 POST，不提供猜测参数，不应据此启用直连回复。 |
| 保留成员列表的原生回复弹层 | 未验证。回复弹层只在独立帖子页测试，不能推断可在 xchat 成员弹层上直接复用。 |

本次点赞测试原状态未点赞；测试后取消，并经独立 GET 确认恢复。未执行关注、取关、转帖或回复发送。

## 资料卡的真实结构与数据边界

群昵称悬浮卡和普通时间线 HoverCard 不是同一 DOM 结构：

- 群成员卡在 `[data-testid="xchatEmbedRoute"]` 的开放 Shadow DOM 中。
- 外层实测为 `role="presentation"`、`data-open`、`data-side="bottom"`、`data-align="center"`；通过 absolute + translate 定位。
- 内层 `data-base-ui-focusable`、`tabindex=-1`，实测宽 300px、高 238px。
- 小草莓卡内含 `/caomei_nz` 资料链接、昵称、账号、简介、关注了你、关注/私信按钮和关注人数。
- 鼠标由昵称进入卡片区域，卡片保持显示；移到区域外后关闭。
- 此账号命中缓存，本次悬停没有观察到新的 UserByScreenName 请求。后台另有账号分析同步流量，不能归因于悬停。
- 普通页面 P@ss HoverCard 也命中已有资料，另外观察到 `friends/following/list.json` 共同关注请求。它不是最近帖子请求。

独立原生个人资料查询观察到：

`GET /i/api/graphql/AMIBMjtxEEATh4z8V9GtRg/UserByScreenName`

HTTP 200 的 User 对象包含 core、profile_bio、avatar、banner、location、website、verification、privacy、relationship_counts、relationship_perspectives、tweet_counts、pinned_items 等。该响应没有最近帖子列表。

注册时间在 `core.created_at`；不是关注时间。关系字段包括 following、followed_by、blocking、blocked_by、muting；这些字段不代表近期互动。

## 最近帖子：已捕获的请求

```text
GET /i/api/graphql/ty409m9cIpSEnLECl_SqMw/UserOriginalsTimeline
```

原生 variables：

```json
{
  "userId": "<target-user-id>",
  "count": 20,
  "includePromotedContent": true,
  "withQuickPromoteEligibilityTweetFields": true,
  "withVoice": true
}
```

fieldToggles 为 `withPayments=false`、`withArticlePlainText=false`。实际 features 与脱敏请求结构保存于 [抓包证据](profile-card-interactions-probe-2026-10-06.json)。不能将观察到 count=20 改写成“count=3 已测试”；展示只选 3 条不等于服务端请求 3 条已经验证。

响应路径：`data.user.result.timeline.timeline.instructions`。样本含 TimelineClearCache、TimelineAddEntries；23 个 entry。递归找到 22 个 Tweet 对象，其中包含引用内容，不能把这个数字视作主时间线帖子数。

已观察到的字段：

| 内容 | 路径 |
| --- | --- |
| 帖子 ID | Tweet.rest_id |
| 正文 | Tweet.legacy.full_text；长文优先检查 note_tweet.note_tweet_results.result.text（本次普通正文已验证，长文路径待专门样本测试） |
| 时间、作者 | legacy.created_at、legacy.user_id_str；core.user_results.result |
| 点赞状态、数量 | legacy.favorited、legacy.favorite_count |
| 回复、转帖、引用、收藏数 | legacy.reply_count、retweet_count、quote_count、bookmark_count |
| 收藏、转帖状态 | legacy.bookmarked、retweeted |
| 图片、视频 | legacy.entities、extended_entities；媒体展示需逐种格式验证 |
| 引用帖子 | quoted_status_result |
| 浏览信息 | Tweet.views |

解析必须按 timeline entry 取主帖子，识别 cursor、置顶、引用及广告；按帖子 ID 去重，按作者核对、按时间排序。不要用递归遍历搜到的所有 Tweet 直接生成“最近帖子”。冻结、受保护、无帖子、删帖与限流也要有明确状态。

## 点赞与取消点赞：原生写请求

```text
POST /i/api/graphql/lI07N6Otwv1PhnEgXILM7A/FavoriteTweet
POST /i/api/graphql/ZYKSe-w7KEslx3JhSIk5LA/UnfavoriteTweet
```

实际 body：

```json
{"variables":{"tweet_id":"<tweet-id>"},"queryId":"lI07N6Otwv1PhnEgXILM7A"}
```

取消点赞 body 同样为 tweet_id + 对应 queryId。原生响应分别为：

```json
{"data":{"favorite_tweet":"Done"}}
{"data":{"unfavorite_tweet":"Done"}}
```

核验链：未点赞 → 原生点赞请求 200/Done → 页面出现取消喜欢 → 原生取消 200/Done → 页面出现喜欢 → 独立 UserOriginalsTimeline GET 返回 favorited=false、favorite_count=1。

POST 只在原生帖子页执行；没有在群资料卡内执行 POST，也没有完成扩展传输适配。后续实现不能只认 HTTP 200：还要检查 GraphQL errors、成功字段，结果不明先查询状态，不重放写请求。

## 回复：已验证与未验证

原生回复操作产生 `/compose/post` 路由，编辑器中保存了目标帖子的上下文；URL 中没有帖子 ID。因此直接打开 `/compose/post` 不能证明会回复指定帖子。

原生编辑器可见原帖、“回复 @password1688”、帖子文本框、图片/GIF/表情等工具；空内容时发送按钮禁用。关闭空编辑器后回到原帖子。

尚未捕获发送请求，尚未核验附件、回复权限、发送错误、发送超时或重复回复。不得猜测 CreateTweet 等端点和 body 后直接开发。若将来需要核验发送，先取得用户对指定测试帖与测试内容的发送授权，再观察原生发送及结果；此研究没有这种发送样本。

## 后续开发建议（设计建议，不代表已实现）

1. 资料卡提供“最近帖子”，点击后读取缓存或请求，首屏展示 3 条；切换成员取消过时结果。请求必须使用目标用户 ID，而非当前登录账号 ID。
2. 只监听已知 xchat host 和资料卡出现/关闭，使用增量观察，避免遍历数百成员、逐个请求帖子。
3. 内容展开或回复输入时固定插件互动区域。原生卡片的 mouseleave 关闭逻辑可能销毁草稿；仅追加 DOM 不足以证明编辑区稳定。优先设计受控 companion 区域，不依赖 X 私有 React 状态。
4. 账号 + 帖子 ID 隔离互动状态，按帖子去重，提交期间禁用对应按钮。复用现有统一调度，但点赞与关注采用各自结果解析和限流状态。
5. 缓存读取优先，按需刷新；点赞/取消后更新该帖。请求失败保留帖子，提示可重试，不清空整张卡。
6. 回复直连尚缺原生发送证据。开发先后顺序可为最近帖子展示 → 已验证点赞 → 完成回复抓包后再实现卡内发送。

## 开发前还需验证

- 两个不同用户的最近帖子、置顶、引用与转帖样本；长帖、视频、空列表、受保护账号。
- 扩展传输下的点赞/取消；两个账号切换；限流、网络丢失、按钮重复点击。
- 群成员弹层中打开回复、输入、切换用户、关闭卡片、关闭列表时的草稿和滚动恢复。
- 用户授权的原生回复发送：真实端点、完整变量、GraphQL 响应和原帖下结果核验。
- 原生点赞与插件操作之间的状态同步。不要将发布时间、关注时间或注册时间混用。

未保留 Cookie、授权头、CSRF 或交易标识；证据中的用户 ID 和帖子 ID 使用占位符。截图仅保存在本地，不提交公共仓库。
