# lolping-assistant — 技术规格说明书（spec.md）

> 版本：v0.1（2026-10-14）
> 仓库：https://github.com/sqwece/lolping-assistant
> 上游：https://github.com/darrenprx/lolPing（MIT，个人 fork 练手，不追求合入上游）
> 用途：本文档是需求的唯一事实来源，后续实现、翻看、定位都以它为准。

---

## 1. 项目概述

给 lolPing（英雄联盟信号/表情桌面覆盖层）加一个 **AI 视觉问答小助手**：

- 每个 **ping 信号** 触发一次助手互动（问号→"有疑问吗？"，感叹号→"惊讶吗？"，其余信号各自对应）。
- 每个 **表情** 触发一次助手反馈（点赞→"接受夸奖"，其余表情各自对应）。
- 助手是一个 **可动的 2D 角色**（默认原创助手，可选英雄立绘），pin 时用贴合角色的位移方式（瞬移/跳跃/冲刺/飞）**快速移动到 pin 点**，拉出弹窗，**结合 pin 位置附近的屏幕内容**生成回答，结束后收回并归位（移动不限速）。
- 定位：**个人作品集项目**，不遵守上游「不读取内容」的合入门槛，可自由加入读屏 + 联网 AI。

---

## 2. 需求分析

### 2.1 原始需求（用户口述）

1. 问号 ping → AI 弹窗询问「是否有疑问」，确认后解答；感叹号 ping → 询问「是否惊讶」，确认后回答；其他信号按功能做对应处理，**每个 ping 都有不同处理**。
2. AI 弹窗是动态小助手，可由虚拟角色或 LOL 角色建模扮演。
3. pin 时小助手移动到对应位置并变为弹窗，需迅速，可用跳跃/空间穿梭，依据角色能力；到位后拉出弹窗，按 pin 内容 + 信号指代生成回答；用户明确回答结束后拉回弹窗、移回原位；移动不做速度限制、贴合角色即可。
4. 表情系统变为与小助手交互的模块（点赞 → 接受夸奖反馈，其他表情对应反馈）。
5. pin 范围：鼠标 pin 位置左右延伸一部分（范围适中），范围内内容未覆盖全（如只盖到图表一角）时**自适应扩展直到内容完全覆盖**。

### 2.2 精炼后的需求（经澄清，以本节为准）

| # | 需求 | 结论 |
|---|---|---|
| R1 | 每个 ping 触发不同的助手交互 | 是（映射见 §6.1） |
| R2 | 每个表情触发不同的助手反馈 | 是（映射见 §6.2） |
| R3 | 助手形态 | 2D 立绘/头像 + 位移动画（非 3D） |
| R4 | 助手角色 | 默认「原创通用助手」；英雄立绘作为可选（个人软件可自用 Riot 立绘，但默认不侵权） |
| R5 | 位移方式 | 贴合角色，枚举 teleport/jump/dash/fly，不限速 |
| R6 | 助手弹窗交互 | 先按钮确认（是/否），可展开成多轮追问（聊天框） |
| R7 | 读屏 | 需要：截屏 pin 附近区域 + 视觉模型 |
| R8 | 范围判定 | **固定默认范围 + 手动拖拽调整**（不做自动边缘检测；原「自适应扩展」改为手动框选） |
| R9 | 原 ping 动画 | **保留**，助手叠加（不取代 ping） |
| R10 | 台词生成 | 走 LLM 生成（A 类读屏分析、B 类台词都由 LLM 出） |
| R11 | AI 角色可关 | 用户自选是否启用角色；**关闭时直接生成弹窗**（无精灵位移动画） |

---

## 3. 已确认决策（共 10 项）

| # | 决策点 | 结论 |
|---|---|---|
| D1 | 定位 | 个人 fork 练手（作品集），可突破上游「不读取」定位 |
| D2 | AI 后端 | DeepSeek，**用户自填 key**（不硬编码） |
| D3 | 视觉模型 | `deepseek-flash`（V4.1 Flash，支持图片） |
| D4 | 文字模型 | `deepseek-v4-pro`（纯文字；也可统一 flash） |
| D5 | 读屏 | 截屏 + 视觉模型 |
| D6 | 角色形态 | 2D 立绘 + 位移动画 |
| D7 | 交互 | 先确认（是/否），可展开多轮追问 |
| D8 | 范围 | 固定范围（默认 800×800px）+ 手动拖拽调整 |
| D9 | 开发顺序 | 先假触发器跑通 AI/截屏/助手，再接真实 ping |
| D10 | 仓库 | 新建独立仓库 `sqwece/lolping-assistant`（非 GitHub fork 关系） |

