# X 实际网络端点记录

2026-10-05 新增分析零值核验：legacy_current_follow_metrics 中当天存在 metric_type=Unfollows，但没有 metric_value。原生 Follows over time 的 Mon, Oct 5 提示显示 New follows=3、Unfollows=0。此前“省略数值即未知”的解释已修正：仅存在指标条目且省略数值时按 0；缺指标条目、缺日期仍未知。该次七日合计新增 399、流失 16、净增 383，不能替代后续时刻的数据。

核验日期：2026-10-03。在已登录 Chrome 中操作名单、个人资料、数据分析和群聊页面，核对原生请求。以下查询 ID 会随 X 发布变化；插件以浏览器新捕获的操作配置为准，不把固定 ID 当成长期协议。

## 已核验 HTTP 200 和响应结构

| 操作 | 查询 ID | 用途 | 参数 |
| --- | --- | --- | --- |
| Followers | mrqxgX8JzwlL6pvYiC5CPA | 粉丝名单 | userId、count=20、includePromotedContent=false、withGrokTranslatedBio=true、可选 cursor |
| Following | uwmIAx89XrXNuGY-Y7WFLg | 关注名单 | 同上 |
| BlueVerifiedFollowers | ck_SV_kTAlbD2WZiOFNbzw | 蓝V粉丝名单 | 同上，另核验一页带 cursor 请求 |
| UserByScreenName | KybxDj9RrADIITXlGG8kpw | 个人资料及总量 | screen_name、withGrokTranslatedBio=true |
| UserOriginalsTimeline | qtvmQffnepvr0oPe4A8MqQ | 帖子时间线 | userId、count=20、includePromotedContent=true、withQuickPromoteEligibilityTweetFields=true、withVoice=true |
| UserRepliesTimeline | 9FLI4sKKO6rEojPOEHT7BA | 回复时间线 | userId、count=20、includePromotedContent=true、withCommunity=true、withVoice=true |
| UserRepostsTimeline | hkQQA_PMJfzHlRtnUYYXMg | 转帖时间线 | userId、count=20、includePromotedContent=true、withVoice=true |
| accountOverviewDailyQuery | 2hqAR3h2xhN1cUrUBZypyg | 创作者分析 | current/prev 的 from/to 毫秒时间与对应 ISO、backfill_from/to、show_realtime_active_followers、show_verified_followers |

请求格式：GET /i/api/graphql/{queryId}/{operation}，查询参数 variables、features、fieldToggles 为 JSON。个人资料 fieldToggles 包含 withPayments=false、withAuxiliaryUserLabels=true；三类帖子包含 withPayments=false、withArticlePlainText=false。功能开关从实际请求提取，不手写猜测值。注册表只保存布尔开关、count 和参数名称，不保存用户 ID、cursor、完整 URL、Cookie、Bearer、CSRF。

## 用户模型

响应用户位于 data.user.result 或名单 itemContent.user_results.result。新版响应可以没有 legacy：

```json
{
  "rest_id": "USER_ID",
  "core": {"name": "示例", "screen_name": "example"},
  "profile_bio": {"description": "简介"},
  "relationship_counts": {"followers": 12, "following": 8},
  "tweet_counts": {"tweets": 20, "media_tweets": 3},
  "relationship_perspectives": {"following": false, "followed_by": true},
  "follow_request_sent": false,
  "is_blue_verified": true,
  "verification": {"verified": false}
}
```

蓝V用 is_blue_verified；verification.verified 不能替代它。缺字段保持未知。

## 名单及帖子分页

路径 data.user.result.timeline.timeline.instructions。名单用户在 entries[].content.itemContent；模块在 content.items[].item.itemContent。Bottom cursor 表示续页；只有 TimelineTerminateTimeline(direction=Bottom) 才表示结束。空转帖响应实际同时有 Top/Bottom 游标和 Bottom 终止信号，不能仅凭零条记录认定结束。

帖子在 itemContent.tweet_results.result，可含 TweetWithVisibilityResults 包装。回复模块包含其他作者的父帖，必须按 legacy.user_id_str 或 core.user_results.result.rest_id 过滤当前作者，按 rest_id 去重。不能递归把引用帖当成自己的发帖。legacy.created_at 用于北京时间日统计。单页结果是已采集数量，不是全天总量。置顶帖不能用于判断已翻页到当天边界。

## 创作者分析：后续适配依据

路径 data.viewer_v2.user_results.result：

