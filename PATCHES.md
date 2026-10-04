# 本地补丁记录

生产环境使用的插件与本仓库上游导入点之间的全部差异。升级上游版本后需逐条复查是否仍需要。

## 1. `dist/server/auth/DingTalkAuth.js:107` — 扫码登录必崩

- 提交：`fix: 钉钉扫码登录时把钉钉用户对象当作主键传给 addUser`
- 引入版本：v0.2.0
- 症状：`invalid input syntax for type bigint: "[object Object]"`，首次扫码（`usersAuthenticators` 里没有该 uuid 时）必定失败
- 修复：`addUser(user, …)` → `addUser(ncUser, …)`
- 复查方法：

  ```sh
  grep -n 'addUser(' dist/server/auth/DingTalkAuth.js
  # 期望：addUser(ncUser,
  ```

## 2. 钉钉客户端内免登（上游只实现了扫码）

上游 v0.2.0 的登录路径**只有「统一授权/扫码」一条**：

| 位置 | 事实 |
|---|---|
| `dist/client/index.js` | 按钮只做 `getAuthUrl` → `location.href = 返回的 URL`，全文件没有任何 JSAPI 调用 |
| `dist/server/openapi/dingTalkApi.js:133` | 生成的 URL 是 `https://login.dingtalk.com/oauth2/auth?...&scope=openid&prompt=consent` |
| `dist/server/actions/dingTalkActions.js:51-57` | `authCode` 被解构出来但**完全没用**，`if (!code) ctx.throw(400)` —— 免登码进来直接被拒 |

后果：在钉钉客户端里点「钉钉登录」会弹二维码，要在钉钉内扫钉钉自己的码。

本补丁增加免登，**扫码路径保留**（非钉钉浏览器仍走原流程）：

| 文件 | 改动 |
|---|---|
| `dist/server/openapi/dingTalkApi.js` | `contact.getUserByAuthCode(code)` → `POST https://oapi.dingtalk.com/topapi/v2/user/getuserinfo`（免登码换 userid，5 分钟有效、一次性） |
| `dist/server/auth/DingTalkAuth.js` | 拆出 `#resolveDingUser()`：有 `authCode` 走免登（`getuserinfo` → `topapi/v2/user/get` 取详情），有 `code` 走原扫码路径；两条路都以同一个钉钉 `userid` 作为 `usersAuthenticators.uuid`，绑定关系共用。参数从 `ctx.action.params` 和 `.values` 两处读（query 与 POST body 位置不同） |
| `dist/server/actions/dingTalkActions.js` | 新增 `getFreeLoginConfig`（只回 `corpId`，appKey/appSecret 不出服务端）、`freeLogin`（authCode → token，JSON 返回，不整页跳转） |
| `dist/client/index.js` | `SignInButton`：UA 含 `DingTalk` → 取 `corpId` → 载入 JSAPI（CDN `https://g.alicdn.com/dingding/dingtalk-jsapi/3.1.0/dingtalk.open.js`，官方文档中的「方式二」，因 dist-only 无构建步骤只能这么引）→ `dd.ready` + `requestAuthCode({corpId})`（无三段式时回落 `dd.getAuthCode`）→ `freeLogin` → `auth.setAuthenticator()`+`auth.setToken()` → reload。任一环节失败自动回退扫码，不会把人锁在门外 |

配置：`corpId` 有两个来源，客户端按「容器注入的 URL 参数 → 服务端配置」的顺序取。

| 方式 | 做法 | 说明 |
|---|---|---|
| **A. `$CORPID$` 占位符（推荐）** | 钉钉开发者后台 → 应用 → 基础信息 → 开发管理 → 应用首页地址与 PC 端首页地址填 `https://device-mgmt.aiaocheng.com/?corpId=$CORPID$` | 从**工作台**打开时容器会替换成真实 CorpId（官方文档明确：只有在工作台打开才会替换）。后台的「企业 CorpId」输入框可以留空，不必手抄 |
| B. 后台手填 | 认证器配置表单 →「企业 CorpId」→ 存 `options.internal.corpId`（jsonb，无 schema 变更） | CorpId 在**开发者后台首页**，不在应用详情页（详情页只有 AppKey/AppSecret/AgentId，这也是常见困惑点）。需匹配 `^ding[a-z0-9]+$` |

