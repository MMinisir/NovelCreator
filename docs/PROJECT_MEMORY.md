# NovelCreator 项目速查（供后续对话快速检索）

> 维护说明：每个 Sprint 结束时更新本文件（进度表、变更摘要）。检索时先看「目录地图」与「核心约定」，细节到具体文件。
> 迭代规划以 `docs/执行案.md` 为准（敏捷，2 周/Sprint，共 10 个 Sprint）。

## 1. 项目是什么

本地优先（IndexedDB）的中文小说创作设定管理与 AI 辅助写作工作台。纯前端 SPA，无后端。
验收命令：`npm run build`（= `tsc -b` + vite build，须零错误）；开发 `npm run dev`。
技术栈：React 18 + TS + Vite + Tailwind + Zustand + Dexie + TipTap（富文本）+ cytoscape（关系图，Sprint 4）+ **react-window v2**（时间线虚拟列表，Sprint 5，v2 自带类型、API=List/rowComponent/rowProps/listRef，勿装 @types/react-window v1）+ **vite-plugin-pwa v1.3**（Sprint 6，generateSW，产物 dist/sw.js）。

## 2. 目录地图（src/）

| 目录 | 职责与关键文件 |
|---|---|
| `db/database.ts` | Dexie schema，库名 `novel-tool`，**DB_VERSION=1**；全部实体 keyPath=id + projectId 索引 |
| `db/repositories.ts` | **Repository 模式唯一数据入口**（业务代码禁止直接操作 db）。每表一个 repo（见 §3）；含 `deleteProjectCascade` / `deleteCharacterCascade` / `deleteOutlineNodeCascade` / `deleteChapterCascade` / `deleteEventCascade` / `deleteForeshadowingCascade`（Sprint 6，先清大纲埋设/回收引用）等级联删除 |
| `services/outline.ts` | 大纲领域服务：种子结构（幂等 ensure）、层级约束、伏笔埋设/回收、草稿生成 |
| `services/exportImport.ts` | 项目 JSON 导出/导入（全表按 projectId 收集） |
| `types/` | `base.ts`(id/时间戳通用)、`project.ts`、`character.ts`、`world.ts`(Location/StoryEvent/Relationship)、`outline.ts`、`chapter.ts`、`meta.ts`(Foreshadowing/模板等) |
| `components/ui.tsx` | **统一 UI 原语**：Button/Input/Textarea/Select/Field/Badge/Modal/ConfirmDialog/EmptyState/Tooltip/TextWithHint… 颜色 Badge='violet'/'amber'/'green'/'slate' 等；风格=圆角卡片 stone 系 |
| `components/rich/RichTextEditor.tsx` | TipTap 封装（StarterKit），value/onChange=**HTML 字符串** |
| `components/layout/` | 应用壳：侧栏导航/顶栏 |
| `components/{people,relationship,project,time,outline}/` | 分模块组件（如 outline 下 OutlineSetupCards / OutlineNodeEditor）；time/FlexibleTimeEditor 灵活时间编辑 |
| `services/ai/` | **AI 服务层（Sprint 5 预研）**：`types.ts`(AIProvider 接口/AIChatOptions/AIProviderConfig)、`openaiCompat.ts`(OpenAI 兼容 Provider + createAIProvider 工厂)、`contextBuilder.ts`(项目/人物上下文纯函数)；无 UI，Sprint 7 US-801 开放 |
| `utils/eventTypes.ts` | 共享事件类型与配色（EVENT_TYPES / EVENT_TYPE_STYLE，事件页+时间线复用） |
| `utils/timeline.ts` | 时间线领域纯函数：TimelineItem 构建/排序（kind=event/state/foreshadow，US-602 伏笔按预期回收事件锚定）、manualKindOf、段归一 normalizeManualSegment/needsManualNormalize、swapManualNeighbors |
| `utils/markdown.ts` | **Markdown 导出（US-701）**：`htmlToMarkdown`（TipTap HTML 受控子集→md，纯函数）+ `chaptersToMarkdown` 组装（头部元信息+按写作顺序章节） |
| `pages/ProjectListPage.tsx` | 首页项目列表 |
| `pages/project/ProjectWorkspace.tsx` | 项目内布局 + 侧栏模块导航（设置 URL: `/projects/:id/xxx`） |
| `pages/project/*Page.tsx` | Characters/Locations/Events/Outline/Writing/CharacterDetail/Overview/Settings/Timeline/Graph/**Foreshadowings**/Ideas/ModulePlaceholder（兜底） |
| `hooks/useProjectEntityList.ts` | `useProjectEntityList(repo, projectId)` → `{items, loaded, refresh}`（按项目订阅实体列表） |
| `stores/projectStore.ts` | 当前项目缓存（Zustand） |