- current_time_series：count、engagement_type、is_engaging_user_verified（字符串 true/false）、timestamp（毫秒）。
- hourly_backfill：count、engagement_type、timestamp。与日数据有重叠，不能直接相加。
- verified_follower_count：字符串数值。
- relationship_counts.followers：粉丝总数。
- realtime_active_followers：active_count、is_approximate，显示估计标记。
- legacy_current_follow_metrics / legacy_previous_follow_metrics：timestamp.iso8601_time、metric_values；缺 metric_value 保持未知。

实际类型包括 Displayed、ReplyCreate、TweetCreate、Reply、Fav、Follow、Unfollow、Bookmark、Retweet、QuoteTweet。ReplyCreate 与收到的 Reply 分开。日桶以 UTC 划分；不能把它直接标成北京时间今日。小时回填只在覆盖完整时用于转换日界线。该接口已接入 0.3.0 分析面板，使用独立 UTC 口径。

## 仅请求核验，待解析

UsersByRestIds（BuQFwM7wpHl00cfHL-r0rA，userIds）、friends/following/list.json、ViewerBadgeCounts、CreatorStudioTabBarItemQuery 均观察到 HTTP 200。尚未确认响应模型。批量用户资料不等于群成员名单，不能把该请求中的所有用户归入当前群。

## 群聊与写操作边界

/i/chat/g{GROUP_ID}/info 的成员列表位于 about:blank、opaque origin 嵌入框架。本次原生界面展开了成员列表，但顶层 fetch 观察器没有取得可核验的成员端点。现有插件群采集仍需实机验证，不宣称完整名单。后续需框架上下文桥接、当前群 ID 校验、明确成员引用和资料补全分离。

friendships/create 是现有候选写接口，本次没有发起关注动作，没有核验其实际响应。关注按钮必须逐人操作，并以服务器确认结果更新关系。

## 功能顺序

1. 当前群成员采集闭环：框架支持、成员来源验证、未知关系提示、逐人关注。
2. 名单续传与完整快照，互关/单向关系及粉丝变化。
3. 创作者分析适配器：七日曝光、互动、蓝V粉丝和活跃粉丝；标明 UTC 日桶、估计值和更新时间。
4. 今日发帖/回复时间线续传，达到北京时间日界线后显示完整覆盖；每日目标编辑。
5. 本地趋势、联系人标签、导出与提醒，沿用账号隔离和数据来源模型。

所有文档样例均脱敏，未保存聊天正文或认证凭据。

## 0.3.0 群成员 DOM 核验补充

实际 info 页面展开成员后，成员行包含同级 A 与 BUTTON。A 的 href 是 https://x.com/{username}；BUTTON 的 aria-label 为“更多 {名称} 的选项”，data-slot 为 xds-menu-trigger。不读取名称来匹配 ID，不采集普通消息链接。

代码在相关 about:blank 框架中运行，通过 FRAME_CONTEXT 获取后台验证的当前群 ID。只在 /i/chat/g{ID}/info 提交引用；资料补全用已捕获的 UserByScreenName。当前保留“部分采集”状态；不通过 DOM 数量宣称群名单完整。

创作者分析、创作续传、每日目标已接入。仍需安装后验证：框架注入与成员采集闭环、非空转帖结构、关注写接口。工具 URL 策略阻止访问 chrome://extensions，未绕过该限制。

## 2026-10-04 内置配置复核

在已登录 Chrome 再次打开资料、帖子、回复、转帖、正在关注、关注者、认证关注者及创作者分析；8 个上述操作均观察到原生 HTTP 200，查询 ID 与此前记录一致。features、fieldToggles、安全 defaults 已写入 src/background/bundled-endpoints.js。

这是开发期采集步骤，用户无需重复。新安装直接使用内置配置，后续原生请求可更新；只有配置失效才提示对应页面。认证凭据与账户变量未内置。

## 0.4.1 账号与关注会话修复

对照 XClearReply：其账号名称来自 AppTabBar_Profile_Link 与 SideNav_AccountSwitcher_Button；操作请求在 X 页面中使用 ct0、网页应用 Bearer 和 credentials: include。CircleMate 现采用同一页面会话思路，并保留 Cookie store、twid 与响应 ID 校验。