入口 URL 上的 `corpId` 由 `load()` 里最早的 `captureCorpIdFromUrl()` 暂存进 `sessionStorage`——SPA 路由跳转会丢参数，只有入口这一趟拿得到。


**部署前必须由使用方在钉钉开放平台确认的前置条件**（缺一不可，否则免登必然回退扫码）：

1. 应用类型＝企业内部应用（生产实测 appKey 前缀 `dingoyk`、长度 20，符合）；
2. 「开发管理」里的应用首页地址/PC 首页地址与可信域名包含 `device-mgmt.aiaocheng.com`；
3. 权限管理里开通 通讯录个人信息读权限／成员信息（`qyapi_base`，`getuserinfo` 必需）；若 `userCheckType=mobile`，还需「个人手机号信息」权限，否则新代码会明确报「钉钉未返回手机号」而不是拿空条件去匹配用户；
4. 应用已发布并加到工作台，用户从**工作台入口**打开（聊天里点开链接可能不被当作微应用容器）。

## 3. `dist/client/index.js` — 回跳的 token 之前根本没人读

> **22:05 更正**：本节「没有任何从 URL 取 token 的代码」这个结论是**错的**，来源是 grep 只扫了 `@nocobase/app/dist/client`，漏掉 `plugin-auth` 的懒加载分块 `249.*.js` —— 那里的 `AuthProvider` 已经在做同一件事。下面的两个 grep 命令保留原文以备追溯，但请连同「第三次迭代（22:05）」一节一起读：`pickTokenFromUrl` 属于重复实现，且它当时把整站崩成了错误边界。

`redirectAuth` 把凭证拼在 URL 上回跳：`…?authenticator=X&token=Y`。这是 NocoBase 1.x 客户端的行为；
在 2.0.61 的产物里实测**没有**任何从 URL 取 token 的代码：

```sh
# 在容器内，全部 SPA 产物
cd /app/nocobase/node_modules/@nocobase/app/dist/client
grep -rohE ".{0,140}auth\\.setToken\\(.{0,90}" *.js | sort -u   # 只有 setToken(null) 两处
grep -rlc "authenticator=" *.js                                  # 0
```

`Auth.getOption()` 的实现是 `this.api.storage.getItem(key)`（localStorage），`getToken()`/`setToken()` 只读写 storage。
所以即使 `addUser` 崩溃修好，扫码路径也只是服务端发了个 token、浏览器把它当未知参数丢掉。

本补丁在插件客户端 `load()` 里加 `pickTokenFromUrl(app)`：读 `?authenticator=&token=` →
按官方登录时序 `setAuthenticator()` + `setToken()` → 抹掉这两个参数 → reload。
为避免任意页面带 token 参数就自动登录，只有在本标签页 `sessionStorage` 里有 `nocobase-dingtalk-pending`（点扫码按钮时写入）且与 URL 里的认证器名一致时才生效。

顺带记录两个已知弱点：扫码路径的 token 出现在 URL 上，会被 nginx access log 记下来（免登路径是 JSON body，不落日志）；`prompt=consent` 保持原样未动。

## 3b. 部署后实测到的两个环境事实

**客户端产物的真实 URL**（容器内 nginx `sites-enabled/nocobase.conf`）：

```
location /static/plugins/  →  alias /app/nocobase/node_modules/;  expires 365d;  access_log off;
```

所以浏览器加载的是 `https://device-mgmt.aiaocheng.com/static/plugins/nocobase-plugin-ding-talk/dist/client/index.js`
（靠 `node_modules` 里那个符号链接指向 `storage/plugins/`）。两个后果：

1. `expires 365d` 且文件名无内容 hash、URL 不带版本参数 → **老客户端可能被浏览器缓存住**，改完 `dist/client/index.js` 后需强制刷新（钉钉内要关掉微应用重进或清缓存）。
2. 这一段的 `access_log off`，所以插件 JS 的加载请求**不会出现在 `nocobase.log` 里**，别拿访问日志判断客户端有没有拿到新代码；直接比对该 URL 的字节数/内容。

**动作参数的位置**（`@nocobase/resourcer/lib/resourcer.js:250-262`）：query 与 body 会合并，但非 GET 时
`params.values = ctx.request.body`（整个 body），**不是** body 里再套一层 `values`。
手工 curl 要用扁平 body：