## 3. 数据层约定

- 表：projects / characters / states(人物状态历史) / arcs(人物弧光) / relationships / locations / events / **outline_nodes** / **chapters** / chapter_versions / scenes / **foreshadowings**(Sprint 6 启用) / **idea_fragments**(Sprint 6 启用，kind: text 预留 voice/photo) / comments / prompt_templates / backup_metadata（后 3 个多为 Sprint 7+ 预留）。
- 主键：`createEntity(projectId, fields)` 生成（id = 随机串全局唯一）。通用字段：`id/projectId/createdAt/updatedAt`。软删除：projects 有 `deletedAt`，别家用 `repo.remove()` 物理删。
- 各 repo 形如 `outlineRepo = { listByProject, add, update(id, patch), remove }`，patch 是 `Partial` 按 id merge。
- **富文本一律 HTML 字符串**（TipTap 输出含 `<p>`、`<blockquote>` 等）；字数统一 `utils/text.ts countWords()`（去 HTML 标签按中文/英文词计）。
- 时间排序在 `utils/time.ts`：`compareFlexibleTime`（relative=0 < fuzzy=1(sortOrder) < chapter=2 < exact=3，段内二级 sortOrder）+ **`timeLabel`（自 Sprint 5 起从 FlexibleTimeEditor 迁至此，全项目统一引用 utils/time）**。
- 导入校验用 DB_VERSION；结构变更需 `database.ts` 加 version(n).upgrade。

## 4. 领域模型速记

- **OutlineNode（大纲树）**：`type: root|story_core|logline|synopsis_item|act|chapter|scene|free`；`parentId/order` 构成树；`content`(HTML 概要)；chapter/scene 用 `characterIds[]、keyEventIds[]`；`foreshadowingPlantedIds[]` / `foreshadowingResolvedIds[]`；scene 有 `scene{goal,locationId,conflict,outcome,characterIds}`。层级约束：act→chapter→scene(+free)；root 直属 story_core/logline/act/free。种子结构=root→故事核+五句话(开端/发展/高潮/转折/结局)。
- **Chapter（正文章）**：`outlineNodeId?`(关联大纲章节细纲，一对多规避：新建时只允许选未被关联的细纲)、`content`(HTML)、`wordCount`、`status: not_started|draft|done|revised`、`order`、`targetWords?`。
- **Character**：基本信息 + `importance`；states/arcs 为其子表；关系 relationships(sourceId/targetId/type/strength)。
- **Foreshadowing（伏笔）**：`description`、`status: active|resolved|abandoned`、`priority: high|medium|low`、`expectedResolveEventId?`（Sprint 6 新增普通字段，非索引无需 DB 迁移；US-602 时间线节点取该事件时间）、`relatedCharacterIds[]`；大纲节点通过 planted/resolved id 列表闭环。
- **状态历史（US-104）**：`Character.currentState` 为冗余最新状态（`{time,state}|null`），由状态历史“最后一条记录”驱动：StateHistorySection 增删改后自动重算并写回人物（记录按 createdAt 顺序旧→新，最新标“当前”）。删除人物时 deleteCharacterCascade 已清 states/arcs。

## 5. Sprint 进度