2026-10-04 再次打开当前账号原生资料页，观察 UserByScreenName（KybxDj9RrADIITXlGG8kpw）HTTP 200。账号同步优先选择此接口；不再退回 account/verify_credentials，也不让缓存的 UserByRestId 优先覆盖它。过期观察配置返回 400/404 时，可尝试不同查询 ID 的实测内置配置。

关注使用 POST /i/api/1.1/friendships/create.json，表单 user_id 为当前群成员的数字 ID。仅接受本人点击；接口确认 following 或 follow_request_sent 后才更新本地记录。请求结果丢失时不重发。新增测试验证页面传输、来源/路径/账号约束和重复写保护；未在真实账号上提交关注写入。

## 0.4.4 粉丝名单 404 核验

用户导出的 Followers 记录显示 HTTP 404；同一导出中的 Following、BlueVerifiedFollowers 为 200。开发者再次打开原生粉丝页面，捕获同一 Followers 查询 ID（mrqxgX8JzwlL6pvYiC5CPA）的 HTTP 200，features 与失败导出一致。原生请求不发送 fieldToggles，插件此前发送空对象；现已省略空 fieldToggles。此差异尚未证明是 404 的根因，更新后的插件请求仍需本机验证。

400/404 提示不再直接断言配置失效，也不要求用户打开名单页。后台保留退避自动重试，手动重试只是补充。更新请求策略后，旧 400/404 的退避可提前解除一次，保留分页游标与已采集数据。

## 2026-10-04 0.4.30 真实关注抓包核验

在用户当前 Chrome 群成员页点击插件“关注 @yuehqiang”一次，捕获：

- POST `/i/api/1.1/friendships/create.json`
- 表单：`user_id=412111646`
- HTTP 200
- 响应顶层：`id_str="412111646"`、`screen_name="yuehqiang"`、`following=true`、`follow_request_sent=false`。
- 插件显示“已关注 @yuehqiang，已移出未关注筛选”，筛选人数 268 → 267。
- 随后只读打开 `https://x.com/yuehqiang`，原生按钮显示“正在关注 @yuehqiang”。证据：`follow-live-0.4.30.jpg`。

本次插件真实请求成功，证实该请求路径及 user_id 参数可用；未复现此前失败，也没有为对比重复关注或取消关注。尚不能据本次成功解释其他账号之前的异常。抓包未保存 Cookie、授权头或会话凭据。
# 2026-10-04 名单关注时间实测

通过已登录 Chrome 的原生页面捕获 `Followers` 与 `Following`，两次均为 HTTP 200。检查原始 JSON 用户对象及 timeline entry，未发现可提取的关注关系建立时间。

- `itemContent.user_results.result.core.created_at` 是账号注册时间。
- `relationship_perspectives.following`、`followed_by`、`live_following` 为布尔状态，没有时间字段。
- `entries[].sortIndex` 是时间线排序值。实测 Following 前三条为 `2106765950299668480`、`2106765950299668479`、`2106765950299668478`，连续递减；不能解码成各用户的关注时间。
- 本结论限于本次捕获的两份页面响应，不代表所有 X 接口均无此数据。插件只展示本地确认关注操作的时间。
- 需回关名单从已缓存 followers 成员中筛选 `followedBy=true` 且 `following=false`，排除自己、已请求关注及已确认异常账号。未知关系不作未关注推断。

# 原生取关实测：2026-10-05

第二次独立核验：目标 Zhibin992（1516238983000637442），与第一次不同账号。原生 destroy POST 使用同样 12 个标志及 user_id，HTTP 200 响应仍为 following=true / follow_request_sent=false。随后新资料请求 HTTP 200 返回 relationship_perspectives.following=false，页面显示“关注”。重新关注并刷新，资料返回 following=true，页面显示“正在关注”。两个样本行为相同；尚不将两个样本推定为所有账号的协议保证。

用户授权选择当前已关注账号测试，并要求测试后重新关注。原生请求：POST `/i/api/1.1/friendships/destroy.json`，表单 `user_id` 为目标数字 ID；12 个附加标志均为 `1`，配置见 `src/background/verified-writes.js`。请求返回 HTTP 200，目标 id_str / screen_name 一致，但 following 仍为 true。

随后原生资料请求 UserByScreenName 返回 HTTP 200，relationship_perspectives.following=false；页面显示“关注”。重新关注后刷新资料，同字段为 true，页面显示“正在关注”。因此 destroy 响应的 following 不能独立用来判定失败，插件在未获得 false 时读取目标资料核验，不重发写请求。凭据未写入证据文件。