```sh
curl -X POST -H 'Content-Type: application/json' -d '{"authenticator":"s_m6bd8kfrhe7"}' \
  https://device-mgmt.aiaocheng.com/api/community-ding-talk:getFreeLoginConfig
# → {"data":{"corpId":null}}   # null 表示后台还没填 corpId，正常
```

写成 `{"values":{...}}` 会得到「认证器不能为空」，那是测试姿势错，不是代码 bug。

## 4. 顺手修掉的两个上游 bug

- `DingTalkAuth.js` 构造函数里 `emailDomain.split("s*,s*")` 少了转义（应为 `/\s*,\s*/`）。生产值是 `aiaocheng.com,163.com`，错的分隔符使它变成**一个**含逗号的域名，邮箱域名白名单形同虚设。当前 `userCheckType=mobile`，该分支未被触发，但一旦改用邮箱匹配就会暴露。
- 邮箱域名校验拿 `userDetail.email` / `userDetail.org_email` 判断，却用 `user.email` / `user.orgEmail` 作为查询条件，两者不一致；统一为后者（免登路径没有 `userDetail` 的 `email` 字段，本来也必须统一）。
- `userCheckType=mobile` 时补了空值保护：钉钉没返回手机号直接 400，而不是 `findOne({filter:{phone:undefined}})`。

## 验证状态

- `node --check`（容器内 Node v22.22.3，走 stdin，不落服务器磁盘）：4 个改动文件全部通过。
- **2026-10-04 20:21 已部署到生产**（含免登 + token 接收 + corpId），部署后实测：
  - `getFreeLoginConfig` → `{"data":{"corpId":null}}`（动作已注册、能取到认证器；`null` 是后台还没填 corpId）；
  - `freeLogin` 用假 authCode → 钉钉返回 `40078 nonexistent temp auth code`（证明 action → `authManager.get` → `signIn` → `validate` → `getUserByAuthCode` 整条链打通，且错误干净返回、没写库）；
  - 上游 `getAuthUrl` 仍返回正确的 `login.dingtalk.com` 授权 URL（扫码路径无回归）；
  - `docker logs` 里没有插件加载错误，`system.log` 无新增异常；`authenticators:publicList` 仍回 `allowSignUp:false`；
  - `/static/plugins/nocobase-plugin-ding-talk/dist/client/index.js` 已是新的 9069 字节产物（含 `freeLogin`/`requestAuthCode`/`nocobase-dingtalk-corpid`）。
- **仍未在钉钉内实测**。差的只剩钉钉侧配置：后台填 `corpId`（或把首页地址设成带 `$CORPID$`）+ 上面 4 项前置条件，然后由业务账号在钉钉内点击验证。
- 判定成功的依据：`select * from "usersAuthenticators"` 出现带 `uuid` 的行；且 nginx 日志里 `getFreeLoginConfig`/`freeLogin` 有命中、`redirectAuth` 不再被调用。

### 20:21 那次部署后的实测结果：免登没被触发，原因不可见 → 第二次迭代（21:40）

用户在 PC/手机钉钉里点击后仍然只是回退扫码。日志证据（`/var/log/nginx/nocobase.log`，容器内）：

| 时间 | 事实 |
|---|---|
| 20:41:35 / 20:43:13 / 20:48:51 / 20:51:54 / 20:52:54 | 钉钉 UA 重新加载页面，`POST /api/authenticators:publicList` 正常 |
| 20:41:39、20:43:20、20:48:57、20:52:08、20:52:17、20:52:47 | 点击后**只有** `POST /api/community-ding-talk:getAuthUrl`（200） |
| 全天 | `getFreeLoginConfig`/`freeLogin` 各只有 3 次/1 次命中，`client=172.21.0.1`，全是本机 curl 测试；**浏览器一次都没发过** |

先证明了「浏览器跑的确实是新代码」，排除缓存嫌疑（这一段很关键，否则会误判成 365d 缓存）：

- `?hash=` 的算法在 `@nocobase/server/lib/plugin-manager/options/resource.js`：`sha256(mtime + APP_KEY + package.json.version + @nocobase/server 版本 + PLUGIN_URL_HASH_SALT).slice(0,8)`，**只跟 `dist/client/index.js` 的 mtime 有关**；
- 按线上进程（`/proc/470/environ`）的 env 复算，20:21 部署后 `mtime=2026-10-04 20:21:20.644` → `027627ac`，与 `pm:listEnabled` 下发值一致；
- `pm:listEnabled` 响应头是 `Cache-Control: no-cache, no-store` → 每次刷新都拿到变化后的新 URL → 浏览器必然重新下载了新 JS；
- SDK 侧没有本地 ACL 拦截（`@nocobase/sdk/lib/APIClient.js` 的 `resource()` 只是拼 URL），所以也不是「请求被前端挡掉」。