| Sprint | 内容（US） | 状态 |
|---|---|---|
| 0 | 脚手架/数据模型/UI 框架 | ✅ |
| 1 | 项目 CRUD + JSON 导出导入（US-001~005） | ✅ |
| 2 | 人物/地点/事件/关系（US-101,102,105~107） | ✅ |
| 3 | 大纲系统 + 写作区（US-201~204, 501a/501c） | ✅（本轮） |
| 4 | 人物状态历史 US-104、@快速建人 US-108、关系图 US-401/402（Cytoscape） | ✅（本轮） |
| 5 | 时间线 react-window（US-301~304）+ AI Provider 预研 | ✅（本轮） |
| 6 | 伏笔管理（US-601/602）、导出 Markdown（US-701）、PWA 速记（US-901） | ✅（本轮） |
| 7 | AI 功能开放（US-801~804）、自动备份（US-702/703） | 规划 |
| 8 | 一致性/写作辅助/版本历史（US-501b,504,505,805） | 规划 |
| 9 | AI 审稿与移动端（US-806,805-LLM,902,903） | 规划 |
| 10 | 协作批注、DOCX/PDF 导出、体检报告（US-1001,701,新增） | 规划 |

## 6. 核心约定 / 待办（决策记录）

- **US-205 大纲拖拽排序** → 待办（树组件行尾已预留）。
- **时间线（Sprint 5+6 已交付）**：路由 `/projects/:id/timeline`（TimelinePage）。全局=全部事件；顶部 Select 选人=角色时间线（该人物事件+`CharacterState` 状态变化合并）。筛选=人物/地点/类型 chips + **「伏笔节点」开关（US-602，sky 色节点）**。排序=compareFlexibleTime 类别段内序；**模糊/相对事件行右侧 ▲▼ 在同类段内移动**（写 `time.sortOrder`，首次移动自动归一 0..n-1）。虚拟滚动=react-window v2 `List`。事件编辑仍在事件页。
- **伏笔管理（Sprint 6 已交付）**：路由 `/projects/:id/foreshadowing`（ForeshadowingsPage）。列表状态筛选（全部/活跃/已回收/已废弃）+ 优先级/预期回收事件/相关人物展示；新建/编辑 Modal（描述必填；**预期回收事件**锚到事件 → 时间线节点）；删除走 `deleteForeshadowingCascade`（自动解除全部大纲节点 planted/resolved 引用）。大纲节点侧（OutlineNodeEditor）埋设/回收闭环仍可用。
- **Markdown 导出（US-701）**：写作页头部「导出 Markdown」→ `chaptersToMarkdown` 组装（# 作品名 + 元信息 + 按顺序各章 `## 标题` + 状态/字数 + htmlToMarkdown 正文）。htmlToMarkdown 支持子集：h1-6/p/strong/em/code/s/del/a/br/img/blockquote/ul/ol(嵌套)/hr/pre。DOCX/PDF 留 Sprint 10。
- **PWA/灵感碎片（US-901 简版）**：vite-plugin-pwa generateSW（autoUpdate，dist 产物 sw.js + registerSW.js + manifest.webmanifest；图标用 /favicon.svg 简版，未含 png 图标故移动端可能无安装提示——验收以离线可用为准）；灵感碎片页 `/projects/:id/ideas`（IdeaFragment: content/tags[]/kind:text，搜索、点标签筛选、删除）。
- **AI 层（Sprint 5 预研）**：`src/services/ai/` 仅骨架无 UI——Provider 抽象（chat/testConnection + AbortSignal）、OpenAI 兼容实现（/v1/chat/completions，baseURL 可配，浏览器直连受 CORS 限制，正式版走本地代理）、上下文构建器（buildProjectContextBrief / buildCharacterContextBrief 纯函数，本地拼提示不发请求）。US-801 配置界面 Sprint 7 开放。
- **AI 层（Sprint 5 预研）**：`src/services/ai/` 仅骨架无 UI——Provider 抽象（chat/testConnection + AbortSignal）、OpenAI 兼容实现（/v1/chat/completions，baseURL 可配，浏览器直连受 CORS 限制，正式版走本地代理）、上下文构建器（buildProjectContextBrief / buildCharacterContextBrief 纯函数，本地拼提示不发请求）。US-801 配置界面 Sprint 7 开放。
- 事件类型常量（EVENT_TYPES/EVENT_TYPE_STYLE）统一在 `utils/eventTypes.ts`；富文本显示用 `.rich-display` 容器 + `line-clamp`。
- **US-206 细纲→草稿生成** → 已在 Sprint 3 前瞻实现（大纲 Editor 一键建草稿并跳写作区 `?chapter=id`）。
- 正文写作区「五句话→自动展开分幕」三步引导 → 放 Sprint 5 时间线联动后。
- 写作富文本用 TipTap StarterKit（非 Markdown 源码；需求里的“Markdown 编辑”以富文本近似实现）。
- 状态历史“当前状态”=记录列表最后一条（createdAt 序），增删改即时重算写回 `Character.currentState`；详情页顶 Badge 与列表卡片直接读该冗余字段。
- @快速建人规则（`components/people/QuickCreateCharacterModal.tsx` 导出 `parseQuickCharacter`）：去 @，逗号/顿号分 token——首 token 姓名；其后按序匹配 重要程度别名(主角/重要/主要/配角/龙套/路人…) → 性别(男/女) → 年龄(数字/岁/+) → 其余=性格标签；重名直接打开现有。
- 关系图：项目级全量渲染（人物+关系，无虚拟化，500 节点内可用）；关系无方向、单边记录（sourceId<targetId 归一）；双击节点 = `cy.animate(fit)` 聚焦；连点线/空白在右侧详情栏。
- 未知导航/误路由走 `ModulePlaceholderPage`（仅兜底文案，无规划表）。
- 概览页可点击「开始写作 / 查看大纲」直达对应模块。
- 类型系统：项目内实体字段集中定义在 `types/`，改字段须同步 `db/database.ts` 索引与 `services/exportImport.ts` 导出兼容。

