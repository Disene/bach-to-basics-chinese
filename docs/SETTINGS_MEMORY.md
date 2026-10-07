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

## 左右手：共享状态，但区分用途

所有布局（钢琴、瀑布流、乐谱、全部）使用同一个 store / SyncEngine；切换布局不应改变分手设置。现有控件不是几套相互竞争的同义开关：

| 控件 | 作用 | 不应自动改变 |
| --- | --- | --- |
| 工具栏“左 / 右” | 选择参与乐曲播放和等待判定的已识别声部（activeHands） | 已设置的音量数值、等待手部偏好 |
| 设置“等待模式手部” | 等待已启用声部中哪只手的输入（waitForHand） | 自动关闭另一手伴奏、声部音量 |
| 设置“左右手音量” | 控制乐曲示范声音；0% 为真正静音（handVolume） | 等待目标、实体键盘输入音量 |
| 设置“区分左右手” | 控制左右手视觉配色（showHandColors） | 发声和等待条件 |

例如“自己练左手、软件伴奏右手”：工具栏两手都启用，开启等待模式，等待手部选左手。左手目标由演奏者弹，右手示范由软件播放。调低或关闭右手示范音量时，不会把等待范围自动改成右手。某手若已在工具栏关闭，它也不参与等待；选择一个已关闭的等待手部可能没有可等待的目标。

暂停/播放中改变声部或等待手部，尚未开始的音符在实际起点读取最新设置；已经等待的和弦重新计算剩余目标，同时保留本组已弹对的音。不通过跳过当前小节或重新定位来绕过旧目标。手动暂停时改设置不自动恢复播放。

关闭某声部或将其音量调到0%会释放该声部已经响起的乐曲声音（包含文件CC64延音尾音），不会调用全局停音来误停实体键盘，也不改变硬件踏板状态。再次启用声部会保留原音量值，不强制重置100%；非零音量变化由后续音符采用。

这些是播放/练习控制，不是删除或隐藏原谱的命令。“全部”视图仍保留两手的谱面及瀑布流参考，不能仅凭两行五线谱仍然存在判断开关无效。此候选没有增加第二套左右手开关或跨页独立状态。

分手需要输入数据已经标识left/right。标为unknown的音符沿用既有行为，不在播放器中按高低音擅自猜手；对这类文件不能承诺可靠的单手静音或单手等待。

### Hand controls (English)

Layouts share the same store and engine. Toolbar hand enablement selects score parts participating in playback/wait evaluation. Wait-for-hand selects targets within the enabled parts; per-hand volume affects demonstration audio, not live MIDI or target membership. Hand coloring is visual only. These settings are related, not interchangeable.

Queued onsets use current hand settings. An in-progress waiting chord is recalculated without discarding correct hits or seeking past it. Muting releases only that hand's sounding score voices, including source-pedal tails. Live keys/pedal remain independent. Positive volume changes apply to subsequent notes; re-enabling a hand preserves its volume. The score remains visible as reference. Unknown-hand notes retain prior behavior and cannot be reliably separated without source hand metadata.

Focused engine regression suite (with normal frontend dependencies installed):

```sh
pnpm --filter frontend exec vitest run src/__tests__/SyncEngineWaitMode.test.ts
```