结论：免登在**发出任何请求之前**就失败并静默回退，而失败点全在浏览器里（服务端不可见）。`/static/plugins/` 那条 location 又是 `access_log off`，连累插件 JS 的请求也不留痕。

两个高概率原因（都能解释上述现象）：

1. **原代码优先用老接口**。入口 referer 里有 `dd_debug_unifiedAppId`、`dd_debug_pid=pcHome`，说明是**新版统一容器**从工作台打开；而 `requestAuthCode()` 里 `if (dd.runtime.permission.requestAuthCode) … else if (dd.getAuthCode)` 优先走 1.x/2.x 的 `dd.runtime.permission.requestAuthCode`。
2. **`dd.env.platform` 这道硬门槛在 PC 端可能不成立**。CDN 版 JSAPI 的判定是 `isPC = !!containerId || window.dingtalk?.platform?.invokeAPI`，`platform` 最终回落到 `"notInDingTalk"`，而原代码 `if (!inDingTalk(dd)) throw`，判定失败就直接放弃免登。

`21:40` 的第二次部署（提交 `e880827`，只动 `dist/client/index.js`）做了四件事：

| 改动 | 目的 |
|---|---|
| `dd.getAuthCode` 与 `dd.runtime.permission.requestAuthCode` **依次尝试**，各自 6s 超时，失败原因逐级累积 | 不再押注单一接口；容器不回调也不会把按钮卡死 |
| 去掉 `dd.env.platform!=="notInDingTalk"` 硬门槛（UA 已经判过钉钉），并把 `env=<platform>` 写进错误信息 | PC 端判定失败时仍然有机会免登，且判定结果可见 |
| JSAPI `<script>` 加载加 8s 超时 | 既不 `onload` 也不 `onerror` 时，按钮不会永久转圈且**一条日志都不留** |
| 回退扫码时把失败阶段+原因作为 **`dbg` 查询参数**带在 `getAuthUrl` 上 | nginx 记录 request 行（不含 POST body），于是 `POST /api/community-ding-talk:getAuthUrl?dbg=authcode\|getAuthCode:无响应 ; requestAuthCode:{"errorCode":7,...} env=pc` 这样的一行就是最终诊断依据 |

顺带把 `captureCorpIdFromUrl()` 改成在**整条 URL** 上匹配 `corpId`：登录守卫会把入口地址塞进 `redirect=`（实测 referer 为 `/signin?redirect=/m?corpId=ding…`），此时它不再是顶层参数，只查 `location.search` 会漏。

`dbg` 只保留 ASCII，并把邮箱抹成 `[mail]`、7 位以上数字抹成 `[num]`（`DingTalkAuth.js` 有两处报错会带上用户邮箱，不能借着诊断写进访问日志）。

服务端 `getAuthUrl` 只读 `ctx.action.params.values`，多出来的 `dbg` 是 query 参数、会被忽略，无需改服务端。

**21:40 部署后实测**：`dist/client/index.js` → `cd3d3b9b…`（12185 字节，与仓库逐字节一致；改前那份留成同目录 `index.js.bak.20261004a`），容器内 `node --check` 通过，重启约 23 秒后根路径 200、`publicList` 仍 `allowSignUp:false`、无插件加载错误；`pm:listEnabled` 下发的 URL 变成 `?hash=cdbdcdeb`，且该 URL 取回的内容就是新产物 —— 缓存必然被击穿。

### `dbg` 一上线就抓到了两个根因（21:46–21:52）

