# Audiveris：可选构建时安装 / Optional build-time installation

## 状态 / Status

这是待构建验证的候选安装路径。安装器的离线单元测试已执行；真实安装包下载、容器构建、非 root 启动和实际识谱尚未在本轮环境运行。不要将这些单元测试写成“Docker 或 OMR 已通过”。

This installation path is a candidate awaiting a real container build. Offline installer tests have run; downloading the actual package, building the image, checking its non-root launcher, and recognizing a real score still require validation.

## 为什么不是只放一个 JAR / Why not just one JAR?

当前锁定官方 Audiveris **5.11.0** 的 Linux x86_64 完整安装包；该包包含匹配的 Java 运行环境与依赖。旧的 `backend/bin/audiveris.jar` 方式仅保留为已有用户的兼容入口，不要求新用户从现代安装包里抽取单独 JAR，也不假设系统 Java 17 能运行当前版本。

This candidate pins the official Audiveris **5.11.0** Linux x86_64 installer with its bundled Java runtime and dependencies. The existing JAR mount remains a legacy option; do not extract only the main JAR from a modern distribution or assume Java 17 supports it.

官方来源 / Official source:
https://github.com/Audiveris/audiveris/releases/tag/5.11.0

锁定包 / Pinned asset:
`Audiveris-5.11.0-ubuntu22.04-x86_64.deb`

SHA-256:
`ae714594f40e54b1a4951fc3f914f08ae38fe5d07b7f2283b1a904fdb6e0a318`

哈希来自该官方发布的资产元数据。版本与哈希一起更新，不能自动追踪 latest。此 .deb 与 Python Debian 基础镜像的真实安装兼容性仍须通过构建验证；选择该资产不等于已经验证。

The hash comes from the official release asset metadata. Update the version and checksum together; do not follow a floating latest release. Compatibility between this .deb and the Python Debian base image must still be proven by the actual build.

## 配置 / Configuration

默认 `INSTALL_AUDIVERIS=0`，保留轻量 MIDI/MusicXML 部署。需要识别五线谱时，在现有 `.env` 中修改或加入：

The default is `INSTALL_AUDIVERIS=0`, retaining a lightweight MIDI/MusicXML deployment. For staff-notation OMR, set in the existing `.env`:

```env
INSTALL_AUDIVERIS=1
```

修改构建参数需要重建后端，而不是仅重启。已有 `.env`、端口和数据不需要清空。构建先完成，再替换正在运行的后端；不必先 `docker compose down`。

A changed build argument requires rebuilding the backend, not just restarting. Keep existing port configuration and data; build before replacing the running service. There is no need to run `docker compose down` first.

```sh
docker compose build backend
docker compose run --rm --no-deps backend audiveris -batch -help
docker compose up -d --no-deps backend
```

上述命令是候选验收步骤，不是已通过的执行记录。确认帮助命令成功后，还需用一页清晰的、允许测试的五线谱验证 MusicXML 输出，再核对音高、时值、双手声部和反复。

These are validation commands, not completed results. After the launcher check, verify actual MusicXML output from a clear authorized staff-notation page and inspect pitches, durations, voices, and repeats.

## 行为与限制 / Behavior and limits

- 只在构建阶段从官方地址下载，校验 SHA-256 后安装。失败会使构建失败，不会假装 PDF 功能可用。运行时不联网安装软件。
- 目前只为 `linux/amd64` 配置了此安装包；`arm64` 明确拒绝，不自动启用仿真。默认关闭时其他架构仍沿用原有部署方式。
- 使用完整安装包的 `/opt/audiveris/bin/Audiveris`，并创建小写 PATH 入口供现有后端检测。`/app/bin` 的空宿主目录不会遮住它。已有 legacy JAR 仍按原检测顺序优先。
- Windows 宿主机安装 Audiveris 不等于 Docker 后端已安装。
- Audiveris 面向常规五线谱识别。纯简谱 PDF 不因此变成可可靠自动识别的乐谱。混合谱、倾斜照片、阴影和教材附加标记需人工核对。
- 保留完整安装包中的 Audiveris/第三方许可；Audiveris 的 AGPL-3.0 不因放在 MIT 项目旁边而改变。

- Downloads occur only during image build, from the pinned official source, with a mandatory checksum. Failure stops the build rather than pretending OMR is available.
- This asset is for `linux/amd64`; `arm64` is explicitly rejected without silently enabling emulation. The default-off path preserves other deployment architectures.
- The full launcher is placed under `/opt` with a lower-case PATH alias. The existing host bind mount under `/app/bin` does not mask it. Existing legacy JAR detection still takes precedence.
- Installing Audiveris on the Windows host does not install it inside Docker.
- Audiveris targets conventional staff notation. Numbered-notation-only PDFs are not a promised input format; mixed or photographed sheets need manual review.
- Preserve the Audiveris and third-party license files distributed with the package. Its AGPL-3.0 license remains separate from the surrounding MIT project.

CLI reference: https://audiveris.github.io/audiveris/_pages/guides/advanced/cli/
Support boundaries: https://audiveris.github.io/audiveris/_pages/handbook/
