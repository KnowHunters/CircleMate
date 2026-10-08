# 群成员与当前账号互动指标：可行性研究

本轮只研究，没有修改插件功能。2026-10-08 在已登录 Chrome 中打开 X 原生通知页，观察页面实际请求及响应；未发送点赞、评论等操作。原始私人通知正文及账号名单不保存到公共仓库。

## 实际接口

原生 GET `/i/api/graphql/4TuDRWeusve2-BH2IqldBg/NotificationsTimeline`。

- 全部：variables 为 `{"timeline_type":"All","count":20}`，HTTP 200。
- 页面自动续页：同一接口，variables 额外包含服务器返回的 cursor，HTTP 200。
- 提及：点击原生提及页，variables 为 `{"timeline_type":"Mentions","count":20}`，HTTP 200。
- features 为原生请求实际配置，本轮未试改参数，也未证明任何任意日期过滤参数可用。上述 queryId 是本次观察值，不应永久硬编码为唯一可用版本。

响应入口：`data.viewer_v2.user_results.result.notification_timeline.timeline.instructions`，本次 entries 位于指令的 `entries`。

## 字段和意义

| 数据 | 本次实测字段 | 可提供的信息 |
| --- | --- | --- |
| 互动种类 | entry.content.clientEventInfo.element | 实测 user_liked_multiple_tweets、users_liked_your_tweet、user_replied_to_your_tweet；不能仅凭通知图标推断 |
| 点赞发起者 | itemContent.template.from_users[].user_results.result.rest_id | 可与缓存群成员的稳定用户 ID 关联 |
| 点赞目标 | itemContent.template.target_objects[].tweet_results.result.rest_id | 可确认已返回的目标帖子；还应核验目标作者为当前账号 |
| 点赞通知时间 | itemContent.timestamp_ms | 本次为 ISO 日期字符串，尽管字段名包含 ms；这是通知时间，不保证每个用户实际点赞时间 |
| 评论作者 | itemContent.tweet_results.result.core.user_results.result.rest_id | 可归属具体成员 |
| 评论 ID 和内容 | result.rest_id、result.legacy.full_text | 可去重及展示评论摘要 |
| 评论对象 | legacy.in_reply_to_user_id_str、in_reply_to_status_id_str | 区分直接回复当前账号与普通提及、会话其他参与者 |
| 评论时间 | legacy.created_at | 评论发帖时间 |
| 后续分页 | TimelineTimelineCursor / cursorType | 可继续采集，尚未验证完整历史范围 |

## 实际样本与限制

首个全部页有 2 条点赞通知和 4 条直接回复。两条点赞通知分别返回 1 位及 3 位用户，各含 1 条目标帖子；4 条回复均能确认回复给当前登录账号。可以据此建立“已观察到的成员互动记录”。本轮没有将这些用户与某个具体群聊名单做交集，因此没有宣称截图中的成员已经匹配成功。

聚合通知有截断证据：某条关注通知的文字为“一位用户及另外 97 人”，但 from_users 只返回 10 位。该证据针对关注聚合通知；不能据此声称本次点赞样本也发生截断，但不能假定所有聚合通知都包含完整成员列表。

不要把聚合通知中的人数均摊给成员；多用户、多目标通知不能直接做笛卡尔积累加。本次一目标点赞样本可按用户 ID + 目标帖子 ID 记录已观察关系。重复刷新、通知聚合变化及分页重叠均需去重。

账号资料的 favorites_count 是该账号累计点赞计数，不代表他给当前用户点了多少赞。帖子 favorite_count、reply_count 是总量，也不代表群成员个人贡献。

通知入口主要提供“对方向我”的互动；“我向对方”的完整历史尚未验证。插件自己的已确认操作可从启用记录后累计，但不能补造启用前历史。取消点赞与删除评论会改变当前状态，旧通知记录应称为历史观察记录，而非现存点赞数。

## 推荐架构

按登录账号增量采集通知，一份数据缓存供所有群复用，利用服务器 cursor 分页与统一调度限流。进入群列表仅把互动用户 ID 与群成员 ID 做本地关联，不逐一请求数百个成员资料或时间线。

记录来源、方向、事件类型、稳定 ID、目标帖子、观察时间及可信事件时间。无法证明完整的周期显示“已采集范围／部分数据”；未匹配到记录显示“暂无记录”，不写“0 次互动”或“不互动”。

第一版适合在成员行显示“已记录点赞帖子数／评论条数”，操作栏增加“有互动”筛选和排序。详情提供互动原帖、评论摘要、最近可确认的互动时间。七日或三十日指标需先验证分页覆盖和时间语义，不能把通知聚合时间作为所有点赞的精确发生日期。

## 尚待开发前验证

- 指定群成员名单与通知用户 ID 的交集，以及跨群复用。
- 分页历史覆盖、终止条件、聚合通知的变更与用户截断。
- 转帖、引用样本的实际事件字段，本轮未出现，不能列为已验证。
- 我对成员的历史互动数据来源及权限。
- 后台直接读取通知时的账号核验、错误、限流与刷新方式。