| 观测 | 结论 |
|---|---|
| `getAuthUrl?dbg=jsapi%7CJSAPI+%3F%3F%3F%3F%3F%3F+window.dd`（`?` 是被过滤的非 ASCII，原文是「JSAPI 已加载但没有 window.dd」） | CDN 脚本 `onload` 成功，但 `window.dd` 不存在 |
| SPA 里 `grep window.define=` → `p__index.9a5f5b1a.async.js` 的 `initRequireJs()`：`window.define = this.requirejs.define` | **根因 1**：`dingtalk.open.js` 是 UMD，检测顺序是 `module/exports` → `define.amd` → `exports` → `root.dd`。页面里存在 AMD 全局，于是它走 `define([], factory)`，永远不会挂 `window.dd`。自己注 `<script>` 时匿名 define 也配不上任何 requirejs 请求，等于静默丢弃 → 改为优先 `window.requirejs([JSAPI_SRC], cb, errcb)` 取模块导出 |
| `system_error_2026-10-04.log`：`community-ding-talk/redirectAuth {"errcode":40078,"errmsg":"nonexistent temp auth code"}`，访问日志里回调 URL 是 `…redirectAuth?…&code=11f53c03…&authCode=11f53c03…&state=…` | **根因 2，且是我这次改出来的回归**：钉钉统一授权页的回调**同时**带 `code` 与 `authCode`，且取值相同（那是 OAuth 授权码）。`#resolveDingUser()` 里 `if (authCode)` 优先，导致扫码时拿 OAuth 码去调免登的 `topapi/v2/user/getuserinfo` → 40078。用户 21:5x 反馈「连 PC 网页的扫码登录都不能工作了」即此。**15:31 已验证可用的扫码路径被我弄坏了。** |

修复：`if (authCode)` → `if (authCode && !code)`（免登动作 `freeLogin` 只带 `authCode`，仍走免登分支；扫码回调一定带 `code`，回到 15:31 那条已验证的路径）。

**21:52 上线**：`dist/client/index.js` → `92809b02644c77ba5a4016030b6c8f31e5887c4681c992933f6137bfe0cab678`，`dist/server/auth/DingTalkAuth.js` → `8e7bbe1f0f5baf61630606d8346a33919e30a1f8b82126b5aef25c274e7d91dd`；改前分别留为同目录 `index.js.bak.20261004b`、`DingTalkAuth.js.bak.20261004b`；两文件 `node --check` 通过，重启后 200、`publicList` 正常、无插件加载错误，下发 URL 变为 `?hash=051e9460` 且取回内容 sha256 与仓库一致（提交 `71de2a9`）。

验证（21:57–21:58 访问日志）：`getAuthUrl?dbg=ua|…`（非钉钉浏览器，正确回退）→ `redirectAuth?…&code=T&authCode=T&state=S` **status=302** → 21:58:00 起 `themeConfig:list`/`collections:listMeta`/`t_device_list:list`/`/ws` 全部 200，即已认证进入 `/admin`。**扫码登录恢复。**

教训：给一个已有登录方式加第二条路径时，**任何「参数同时出现在两条路径上」的优先级判断都必须在真机回归旧路径**，不能只在服务端造请求测新路径 —— 这次 `code`/`authCode` 同名同值只有真实回调才会暴露。

### 第三次迭代（22:05）：`app.auth` 是 undefined，扫码回跳会崩在错误边界上

用户反馈「先出现 App error：`Cannot read properties of undefined (reading 'setAuthenticator')`，点击重试进入」——即 21:57/21:58 那两次的 302 之后，页面先白屏报错、要再点一次才进去。

| 观测 | 结论 |
|---|---|
| 全 SPA 产物 `grep -o "[A-Za-z_$.]*\.auth\.set[A-Za-z]*"`（`node_modules/@nocobase/plugin-*/dist/client`） | 命中形如 `t.apiClient.auth.setToken` / `t.app.apiClient.auth.setToken`，**没有一处** `app.auth.*` |
| `plugin-auth/dist/client/249.58d8f01251c04f59.js` 的 `AuthProvider` | 它本来就做 `useEffect`：`new URLSearchParams(location.search)` → `token` 存在则 `apiClient.auth.setToken(token)` + `setAuthenticator(authenticator)` + 抹参数 `navigate(replace)` |

两处结论：

1. **本补丁第 3 节的前提有误**。「2.0.61 里没有任何从 URL 取 token 的代码」这个 grep 只扫了 `@nocobase/app/dist/client`，漏了 `plugin-auth` 的懒加载分块 `249.*.js`。所以「重试就能进」正是 `AuthProvider` 接手了 URL 上的 token。
2. **崩溃点是 `app.auth`**。2.0.61 的 `Application` 上认证实例挂在 **`app.apiClient.auth`**，`app.auth` 为 undefined；而 `pickTokenFromUrl()` 跑在 `load()`（启动路径）里，抛出后整个 SPA 落进错误边界。

改法（`dist/client/index.js`）：

