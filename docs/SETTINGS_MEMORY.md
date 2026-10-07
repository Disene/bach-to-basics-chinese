# 设置记忆 / Settings memory

## 简体中文

设置会自动保存在当前浏览器的当前站点中，不需要“保存”按钮。重新打开应用时，恢复外观、乐谱/瀑布流/钢琴布局、音名和指法显示开关、音符样式、乐曲踏板显示开关、音色、音频偏移、节拍器开关和预备小节。

恢复通过原有设置动作执行：音色、音频偏移、预备小节和节拍器会同步到引擎，不只是恢复界面开关。启动不会自动播放，不会申请新的 MIDI 权限，也不会自动识谱或生成指法。指法只记住显示偏好，不保存曲目中的生成结果；没有指法数据时仍需生成。

本版**不记忆**曲目文件、原谱、播放位置、速度倍率、循环、等待模式、移调、分手选择、左右手音量和速度训练进度。这些与具体曲目/编配有关，保留给后续的每曲练习记忆，而不是错误地作为全局设置套用到下一首曲子。按下的琴键、实时踏板和“已连接”状态也不写入这个记录。上次主动选择的 MIDI 设备继续使用独立的连接偏好，不受本功能覆盖。

现有“恢复默认设置”动作也会更新保存的设置。它不会清除 MIDI 设备偏好，也不删除任何文件。浏览器禁用存储、容量不足、损坏 JSON 或不支持的记录版本都不会阻塞本次使用；无法保存时下次打开可能需要重新设置。

设置不会在 Chrome、QQ 浏览器或其他浏览器之间自动同步。`localhost`、`127.0.0.1`、不同端口各有自己的站点存储。不要将“另一浏览器没有相同设置”当作 MIDI 识别失败。

实现入口：`frontend/src/store/settingsPersistence.ts`。存储键：`b2b-settings-v1`。仅使用明确允许的字段、版本号、类型/范围校验；不序列化整个应用状态。

## English

Global preferences are saved automatically in this browser's site storage. The next visit restores appearance, layout, note/fingering display switches, note styling, source-pedal display switches, instrument, audio offset, metronome and count-in bars.

Restoration uses existing store actions, including engine synchronization. It does not start playback, request MIDI permission, convert a score, or generate fingerings. The fingering display preference does not preserve generated score data.

This version deliberately excludes score files, position, tempo multiplier, loops, wait mode, transposition, hand selection/volumes and speed-trainer progress. Those belong to future per-arrangement practice memory, not global settings. Live keys, pedal state and connection-success flags are never stored here. Existing MIDI-device preferences retain their separate lifecycle and key.

The existing reset action updates saved preferences without clearing device preferences or files. Unavailable storage, quota failures, malformed data and unsupported schema versions do not prevent practice. Different browsers, hosts and ports do not share these preferences automatically.

## Focused verification

```sh
node --experimental-strip-types --test frontend/tests/settingsPersistence.test.mjs
```

The dependency-free tests exercise the persistence module and a simulated store/action adapter. They do not replace the full application's type-check/build, browser audio, or physical MIDI testing.

Candidate acceptance: change layout, note labels and instrument; reload and confirm restoration; confirm playback remains stopped; reset settings and reload again. No backend rebuild or Audiveris reinstall is required for this frontend-only change.
