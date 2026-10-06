# 发布到 GitHub

建议仓库名：`yiri-mahjong`。显示标题继续使用「谐不压怔！一日麻！」。

## 第一次上传

1. 在你的 GitHub 账号下创建名为 `yiri-mahjong` 的 **Public** 空仓库。不要提前生成 README 或许可证。
2. 解压源码 ZIP，在解压后的项目目录运行以下命令。请把 `YOUR_USERNAME` 换成你的 GitHub 用户名。

```sh
git init -b main
git add .
git commit -m "Release playable mahjong portfolio v0.1.0"
git remote add origin https://github.com/YOUR_USERNAME/yiri-mahjong.git
git push -u origin main
```

若使用 GitHub Desktop，可把解压目录添加为本地仓库，提交后选择 Publish repository，取消私有仓库选项。

## 提供游戏 ZIP

仓库中附有 Actions 配置。推送版本标签后会构建、测试并创建带下载附件的预发布版本：

```sh
git tag v0.1.0
git push origin v0.1.0
```

需要允许该仓库运行 GitHub Actions，且仓库策略允许工作流写入内容。首次运行成功后，在 Releases 检查三个附件与说明，再按需要将预发布改为正式发布。

也可手动进入 Releases → Draft a new release，建立 `v0.1.0` 标签，使用 `docs/RELEASE_NOTES.md` 作为说明，上传两个 ZIP 和 SHA256SUMS.txt，再发布。

GitHub 的自动「Source code」下载包只包含源码；玩家应下载名称带 **portable** 的附件。

## 作品页面

- About 简介：`Fin 的四人连线日麻作品，提供浏览器在线版与可下载的局域网版本。`
- Website：`https://yique-mahjong-2026.ghwsocio918.chatgpt.site`
- Topics 可用：`mahjong`、`riichi`、`game`、`typescript`、`react`。
- README 已包含作品封面、玩法、运行方法、技术结构及实现边界。

不要上传本机 `data/`、账号令牌、`.env`、`node_modules` 或 `.git` 文件夹。提供的源码包已排除这些内容，并移除了原站点的项目身份。

## 发布资料

- GitHub Releases：https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
- 创建发版：https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository
- Node.js 下载：https://nodejs.org/en/download