| 改动 | 目的 |
|---|---|
| 新增 `authOf(app)`：依次尝试 `app.apiClient.auth` → `app.client.auth` → `app.auth`，并要求同时有 `setToken`/`setAuthenticator` | 不再猜属性名；取不到就返回 null 而不是抛 |
| `pickTokenFromUrl()` 拿不到 auth 就 `return false`（且**先不删** `nocobase-dingtalk-pending`） | 让位给 `AuthProvider`，绝不因诊断/兜底代码把应用带崩 |
| `load()` 里 `pickTokenFromUrl` 整段 `try/catch` + `console.error` | 启动路径任何异常都不应变成白屏 |
| `freeLogin` 成功后写 token 也走 `authOf(app)`，取不到报 `stage=auth` 而不是崩 | 免登路径同一问题 |

**22:05 上线**：`dist/client/index.js` → `b3047dcbba5629289380af4bac6bd86e1b772dad03c664554b6d683b460502a3`（14691 字节），改前留为同目录 `index.js.bak.20261004c`（即 `92809b02…`）；容器内 `vm.Script` 语法检查通过，`docker restart` 后 `pm:listEnabled` 下发 URL 变为 `?hash=8960b0c8`，该 URL 取回内容 sha256 与仓库逐字节一致；`docker logs --since 3m` 与 `system.log` 无 error/fatal。

仍未闭环的部分：`pickTokenFromUrl` 现在只是 `AuthProvider` 的**重复实现**（它连 pending 键都不需要）。等免登在钉钉内验证通过，应考虑直接删掉它，只保留 `freeLogin` 那条路径。

教训：

- 「grep 全 SPA 产物」必须把**所有** `plugin-*/dist/client`（含数字分块）一起扫，只扫主包会得出相反的结论。
- 启动路径（`load()`）里的任何自加逻辑都要假定外部 API 可能不存在；一个未加保护的属性访问会把整站变白屏，比原来的功能缺失严重得多。

### 第四次迭代（22:18）：钉钉容器里没有 `requirejs`，只有 `define` —— 改用自定义 define 接管 UMD

22:15（PC 钉钉，UA 含 `DingTalk(9.0.1-macOS…) nw DTWKWebView`）与 22:16（iOS 钉钉，`AliApp(DingTalk/9.0.4)`）两次点击，`dbg` 都是 `jsapi|JSAPI 已加载但没有 window.dd`。
这条信息来自 21:52 那版的普通 `<script>` 注入分支，而该分支**只在 `typeof window.requirejs !== "function"` 时才会走到** —— 也就是说上一版「改走 requirejs」的假设在钉钉容器里不成立：容器提供的是 `window.define`（带 `.amd`），不是 `window.requirejs`。UMD 因此仍然走 `define([],factory)`，既不挂 `window.dd`，也没有别的加载器来解析这个匿名 define，两头落空。

改法（`dist/client/index.js`）：

| 改动 | 目的 |
|---|---|
| 新增 `viaShim()`：短暂把 `window.define` 换成自己的实现（同时 `delete window.requirejs/require` 逼 UMD 命中 AMD 分支），接住 `define(factory)` / `define(["exports"],factory)` 两种形态，取到导出后**立刻恢复原全局** | 不依赖容器有没有 requirejs，也不改变页面长期的全局状态 |
| `shim` 只接住「匿名 define / 仅 `exports` 依赖」的调用，其它依赖名原样转回容器自己的 `define` | 避免误接管页面里其它 AMD 模块 |
| 加载顺序：已有 `window.dd` → 直接用；有 `requirejs` → 走 requirejs（失败再兜 shim）；否则直接 shim；shim 再失败才退回普通注 script | 三条路都试，任一成功即免登 |
| 新增 `envSnap()`，把 `dd/define/define.amd/requirejs/require` 的类型拼进每条 JSAPI 失败信息 | 下次 `dbg=` 直接看得出容器里到底有什么，不用再猜 |
| `loadJsApi()` 外层超时 8s → 15s（要大于 shim 内部 12s） | 否则 shim 还没执行完就被外层判超时，白丢一次机会 |

**22:18 上线**：`dist/client/index.js` → `a7350f383c265eae50b7eaa2bb49544bcc08fdd7591cb025d1328d3c96e908ba`（18332 字节），改前留为同目录 `index.js.bak.20261004d`（`b3047dcb…`）；`vm.Script` 通过，重启后下发 URL `?hash=c368230d` 且取回内容与仓库逐字节一致。