## 7. 跨模块引用链（改一处要检查的联动）

大纲章节细纲 ← `outlineNodeId` → 章节草稿；大纲节点 `keyEventIds` → events；`characterIds` → characters；伏笔 id 列表 ↔ foreshadowings（回收候选=非 abandoned 且未被本节点埋/收）。
级联删除要点：删 character → 解除 relationships 两端 + states/arcs 清除 + 大纲节点 characterIds 剔除；删 event → 大纲 keyEventIds 剔除 + states.relatedEventId 置空；删 outline node → 后代级联 + 孤儿伏笔清除 + chapter 保留仅解关联；删 chapter → 版本/场景级联。
状态同步：状态历史增删改后须重算 `Character.currentState`（最新一条），人物删除时随 states 级联，无需单独处理。

## 8. 最近变更

### Sprint 6（本轮）
- 新增：`pages/project/ForeshadowingsPage.tsx`（US-601 伏笔 CRUD + 状态筛选 + 大纲埋设/回收计数展示）、`pages/project/IdeasPage.tsx`（US-901 文本速记：搜索/标签点击筛选/删除）、`utils/markdown.ts`（US-701 htmlToMarkdown + chaptersToMarkdown）。
- 修改：`types/meta.ts` Foreshadowing 增 `expectedResolveEventId?`（普通字段免 DB 迁移）；`db/repositories.ts` 增 `deleteForeshadowingCascade`；`utils/timeline.ts` kind 扩展 foreshadow（buildTimelineItems 接受 foreshadowings，active+锚定事件者插入节点）；`TimelinePage` 增伏笔节点开关与 sky 系渲染；`WritingPage` 增「导出 Markdown」；`vite.config.ts` 接入 VitePWA（manifest + workbox precache 10 条目 1.2MB）；App.tsx 注册 foreshadowing/ideas 路由；ModulePlaceholderPage 简化为兜底。
- 依赖：+vite-plugin-pwa（1.3.0，devDep）。
- 环境坑（npm 11.6）：中断的 npm install 会留 `.DELETE.*` 残骸（安全删除待确认机制），`npm ci` 大批量删除需交互确认会失败；修复法=脚本将 `.DELETE.*` 改回原名撤销挂起删除，再 `npm i -D vite-plugin-pwa` 补齐缺失包（本 Sprint 已用此法修复一次）。
- Sprint 6 验收：伏笔可新建/编辑/删除（删除自动解大纲引用）；时间线开关显示活跃伏笔预期回收节点并锚到事件时间；写作页一键导出整本 Markdown（含标题/状态/字数）；`npm run build` 产出 sw.js 可离线（dev 下 SW 不启用）。

