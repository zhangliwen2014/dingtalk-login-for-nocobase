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

配置：认证器 `options.internal.corpId`（管理后台认证器配置表单已加「企业 CorpId」输入框，存 jsonb，无 schema 变更）。

**部署前必须由使用方在钉钉开放平台确认的前置条件**（缺一不可，否则免登必然回退扫码）：

1. 应用类型＝企业内部应用（生产实测 appKey 前缀 `dingoyk`、长度 20，符合）；
2. 「开发管理」里的应用首页地址/PC 首页地址与可信域名包含 `device-mgmt.aiaocheng.com`；
3. 权限管理里开通 通讯录个人信息读权限／成员信息（`qyapi_base`，`getuserinfo` 必需）；若 `userCheckType=mobile`，还需「个人手机号信息」权限，否则新代码会明确报「钉钉未返回手机号」而不是拿空条件去匹配用户；
4. 应用已发布并加到工作台，用户从**工作台入口**打开（聊天里点开链接可能不被当作微应用容器）。

## 3. `dist/client/index.js` — 回跳的 token 之前根本没人读

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

## 4. 顺手修掉的两个上游 bug

- `DingTalkAuth.js` 构造函数里 `emailDomain.split("s*,s*")` 少了转义（应为 `/\s*,\s*/`）。生产值是 `aiaocheng.com,163.com`，错的分隔符使它变成**一个**含逗号的域名，邮箱域名白名单形同虚设。当前 `userCheckType=mobile`，该分支未被触发，但一旦改用邮箱匹配就会暴露。
- 邮箱域名校验拿 `userDetail.email` / `userDetail.org_email` 判断，却用 `user.email` / `user.orgEmail` 作为查询条件，两者不一致；统一为后者（免登路径没有 `userDetail` 的 `email` 字段，本来也必须统一）。
- `userCheckType=mobile` 时补了空值保护：钉钉没返回手机号直接 400，而不是 `findOne({filter:{phone:undefined}})`。

## 验证状态

- `node --check`（容器内 Node v22.22.3，走 stdin，不落服务器磁盘）：4 个改动文件全部通过。
- **未在浏览器/钉钉内实测**。免登需要：部署本补丁 + 后台填 `corpId` + 上面 4 项钉钉配置到位，然后由业务账号在钉钉内点击验证。
- 判定成功的依据：`select * from "usersAuthenticators"` 出现带 `uuid` 的行；且 nginx 日志里 `getFreeLoginConfig`/`freeLogin` 有命中、`redirectAuth` 不再被调用。

## 部署方式

这个插件不在 Docker 镜像内，而是宿主绑定挂载目录，容器重建不会更新它；但 **NocoBase 后台升级/重装插件会静默覆盖本目录内容**。

服务器路径：

| | 路径 |
|---|---|
| 宿主 | `/media/aocheng/Data/nocobase/plugins/nocobase-plugin-ding-talk` |
| 容器内 | `/app/nocobase/storage/plugins/nocobase-plugin-ding-talk`（`node_modules` 下同名项是它的符号链接） |

部署（在本仓库根目录）：

```sh
P=nocobase-plugin-ding-talk
D=/media/aocheng/Data/nocobase/plugins/$P
tar -C . -cf - dist package.json | ssh erp@192.168.3.63 "tar -C $D -xf -"
ssh erp@192.168.3.63 "for f in server/auth/DingTalkAuth.js server/actions/dingTalkActions.js server/openapi/dingTalkApi.js client/index.js; do docker exec nocobase_app_1 node --check /app/nocobase/storage/plugins/$P/dist/\$f || exit 1; done && docker restart nocobase_app_1"
```

服务端代码在启动时 require，改完必须重启容器；客户端产物由浏览器加载，重启后需强制刷新（Ctrl+F5）才会拿到新的 `index.js`。

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