**免登链路由此打通（22:20–22:21 访问日志）**：

| 时间 | 事实 |
|---|---|
| 22:20:51 / 22:21:06 | 浏览器**首次**发起 `POST …:getFreeLoginConfig`（200）—— 说明已过 UA 判定，进入免登流程 |
| 同上 | 紧跟 `getAuthUrl?dbg=corpId\|拿不到企业 CorpId…?corpId=$CORPID$…` —— 这一步是**入口 URL 决定**的：从 `/signin?redirect=/admin` 进来时 URL 里没有容器注入的 CorpId，sessionStorage 也是空的 |
| 22:21:34 | 改从工作台入口进（`GET /?corpId=ding…`），`captureCorpIdFromUrl()` 抓到注入值 |
| 22:21:36 | `POST …:freeLogin` **200**（JSON，token 不进 URL、不落访问日志） |
| 22:21:36 之后 | `GET /signin?redirect=/admin` → **`GET /api/auth:check` 200**（此前 22:21:34 同一次会话是 401）→ 服务端已签发并被接受，免登身份链完整跑通 |

### 第五次迭代（22:26）：已登录却停在登录页 —— `freeLogin` 后不能只 reload

`freeLogin` 拿到 token、`auth:check` 已经 200，但客户端成功分支写的是 `window.location.reload()`，而当前文档 URL 就是 `/signin?redirect=/admin`，于是重载后仍然停在登录页 —— **用户看到的「钉钉内还是不行」其实是这一步，不是免登失败**。

改法：新增 `goAfterAuth()` —— 若当前 pathname 是 `/signin` 就 `location.replace(redirectTarget())`，否则维持 reload；`redirectTarget()` 取 URL 上的 `redirect`，**只接受站内绝对路径**（`/^\/[^/]/`，同时挡掉 `//host` 这种协议相对形式），否则回落 `/admin`。扫码回跳的 `pickTokenFromUrl` 也改用 `goAfterAuth()`。

**22:26 上线**：`dist/client/index.js` → `bbf35e6546dace0b82f96b3b06d81701d23faf8d9533ad92de07d0664ee62b0b`，改前留为同目录 `index.js.bak.20261004e`（`a7350f38…`）；`vm.Script` 通过，下发 URL `?hash=ab493001`，取回内容与仓库逐字节一致。

**还剩的一件事不是代码问题**：CorpId 目前完全依赖「从工作台入口 + 首页地址带 `$CORPID$`」。建议同时在后台认证器配置的「企业 CorpId」一格里填上值（存 `options.internal.corpId`，jsonb，无 schema 变更），这样任何入口都能免登；否则从 `/signin` 直接进来时仍会因 `stage=corpId` 回退扫码。


## 部署方式

这个插件不在 Docker 镜像内，而是宿主绑定挂载目录，容器重建不会更新它；但 **NocoBase 后台升级/重装插件会静默覆盖本目录内容**。

服务器路径：

| | 路径 |
|---|---|
| 宿主 | `/media/aocheng/Data/nocobase/plugins/nocobase-plugin-ding-talk` |
| 容器内 | `/app/nocobase/storage/plugins/nocobase-plugin-ding-talk`（`node_modules` 下同名项是它的符号链接） |

### 按「可回退 + 只动这一个目录」来部署

```sh
TS=$(date +%Y%m%dT%H%M%S)
P=nocobase-plugin-ding-talk
D=/media/aocheng/Data/nocobase/plugins/$P
C=/app/nocobase/storage/plugins/$P          # 容器内看同一个目录

# 1. 现状指纹（只读）。备份必须放在插件目录之外——NocoBase 会扫描 plugins 目录，
#    放进去了会被当成另一个插件。
ssh erp@192.168.3.63 "docker exec nocobase_app_1 sh -lc 'cd $C && find . -type f -print0 | xargs -0 sha256sum | sort -k2'" \
  | sed -E 's/^([0-9a-f]{64}) [* ]+/\1  /' > /tmp/server_pre.txt

# 2. 回退副本
ssh erp@192.168.3.63 "mkdir -p ~/nocobase-plugin-backups && cp -a $D ~/nocobase-plugin-backups/$P.$TS"

# 3. 上传（只覆盖 dist + package.json，不删任何东西）
tar -C . -cf - dist package.json | ssh erp@192.168.3.63 "tar -C $D -xf -"

# 4. 再指纹，比对——应当只有本次改的文件不同，条数不变
ssh erp@192.168.3.63 "docker exec nocobase_app_1 sh -lc 'cd $C && find . -type f -print0 | xargs -0 sha256sum | sort -k2'" \
  | sed -E 's/^([0-9a-f]{64}) [* ]+/\1  /' > /tmp/server_post.txt
diff /tmp/server_pre.txt /tmp/server_post.txt

# 5. 语法检查 + 重启（服务端代码在启动时 require，改完必须重启容器）
ssh erp@192.168.3.63 "for f in server/auth/DingTalkAuth.js server/actions/dingTalkActions.js server/openapi/dingTalkApi.js client/index.js; do docker exec nocobase_app_1 node --check $C/dist/\$f || exit 1; done && docker restart nocobase_app_1"
```