### Sprint 5（历史）
- 新增：`pages/project/TimelinePage.tsx`（US-301 全局虚拟时间线 / US-302 人物·地点·类型筛选 / US-304 角色时间线=事件+状态变化合并 / US-303 模糊·相对事件行 ▲▼ 同类段内移动并写回 `time.sortOrder`）；`utils/eventTypes.ts`（EVENT_TYPES/EVENT_TYPE_STYLE 共享）；`utils/timeline.ts`（TimelineItem 构建/排序、manualKindOf、段归一）；`services/ai/`（types.ts 接口 + openaiCompat.ts OpenAI 兼容 Provider/工厂 + contextBuilder.ts 上下文纯函数，均无 UI）。
- 修改：`utils/time.ts` 增 `timeLabel`（原在 FlexibleTimeEditor，8 处引用统一迁入）；EventsPage 改引 `utils/eventTypes`；App.tsx 注册 `timeline` 路由；ModulePlaceholderPage 移除 timeline。
- 依赖：+react-window（v2.3.1，自带类型；API=List/rowComponent/rowProps/listRef，勿混装 @types/react-window v1）。
- Sprint 5 验收：时间线虚拟列表 2000+ 事件流畅滚动；三类筛选联动即时过滤并回顶；角色时间线合并参与事件与状态变化（含人物名/变化徽标）；模糊事件可上下移（跨精确时间不可动），顺序持久化；AI Provider 骨架单测可见。

### Sprint 4（历史）
- 新增：`components/people/StateHistorySection.tsx`（状态记录时间轴 CRUD + currentState 自动同步，含 kind 类型/灵活时间/描述）、`components/people/QuickCreateCharacterModal.tsx`（@自然语言解析创建，导出 `parseQuickCharacter`）、`pages/project/RelationshipGraphPage.tsx`（cytoscape cose 布局；节点按重要度配色尺寸、连线按强度着色/粗细、关系标签开关、适应画布/重新布局、点击节点/连线看详情、双击聚焦、图例与操作提示）。
- 修改：`CharacterDetailPage` 嵌入状态历史；`CharactersPage` 加“@ 快速建人”入口；`App.tsx` 注册 `graph` 路由；占位页移除 graph。
- 依赖：+cytoscape、+@types/cytoscape。
- Sprint 4 验收：状态历史可记录增删改并自动展示当前状态于卡片/头部；一句话“@林澈，主角，男，18，废柴”即可建人并跳详情；关系图基础可用（节点点击详情、双击聚焦、标签/布局工具）。

### Sprint 3（历史）

- 新增：`services/outline.ts`、`components/outline/{OutlineSetupCards,OutlineNodeEditor}.tsx`、`pages/project/{OutlinePage,WritingPage}.tsx`。
- 修改：`db/repositories.ts`(+级联/种子工具)、`db/database.ts` 无改动(表 S0 已建模)、路由/占位页/概览页启用、`utils/text.ts`(countWords)、`components/ui.tsx`(补充通用件)。
- Sprint 3 验收：故事核/五句话梗概可编辑；分幕→章→场景树增删改/展开折叠；章节细纲关联人物/事件/伏笔；正文写作自动保存+字数+状态+从细纲生成草稿。
