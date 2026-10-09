# 群入群审核提示研究

## 页面核验

在当前群主账号的原生群详情中，“群组邀请链接”显示 1；打开该入口可看到 1 位申请人及“批准”按钮。未执行批准、拒绝或修改群设置。聊天列表的同一群行未显示待审核数量。

## 原生代码证据

本次页面实际加载的 XChat 资源版本为 2c081d1e4dbe594f9f638efdfd2acd4b74a985fe。资源 dm-core-CK8pWjAO.js 中包含 GetGroupJoinRequestsQuery，原生操作标识 7maV7hhqFCfZn-aHJ3Ln0w。

查询变量定义：conversation_id: String!，cursor: XChatGetGroupJoinRequestsPageContinueCursorInput；include_user_public_keys 和 include_juicebox_tokens 默认 false。

查询选择路径：chat_by_conversation_id.conversation.get_group_join_requests，包含 total_count、user_ids_results、cursor 与 social_proof。数量应使用 total_count，不应用当前分页的申请人数推断总数。

## 实际请求与成功响应（继续核验）

通过此前获授权的本机 Chrome 9223 调试连接观察 XChat Shared Worker，捕获到独立 HTTP GET 请求。原生请求并非 WebSocket 审核查询；此前只观察主页面网络，漏掉了 Shared Worker 的读取。

实际端点：`https://api.x.com/graphql/7maV7hhqFCfZn-aHJ3Ln0w/GetGroupJoinRequestsQuery`。URL 仅包含 `variables` 查询参数，本次实际值为 `{"conversation_id":"g2107412709100933527","cursor":{}}`；未携带 features 查询参数。

当前群主账号 @RssHunting 下，原生成功响应 HTTP 200，`data.chat_by_conversation_id.conversation.get_group_join_requests.total_count=1`，`user_ids_results` 长度为 1，`cursor.list_exhausted=true`。再次刷新原生详情得到相同结果。

关闭详情，页面处于 `/i/chat/g2107412709100933527` 后，将捕获的同一只读请求及必要原生认证头在页面 MAIN 环境重放一次，得到 HTTP 200、总数 1、申请人数 1、分页结束 true。这证明读取不依赖详情页面展开，可以支持聊天列表的后台提示。认证头仅保留在研究进程内存中，没有写入文档、日志或探测结果文件。

脱敏结果记录见 `group-join-review-probe-2026-10-09.json`。观察脚本 `scripts/probe-group-review.mjs` 默认只监听；显式传入 `--replay` 才会在关闭详情后复用一次捕获的只读请求。

## 聊天列表对照与剩余边界

未打开详情时捕获的 `GetInitialXChatPageQuery` 成功响应包含 `encoded_message_events`、`message_requests_count`、`message_requests_info.unseen_count`，本次增量响应没有明文入群审核数量。`message_requests_count` 是另一项私信请求数据，不能替代某群待审核数量。本次未解码聊天内容，不将该样本外推为所有首次初始化响应都没有相关事件。

`GetConversationEntryDetailsQuery` 本次成功响应仅返回 `group_type`，不能据此判断当前用户是否为群管理员。仍需核实多群管理权限发现、普通成员的无权限响应、0 申请响应与审核变更推送；本次未批准或拒绝申请，也未验证变化到 0。

已验证可从 X 页面 MAIN 发起跨域只读请求。现有扩展 host_permissions 不包含 api.x.com，不能直接假定后台 fetch 与现有 `/i/api/graphql` 允许列表可原样复用。实现应为已核验端点提供限定的页面读取路径，保留账号一致性校验；不要开放任意跨域请求。

## 建议方案

按账号及群 ID 缓存待审核数量和更新时间。聊天列表的群名称旁显示“待审核 N”，有数据才展示；未读取或失败不能当成 0。点击提示进入该群原生详情审核入口。优先监听原生更新；如确需补同步，只查询拥有管理权限的群，使用统一队列、缓存与冷却，不逐个扫描成员，不自动批准。

只复用详情 DOM 的方案需首次进入详情，无法满足始终无需打开详情的目标。审核数量读取与详情关闭后的读取均已核验，可进入功能开发；自动发现可管理群和推送更新仍需按上面的边界补证据。