回退（同一台机器，不用本地文件）：

```sh
ssh erp@192.168.3.63 "rm -rf $D && cp -a ~/nocobase-plugin-backups/$P.$TS $D && docker restart nocobase_app_1"
```

### 只改客户端时的最小流程（21:40 那次就是这么做的）

```sh
D=/media/aocheng/Data/nocobase/plugins/nocobase-plugin-ding-talk/dist/client
# 1. 备份 + 现状指纹
ssh erp@192.168.3.63 "cp -a $D/index.js $D/index.js.bak.<标记> && sha256sum $D/index.js"
# 2. 原子替换（tmp + mv；mv 不改内容，mtime 变成 now，这正是下面 hash 会变的来源）
cat dist/client/index.js | ssh erp@192.168.3.63 "cat > $D/index.js.new && mv $D/index.js.new $D/index.js && sha256sum $D/index.js && stat -c '%s %y' $D/index.js"
# 3. 容器内语法检查，然后重启
ssh erp@192.168.3.63 "docker exec nocobase_app_1 node --check /app/nocobase/storage/plugins/nocobase-plugin-ding-talk/dist/client/index.js && docker restart nocobase_app_1"
# 4. 等就绪，确认下发的 URL 变了、且该 URL 取回的就是新内容
ssh erp@192.168.3.63 'for i in $(seq 1 40); do [ "$(curl -s -o /dev/null -w %{http_code} --max-time 3 http://127.0.0.1:13000/)" = 200 ] && break; sleep 5; done
H=$(curl -s http://127.0.0.1:13000/api/pm:listEnabled | grep -o "/static/plugins/nocobase-plugin-ding-talk/dist/client/index.js?hash=[0-9a-f]*")
echo "$H"; curl -s "http://127.0.0.1:13000$H" | sha256sum'
```

第 4 步是**必须**的：`?hash=` 由 `dist/client/index.js` 的 mtime 算出并缓存在进程内存里，
不重启就还是旧 hash，配合 `/static/plugins/` 的 `expires 365d`，浏览器会一直用缓存里的旧代码。
21:40 实测：重启后 URL 从 `?hash=027627ac` 变成 `?hash=cdbdcdeb`，该 URL 取回的 sha256 与本地文件一致 ——
所以**不需要让用户清缓存或强制刷新**（`pm:listEnabled` 自身是 `no-store`，每次刷新都会拿到新 URL）。

## 重要限制

npm 发布包里**只有 `dist/` 和 `.d.ts`，没有 TypeScript 源码**，所以本仓库当前是 dist-only 维护：
改的是编译产物，无法 `build`，且与上游源码仓库的 diff 不可读。

要继续做功能改动（而不是一行补丁），应先从上游把源码纳进来：
`https://github.com/ruanjf/nocobase-plugins` → `packages/plugins/nocobase-plugin-ding-talk`。

由于没有构建步骤，`dist/client/index.js` 已**由压缩产物改写为可维护的明文版本**（保留原 UMD 头、外部依赖顺序和导出名不变）。
以后如果从上游拿到源码，应该改源码后重新构建，而不是继续手改这个文件。

`package.json` 的 `version` 保持 `0.2.0` 未动（避免让后台的版本比对/升级提示产生混乱），本地改动只以本仓库提交记录为准。

`package.json` 的 `peerDependencies` 声明 `@nocobase/*: 1.x`，实际运行在 NocoBase 2.0.61 上，
该组合未经上游验证。
