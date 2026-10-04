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

## 部署方式

这个插件不在 Docker 镜像内，而是宿主绑定挂载目录，容器重建不会更新它；但 **NocoBase 后台升级/重装插件会静默覆盖本目录内容**。

服务器路径：

| | 路径 |
|---|---|
| 宿主 | `/media/aocheng/Data/nocobase/plugins/nocobase-plugin-ding-talk` |
| 容器内 | `/app/nocobase/storage/plugins/nocobase-plugin-ding-talk`（`node_modules` 下同名项是它的符号链接） |

部署（在本仓库根目录）：

```sh
# 服务端代码在启动时 require，改完必须重启容器才生效
tar -C . -cf - dist package.json | ssh erp@192.168.3.63 'tar -C /media/aocheng/Data/nocobase/plugins/nocobase-plugin-ding-talk -xf -'
ssh erp@192.168.3.63 'docker exec nocobase_app_1 node --check /app/nocobase/storage/plugins/nocobase-plugin-ding-talk/dist/server/auth/DingTalkAuth.js && docker restart nocobase_app_1'
```

## 重要限制

npm 发布包里**只有 `dist/` 和 `.d.ts`，没有 TypeScript 源码**，所以本仓库当前是 dist-only 维护：
改的是编译产物，无法 `build`，且与上游源码仓库的 diff 不可读。

要继续做功能改动（而不是一行补丁），应先从上游把源码纳进来：
`https://github.com/ruanjf/nocobase-plugins` → `packages/plugins/nocobase-plugin-ding-talk`。

`package.json` 的 `peerDependencies` 声明 `@nocobase/*: 1.x`，实际运行在 NocoBase 2.0.61 上，
该组合未经上游验证。
