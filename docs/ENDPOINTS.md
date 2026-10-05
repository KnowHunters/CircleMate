
## 0.4.5 同步状态与 Followers 404 排查（2026-10-04）

- 固定顶部显示同步灯，正常及分页等待闪绿，部分任务失败闪橙，全部任务失败闪红；同步完成隐藏。手动重试只在失败时显示。
- 账号与配置只属于实时标签；数据标签的关系缓存、关系概览、创作分析和本地记录默认折叠。
- 同一已登录浏览器实测：原生 Followers query `mrqxgX8JzwlL6pvYiC5CPA` 返回 200，旧插件返回空响应体 404。Bearer、CSRF、变量及 features 相同，旧请求缺少 content-type 和 x-client-transaction-id。此记录证明是真实请求失败，不代表已经证明唯一根因。
- 新传输先在登录标签 MAIN world 请求 /home，读取当前网页的公共验证种子和资源映射，下载 abs.twimg.com 的公开 ondemand.s 资源，通过 Web Crypto 为每个 method/path 生成交易标识。公共种子在进程中缓存一小时，不保存 Cookie、原始 HTML 或交易标识。GraphQL GET 在 MAIN world 执行；原有页面及后台传输保留作兼容回退。
- 当前原生资源定位实测为 chunk 59924、hash e63041db5e1fb9fb，资源返回 200；生成器从当前资源动态提取索引，不能将该 hash 当成永久端点。SVG 必须选动画路径，不能选 X 标志路径。
- 诊断导出增加 lastFailure：状态码、传输层、响应类型、数字 API 错误码、是否发送 fieldToggles/交易标识。成功请求清除失败诊断。
- 交易标识实现源自 MIT 项目 https://github.com/swyxio/XClientTransactionJS ，源码及许可证位于 background/vendor/x-client-transaction；改用 Web Crypto，并兼容数字 chunk 映射和双路径 SVG。
- 52 项自动测试通过，数据标签折叠及实时内容隔离经过浏览器检查。新版登录请求尚未重新加载插件进行实测，因此 Followers 404 修复仍需以新版 lastFailure 和 HTTP 成功响应验收。

## 0.4.6 状态灯位置与追加抓包（2026-10-04）

同步灯移至配置设置卡片的标题旁。折叠时保留，绿/橙/红含义及完成隐藏规则不变。浏览器样例验证橙灯位于 settings-card summary 内，animation-name 为 pulse。

本轮原生粉丝页 Followers 请求仍返回 200，query ID mrqxgX8JzwlL6pvYiC5CPA。首页另一个 Followers 200 请求的调用栈也来自 X main bundle，不能把它记成 CircleMate 请求。观察期间未捕获 CircleMate 新一轮失败包；不能据此断言插件 404 已修复，也不能把其他两类名单成功解释为 Followers 路由正确。

lastFailure 新增 transactionError，区分公共启动数据/资源不可用与交易标识生成失败。继续验收需匹配 CircleMate 发起的请求、HTTP 状态和 sentTransactionId；原生成功包仅用于对照。

追加实际失败包：request 29924.45722 由 readInPage 发起，Followers 返回 404，包含 content-type，但缺少 x-client-transaction-id。原生对照请求返回 200且带该头。确认交易标识补齐未生效；缺少交易标识与本次失败相关，尚未进行有/无标识的控制变量验证，不能断言这是唯一原因。

0.4.6 增加当前登录文档公共 chunk 映射作为 home 新版 shell 的资源定位补充。初始化失败按 BOOT_READ_FAILED、SEED_PARSE_FAILED 或资源缺失记录。Followers 初始化失败时停止发送无标识请求，保留自动退避，避免反复发送同一失败包。需要新版登录实测验证 200 响应；本轮未完成插件重载。

## 0.4.7 原生成员列表

实际页面 x.com/i/chat/g2099817971019608222/info 中，所有成员位于开放 Shadow DOM；成员行的 profile anchor 与带“更多 <昵称> 的选项”标签的菜单按钮为直接兄弟节点。旧 content 仅使用 document.querySelectorAll，无法读取该根。新 shared/roster.js 统一遍历根并识别行，roster-ui.js 在原列表植入筛选和逐行状态按钮。未关注以明确 following=false 为准，不能用部分 following 名单中不存在来推断。

ROSTER_STATE、ROSTER_ENRICH、ROSTER_FOLLOW 仅供本扩展内容脚本，在后台校验群信息上下文。关注调用既有 FOLLOW 服务，用户点击触发，无批量自动关注。名单分页与原生搜索由 X 处理；插件只筛选已经加载的行。

## 0.4.13 本地关系判断与按需成员请求

ROSTER_STATE 的群 users 投影包含只有 username 的成员，未解析 ID 不阻止本地关系判断。通过账号缓存的 following/followers ID 集合与 username 集合匹配。完整非 stale 快照的缺失项可推断 false；部分快照缺失项不推断。较新的关系观察与关注写入优先。

ROSTER_FOLLOW 可传入 username；后台只接受当前群已登记用户名，按需调用已有 profile 端点解析 ID。必须验证返回用户名一致、群归属、当前账号及关系，再调用已有关注写端点。禁止自动关注或自动重放失败写请求。

profileRetryAt 持久化在账号缓存；群投影合并账号/群冷却时间，UI 到期前不调度 ROSTER_ENRICH。正在分页同步关注缓存时，自动资料补全等待缓存；其他无法判断的成员保留原分批补全与失败重试机制。蓝V筛选仅使用已确认元数据。
