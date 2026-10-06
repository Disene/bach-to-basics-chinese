<p align="center">
  <a href="https://github.com/Disene/bach-to-basics-chinese">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark-mode.png">
      <img alt="Bach to Basics" src="docs/logo.png" width="340">
    </picture>
  </a>
</p>

<p align="center">
  <strong>简体中文</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-7c3aed"></a>
  <a href="https://github.com/Disene/bach-to-basics-chinese/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Disene/bach-to-basics-chinese"></a>
  <a href="https://github.com/gigliof/bach-to-basics"><img alt="Upstream" src="https://img.shields.io/badge/upstream-gigliof%2Fbach--to--basics-64748b"></a>
</p>

# Bach to Basics 中文版

这是 [gigliof/bach-to-basics](https://github.com/gigliof/bach-to-basics) 的简体中文 Fork，保留 MIT 许可和上游作者署名。

本 Fork 以**简体中文界面**为默认体验，在尽量保持上游结构和可同步性的前提下，补齐中文本地化、Docker 可复现部署，以及实际钢琴练习中发现的 MIDI、等待模式、指法、五线谱和延音等功能链路问题。

> 需要英文界面时，建议直接使用上游项目。当前 Fork 暂不引入运行时多语言切换，以减少维护成本和后续同步冲突。

## 主要功能

- **MIDI / MusicXML / PDF / 音频导入**
- **瀑布流音符**
- **88 键交互式钢琴**
- **五线谱显示与跟随**
- **A/B 循环**
- **等待模式**
- **速度训练**
- **节拍器**
- **移调**
- **左右手独立音量**
- **自动指法生成**
- **实体 MIDI 键盘输入**
- **CC64 延音踏板**
- **5 种钢琴/键盘音色**
- **深色 / 浅色模式**
- **MIDI / MusicXML / PDF / MP3 导出**

## 本 Fork 的主要改进

- **简体中文本地化**：主界面、设置、导入/导出、MIDI、错误提示、PWA 元信息及常见后端错误。
- **硬件 MIDI 修复**：实体 MIDI 键盘可以直接发声，并参与等待模式判定。
- **等待模式修复**：按音符真实 onset 暂停，支持和弦、移调和左右手等待。
- **自动指法修复**：修复单轨 MIDI 映射、后台 MusicXML 异步竞态、短曲预读缓存等问题。
- **五线谱修复**：补齐 alphaTab + Vite 生产构建集成、多轨钢琴谱渲染，以及部署后旧 chunk 自动恢复。
- **CC64 延音**：支持实体踏板实时状态与真实延音；支持 MIDI 文件自带 CC64 的声音与瀑布流提示。
- **Docker / 开发环境**：固定 Node 22 / pnpm 9；支持通过 `FRONTEND_PORT` 自定义前端端口。
- **设置体验**：优化音色选择布局、延音状态说明和用户可见错误提示。

## 已验证状态

| 功能 | 状态 |
| --- | --- |
| MIDI 导入 / 播放 / 瀑布流 | ✅ 已实测 |
| 实体 MIDI 键盘发声 | ✅ 已实测 |
| 等待模式 | ✅ 已实测 |
| 自动指法生成 | ✅ 已实测 |
| 五线谱渲染 | ✅ 已实测 |
| 实体 CC64 踏板状态与实时延音 | ✅ 已实测 |
| MIDI 文件自带 CC64 播放 / 标记 | ✅ 已实测 |
| 音色切换与设置布局 | ✅ 已实测 |
| Docker 部署 | ✅ 已实测 |

## 快速开始

### Docker（推荐）

需要 Docker Desktop 或 Docker Engine + Compose。

```bash
git clone https://github.com/Disene/bach-to-basics-chinese.git
cd bach-to-basics-chinese
cp .env.example .env
docker compose up -d --build
```

默认访问：

```text
http://localhost:5173
```

如果 5173 被占用或被 Windows 保留，在 `.env` 中设置：

```env
FRONTEND_PORT=51722
```

然后访问：

```text
http://localhost:51722
```

> 建议固定使用 `localhost` 或 `127.0.0.1` 其中一个，不要交替使用。PWA / Service Worker 会把它们视为两个不同的 origin。

### 原生开发

需要：

- Node.js 22+
- pnpm 9
- Python 3.11 / 3.12
- Java 17+（仅 PDF 导入需要）

```bash
npm i -g pnpm@9
pnpm install
pnpm backend:setup
pnpm dev
```

前端默认运行在 `http://localhost:5173`，后端运行在 `http://localhost:8000`。

## MIDI 与延音踏板

连接 MIDI 键盘后：

1. 点击右上角 MIDI 设备选择器并选择设备。
2. 实体键盘输入会驱动声音、屏幕琴键和等待模式。
3. 支持 **CC64 延音踏板**。
4. 顶部会显示实时“踏板 抬起 / 踩下”状态。
5. 如果导入的 MIDI 文件包含 CC64，设置中会显示检测到的踏板段数，并可显示乐曲踏板标记和延音残影。

> Web MIDI 在生产环境需要 HTTPS。iOS Safari 当前不支持 Web MIDI。

## 指法

支持：

- 在钢琴键盘显示 1–5 指法；
- 在瀑布流音符上显示指法；
- 使用 [pianoplayer](https://github.com/marcomusy/pianoplayer) 自动生成指法；
- 保留 MusicXML 中已有的编辑版指法，并将其作为重新生成时的锚点。

## 可选后端能力

### PDF 导入：Audiveris

PDF → MusicXML 需要 [Audiveris](https://github.com/Audiveris/audiveris)。

将 `audiveris.jar` 放到：

```text
backend/bin/audiveris.jar
```

### PDF 导出：LilyPond

PDF 导出需要 [LilyPond](https://lilypond.org/)。

未安装时，MIDI 与 MusicXML 导出仍可正常使用。

### 音频转 MIDI：Basic Pitch

音频转 MIDI 使用 [Basic Pitch](https://github.com/spotify/basic-pitch)。

按项目文档安装额外依赖后即可使用。

## 公网部署

如果要公开部署：

- 使用 HTTPS；
- 设置准确的 `ALLOWED_ORIGINS`；
- 保持限流开启；
- 建议在应用外层增加访问控制 / SSO / 受控反向代理。

后端支持 `BACKEND_API_KEY` 与 `REQUIRE_AUTH=1`，但内置浏览器 UI 不会自行注入 `X-API-Key`，因此不要只设置后端 Key 而不配置对应代理层。

## 与上游同步

上游项目：

https://github.com/gigliof/bach-to-basics

本 Fork 会尽量保持改动可拆分，以便同步上游更新，也方便将通用修复回馈到原项目。

## 贡献

欢迎提交 Issue / PR。对于适合所有用户的通用 Bug 修复和功能，也优先考虑贡献到上游。

开发前建议阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## License

MIT License。详见 [LICENSE](LICENSE)。

原项目作者与上游版权信息保持不变。