---

## 4. 环境验证结果（2026-10-14 实测）

| 项 | 结果 |
|---|---|
| Node | v24.15.0 ✓（≥22.12） |
| npm / npx | 11.12.1 ✓ |
| git | 2.55.0 ✓ |
| Python（备用） | 3.11.14（pytorch env） |
| `deepseek-v4-pro` 文字 | ✓ 返回正常 |
| `deepseek-flash` 视觉识图 | ✓ 正确识别「白色背景红色正方形 + 数字 42」 |

**DeepSeek 调用要点**（实测 + 官方文档）：
- base_url：`https://api.deepseek.com`，OpenAI 兼容 Chat Completions。
- 鉴权：`Authorization: Bearer <key>`；key 来自用户 `.env` 的 `OPENAI_API_KEY`（DeepSeek key 存于该字段）。
- 视觉模型 `deepseek-flash` 接受图片：`image_url` 传 `data:image/png;base64,...`（JPEG/PNG/GIF/WebP）。
- `deepseek-v4-pro` **不支持图片**；`deepseek-chat` 已退役。
- 网络：需直连（系统代理 127.0.0.1:7897 会 SSL 失败），请求时 `NO_PROXY=*`。

---

## 5. 上游 lolPing 架构回顾（改动的地基）

### 5.1 四进程架构

```
Electron main 进程  ←→  hook-helper.exe (C++ 子进程)  ←→  OS 全局钩子
   │                        JSON lines over stdin/stdout
   ├─ InputBridge      管理/重启 helper（退避重启）
   ├─ OverlayManager   每个显示器一个透明穿透置顶窗口
   ├─ SettingsStore    设置持久化 + 归一化
   ├─ RoomManager      房间/成员/加密/限流（经 Transport 接口联网）
   └─ Tray / Updater
   overlay 渲染进程（每屏一个）：轮盘 + 动画 + Web Audio
   settings 渲染进程：React + Fluent UI v9
```

### 5.2 关键源文件（定位用）

| 文件 | 作用 |
|---|---|
| `src/shared/protocol.ts` | helper↔Electron JSON 协议（一行一对象，坐标物理像素） |
| `src/shared/settings.ts` | 设置 schema + `normalizeSettings`（脏数据兜底） |
| `src/shared/pings.ts` | 11 个 ping 的表（id/icon/art/sound/color） |
| `src/shared/geometry.ts` | `pickSlice`（8 片 45°、中心死区 86px 纯函数） |
| `src/main/index.ts` | 装配入口（事件接线、生命周期） |
| `src/main/overlayManager.ts` | 每屏 overlay + ping/emote 事件分发 |
| `src/renderer/overlay/main.ts` | overlay 渲染入口（IPC 事件 → 轮盘/动画） |
| `src/renderer/overlay/wheel.ts` | 轮盘 SVG 绘制/选择 |
| `native/hook-helper/src/decision.cpp` | 输入状态机（Idle→Pending→Wheel→SwallowUp） |
| `native/hook-helper/src/hooks_win.cpp` | Windows 全局钩子 + SendInput 注入 |

### 5.3 上游约束（fork 后仍应遵守，保证代码干净）

- 逻辑放纯模块，注入时间 `now()`；Electron/DOM/OS 代码保持薄。
- 所有用户可见文案进 `src/shared/i18n.ts`，中英双语。
- 设置新字段必须在 `normalizeSettings` 给默认值。
- 测试 mirror 源码结构（`tests/<area>/<module>.test.ts`）。
- TypeScript strict，无 `any`；依赖固定版本（本功能用 Node 自带 `fetch`，**不引入新依赖**）。

---

## 6. 技术方案

### 6.1 改动范围（不动 C++ helper / 不碰 decision.cpp）

新增/修改全在 Electron 主进程 + overlay 渲染层：

```
新增
├─ src/shared/assistant.ts         ping/表情 → 交互映射、角色 → 位移表（纯数据，可单测）
├─ src/main/screenCapture.ts       桌面截取：desktopCapturer → 裁矩形 → PNG base64
├─ src/main/deepseek.ts            DeepSeek 客户端（fetch；视觉/文字两个模型）
├─ src/main/assistant.ts           助手总控：截屏 → AI → 弹窗状态机
├─ src/renderer/overlay/assistant.ts  助手精灵 + 位移动画 + 弹窗 + 聊天输入
├─ src/renderer/overlay/regionSelect.ts 手动拖拽四角/边缘调整截取框
修改
├─ src/shared/settings.ts          + assistantEnabled/apiKey/visionModel/textModel/assistantCharacter/regionSizePx
├─ src/shared/i18n.ts              + 全部新文案
├─ src/renderer/settings/*         + 「Assistant」设置分区
├─ src/main/index.ts               + 助手生命周期 + ping/emote 事件接线
```

