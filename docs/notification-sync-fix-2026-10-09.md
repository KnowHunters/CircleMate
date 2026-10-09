# 通知同步失败核验

## 实际现象

Chrome 中 @knowhunters 的群成员列表显示互动同步失败。“同步互动”按钮的实际错误为“不支持的页面请求”。已有部分互动缓存仍可显示。

## 原因与修复

后台 MAIN 页面读取与 content 消息回退读取的 GET 允许列表均遗漏 NotificationsTimeline。MAIN 路径返回 handled:false，回退路径返回 REQUEST_REJECTED，未向 X 发出该通知请求。这次错误不能解释为 X 的 403 或限流。

两条路径均加入已验证的 NotificationsTimeline 操作，沿用现有账号校验、会话参数及原生端点配置。未新增猜测端点或逐个读取成员资料。

互动筛选读取 memberInteractions.members 的 likes/replies 正数记录，排除本人及异常账号，并遵循蓝V复选框。

## 验证与限制

158 项测试通过，构建成功。新增 MAIN 通知读取回归测试、content 回退通知读取断言，以及互动筛选测试。仍拦截未知操作和账号不匹配请求。

当前浏览器工具无法接管 chrome://extensions 管理页，因此尚未重载已安装插件并完成修复后的在线请求核验；需要重载 dist 插件并刷新 X 页面，再点击同步互动确认结果。
