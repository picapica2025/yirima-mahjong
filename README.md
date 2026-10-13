# 谐不压怔！一日麻！

杨振山快来，就等你来玩了！

**Fin 的四人连线日麻作品 · v0.1.1**

输入昵称、建立牌桌、分享房间链接。四位朋友直接开始一场东风战。

![作品封面](public/og.png)

[在线体验](https://yique-mahjong-2026.ghwsocio918.chatgpt.site) · [下载游戏](https://yique-mahjong-2026.ghwsocio918.chatgpt.site/downloads/yiri-mahjong-v0.1.1-portable.zip) · [运行说明](docs/PLAY.md) · [版本说明](docs/RELEASE_NOTES.md)

## 这是怎样的作品

一个以朋友牌桌为中心的浏览器游戏：保留麻将桌的座位、牌河、摸打与鸣牌节奏，用昵称和房间链接完成邀请，不需要账号注册。红色印章、纸色界面与绿色牌桌构成现有视觉风格。

作者：**Fin / [picapica2025](https://github.com/picapica2025)**。采用 AI 辅助开发；现阶段作为个人作品与可玩的规则原型展示。

## 功能与边界

| 已有功能 | 当前范围 |
| --- | --- |
| 四位真人房间、链接邀请 | 没有电脑对手、匹配大厅或中途替补 |
| 东风战，25,000 点开局 | 房主控制开始、续局与原房再开 |
| 摸打、吃碰杠、立直、荣和／自摸 | 核心规则实现，未覆盖完整竞技规则 |
| 部分役种、宝牌／里宝牌、赤宝牌、结算 | 特殊役种、边界计分与特殊流局仍需完善 |
| 服务端掌管手牌与操作校验 | 每个玩家仅能从接口取得自己的暗牌 |
| 下载版独立运行、文件保存牌局 | 一台主机、同一局域网；单进程文件存储 |

无金钱交易。原项目沿革中的「简化港式／电脑对战」描述不对应当前源码；本仓库以四人真人日麻实现为准。

## 玩家：下载后怎么启动

1. 下载 **portable.zip** 并完整解压。
2. 主机安装 [Node.js 24 LTS](https://nodejs.org/en/download)。
3. Windows 双击 `start-windows.bat`；macOS 使用 `start-macos.command`；Linux 运行 `sh start-linux.sh`。
4. 主机在终端显示的局域网地址建房，朋友通过同一网络加入。

运行已构建的下载版不需要 npm、ChatGPT 或 Cloudflare 账号。其他玩家只需要浏览器。它不是直接双击 HTML 的单机游戏，也不是内置运行环境的桌面安装器。详细操作见 [PLAY.md](docs/PLAY.md)。

## 开发者：从源码运行

需要 Node.js 24 LTS。保留并使用随附的 npm 锁文件：

```sh
npm ci
npm run build:portable
npm run start:portable
```

这会在 `release/portable/` 生成已构建版本，并在本机启动。需要局域网连接时：

```sh
npm run start:lan
```

编辑源文件后重新运行 `npm run build:portable`。浏览器界面与在线版共用 `app/page.tsx`，规则引擎共用 `lib/riichi.ts`，不是另写的一套玩法。

## 项目结构

- `app/`：React 界面、样式及在线版 API。
- `lib/riichi.ts`：日麻状态机、规则判断与玩家可见视图。
- `lib/rooms.ts`：在线版 Cloudflare D1 存储。
- `portable/`：下载版入口、Node.js 服务及启动文件。
- `scripts/`：构建、打包及导出脚本。
- `tests/`：源码检查与下载版服务测试。
- `docs/`：运行说明、发版说明与依赖声明。
- `.github/workflows/`：持续验证与版本发布。

在线版沿用 React 19、TypeScript、Vite／Vinext、Cloudflare Workers 与 D1。下载版以 Vite 构建浏览器资源，使用 Node.js 内置 HTTP／文件模块运行房间服务；运行阶段无需额外 npm 依赖，也不需要云数据库。

原在线版的 `npm run dev`、`npm run build` 保留，供该架构继续开发。源码 ZIP 中的站点清单不含原站点 ID；他人部署时需自行配置托管平台。下载版无需配置这份清单。

## 验证与打包

```sh
npm run build:portable
npm run test:portable
npm run release
```

`npm run release` 构建并验证下载版，然后生成两个 ZIP、校验文件及网站下载资源。源码导出只取明确的项目文件，不包含本地房间数据、凭据、Git 历史、开发依赖或托管身份。

测试覆盖振听、旧响应隔离、四人入座、并发写入、权限与暗牌隔离、整局摸打推进、重启恢复及静态文件访问边界。当前尚无实体 Windows／macOS 启动测试或浏览器端到端验证；不把通过这些测试等同于日麻规则已经完整。

## GitHub 发布

完整源码已公开在 [picapica2025/yirima-mahjong](https://github.com/picapica2025/yirima-mahjong)。在线牌桌由 Sites 托管，GitHub Pages 不能独立运行房间 API 和数据库；下载版可在同一局域网独立运行。当前在线地址在中国大陆的可访问性仍需实际线路验证。

见 [PUBLISH_GITHUB.md](docs/PUBLISH_GITHUB.md)。推送与 `package.json` 版本一致的 `v*` 标签后，附带的工作流会构建并创建含游戏包、源码包和校验文件的预发布版本。普通提交只运行构建与测试。

## 权利与依赖

本项目尚未指定开源许可证，当前用于下载体验与作品展示；详见 [RIGHTS.md](docs/RIGHTS.md)。第三方组件许可见 [THIRD_PARTY_NOTICES.txt](docs/THIRD_PARTY_NOTICES.txt)。

English: A four-player browser-based riichi mahjong prototype by Fin. The portable build includes a Node.js room server for local-network play. Four human players are required; no bots are included. Node.js 24 LTS is required on the host computer only.