### 6.2 关键接口设计

**① DeepSeek 客户端（`src/main/deepseek.ts`）**
- `vision(messages: ChatMessage[]): Promise<string>` → 调 `deepseek-flash`
- `text(messages: ChatMessage[]): Promise<string>` → 调 `deepseek-v4-pro`
- 用 Node 自带 `fetch`，POST `https://api.deepseek.com/chat/completions`，Header 带 `Authorization: Bearer <key>`。
- key / model 名从 `Settings` 读，不硬编码。

**② 桌面截取（`src/main/screenCapture.ts`）**
- `desktopCapturer.getSources({ types: ['screen'] })` → 匹配 pin 点所在显示器 → `getUserMedia` 拿 MediaStream。
- 抓一帧到 `<canvas>`，裁 `(pin ± regionSizePx/2)` 矩形（clamp 到显示器边界），`toDataURL('image/png')`。
- 隐私：此图会发给 DeepSeek，需在 README/About 声明。

**③ 助手窗口（`src/main/assistant.ts` + `renderer/overlay/assistant.ts`）**
- **单独小 always-on-top 透明窗口**（frameless、可聚焦），精灵 + 弹窗 + 输入框都在其中。
- 原因：现有 overlay 是 `setIgnoreMouseEvents(true)` + `focusable:false`（不可交互），弹窗按钮/聊天输入需要可点击可聚焦；**不破坏现有 overlay 的输入穿透保证**。
- 跨屏：单个窗口用 `setBounds` 重定位；连续跨屏移动退化为「瞬移/边缘拾起」。

**④ 设置 schema 新增（`src/shared/settings.ts`）**
- `assistantEnabled: boolean`（默认 true）
- `apiKey: string`（默认空，需用户填）
- `visionModel: string`（默认 `deepseek-flash`）
- `textModel: string`（默认 `deepseek-v4-pro`）
- `assistantCharacter: string`（默认 `assistant`；`'none'` = 关闭角色，直接弹窗不带动画）
- `regionSizePx: number`（默认 800，限 200–1600）

### 6.3 交互流程（一次 ping 的生命周期）

1. 用户拖到「?」松手 → 原 ping 动画照旧显示。
2. 主进程截取松手点周围区域（默认 800×800）→ PNG。
3. 助手精灵从屏幕外（默认隐藏）用角色位移方式移动到 pin 点上方。
4. 拉出弹窗：截屏缩略图 + 一行话（「这里你有疑问吗？」）+ **[是][否][追问]**。
5. **是** → 截图 + 对应 prompt → `deepseek-flash` → 回答显示在弹窗。
   **否** → 收起。
   **追问** → 弹窗展开成聊天框（聚焦、键盘输入），可多轮。
6. 用户关闭 → 弹窗收回 → 精灵按角色方式移回原位（不限速）。

### 6.4 假触发器（Phase 4 用）

- 设置页加「测试助手」按钮，直接调 `assistant.ts` 流程（指定测试 ping 类型 + 中心点），**绕过 C++ helper**，先跑通「截屏 → AI → 弹窗 → 回答」全链路。

---

## 7. 数据映射

### 7.1 ping 信号 → 交互（11 个）

| ping | id | 类型 | 助手开场 / 行为 |
|---|---|---|---|
| 敌方消失(?) | `missing` | A 读屏 | 「这里有疑问吗？」→ 视觉解答 |
| 危险(!) | `danger` | A 读屏 | 「这里危险吗？我帮你看看」→ 视觉分析 |
| 需要协助 | `assist` | A 读屏 | 「需要我看看吗？」→ 视觉分析 |
| 需要视野 | `needvision` | A 读屏 | 「我帮你探一探」→ 视觉描述 |
| 敌方视野 | `enemyvision` | A 读屏 | 「这里暴露了，小心」→ 视觉分析 |
| 通用 | `generic` | A 读屏 | 「想了解这里吗？」→ 视觉描述 |
| 进攻 | `push` | A/B | 「冲这里？」→ 视觉分析目标（或纯口号） |
| 正在路上 | `omw` | B 台词 | 「出发！我陪你」 |
| 全力进攻 | `allin` | B 台词 | 放大招动画 +「全力输出！」 |
| 诱饵 | `bait` | B 台词 | 「我来当诱饵！」 |
| 视野已清除 | `visioncleared` | B 台词 | 「安全，走吧」 |

- **A 类**：截屏送 `deepseek-flash` 视觉分析。
- **B 类**：不读屏，`deepseek-v4-pro` 生成一句贴合角色/信号的台词（或本地文案兜底）。

### 7.2 表情 → 反馈（分类映射，可细化到单个）

| 类别 | 例 | 助手反馈 |
|---|---|---|
| 点赞/夸赞 | `nice` `super_approved` `gg_heart` `good_job_buddy` `hats_off` `teamwork` | 「谢谢夸奖！」+ 得意动画 |
| 惊讶 | `gasp` `oh` `woah_dizzy` `does_not_compute` | 助手也惊讶 |
| 大笑/嘲讽 | `haha_hilarious` `come_at_me` `i_will_destroy_you` `such_foolishness` | 配合笑 / 俏皮回击 |
| 伤心 | `despair` `sad_kitten` `pain` `maybe_next_time` | 安慰 |
| 友好/开心 | `bee_happy` `poro_ride` `poro_snax` `wahaha` `cheeky_poro` | 开心回应 |
| 生气 | `angry_kitty` `bee_mad` | 安抚 |
| 其他 | `facepalm` `okay` `think_about_it` `nice_try` | 中性配台词 |

### 7.3 助手角色 → 位移（草案）

| 角色 | 位移 |
|---|---|
| **关闭（none）** | 无精灵，直接弹窗 |
| 原创通用助手（默认） | `teleport` |
| 亚索 Yasuo | `dash` |
| 劫 Zed | `teleport` |
| 提莫 Teemo | `jump` |
| 卡莎 Kai'Sa | `fly` |

- 位移枚举：`teleport`（瞬移淡入）/ `jump`（抛物线跳）/ `dash`（冲刺残影）/ `fly`（飞入）。
- 英雄立绘为 Riot 版权（同现有内置资产的风险接受）；默认原创助手规避版权。

---

## 8. 任务拆分（Phase 0–5）

### Phase 0 — 环境跑通
- 目标：本地 clone 上游 lolPing 到 `D:\pytorch\lolping-assistant`，`npm install` + `npm run dev` 跑通。
- 改动：无。
- 验收：Electron 主进程 + 设置窗 + overlay 起来。
- 风险：Electron 二进制国内下载（镜像 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`）。

### Phase 1 — 设置项（纯 TS，可单测）
- 改动：`src/shared/settings.ts`（新字段 + normalize 默认）、`src/shared/i18n.ts`、`src/renderer/settings/*`（Assistant 分区）。
- 验收：设置页能填 key/选模型/选角色/调范围，落盘 + 归一化单测通过。

### Phase 2 — 截屏 + AI 客户端（主进程，可单测）
- 改动：`src/main/screenCapture.ts`、`src/main/deepseek.ts`。
- 验收：截屏返回 PNG base64；`deepseek-flash` 识图返回正确描述（单测用 mock）。

### Phase 3 — 助手窗口 + 动画（渲染层）
- 改动：`src/main/assistant.ts`、`src/renderer/overlay/assistant.ts`。
- 验收：助手精灵出现在指定位置，能瞬移/跳/冲刺/飞，拉出/收回弹窗，[是][否][追问]可点。

### Phase 4 — 映射 + 假触发器打通全链路
- 改动：`src/shared/assistant.ts`（映射表）、设置页「测试助手」按钮。
- 验收：点「测试助手」→ 截屏 → AI 回答 → 弹窗显示，全链路通。

### Phase 5 — 接真实 ping/emote + 范围手动调整 + 收尾
- 改动：`OverlayManager` ping/emote 事件接 `assistant.ts`；`src/renderer/overlay/regionSelect.ts`；装 C++ helper 真机触发；README + About 隐私说明。
- 验收：真机 Alt+拖「?」→ 助手出现并视觉回答；手动拖拽调整范围生效；`npm test` + `npm run typecheck` 通过。

---

## 9. 风险与待办

| 风险/待办 | 说明 |
|---|---|
| C++ 工具链 | 真机触发需装 hook-helper.exe（MSVC/VS2022），Phase 5 才需要；前期用假触发器绕开 |
| 屏幕录制权限 | Win 一般无需；macOS 需「屏幕录制」授权（本项目当前以 Win 为主） |
| 隐私 | 截图会发给 DeepSeek，README/About 必须声明 |
| 跨屏移动 | 单窗口跨屏连续移动退化为瞬移/拾起，接受 |
| 自动边缘检测 | 原「自适应扩展覆盖完整」改为手动调整；自动检测可作为后续增强 |

---

## 10. 变更记录

- 2026-10-14 v0.1：初版，含需求分析、10 项决策、接口设计、数据映射、Phase 0–5 拆分、环境验证结果。
