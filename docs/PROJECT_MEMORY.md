# NovelCreator 项目速查（供后续对话快速检索）

> 维护说明：每个 Sprint 结束时更新本文件（进度表、变更摘要）。检索时先看「目录地图」与「核心约定」，细节到具体文件。
> 迭代规划以 `docs/执行案.md` 为准（敏捷，2 周/Sprint，共 10 个 Sprint）。

## 1. 项目是什么

本地优先（IndexedDB）的中文小说创作设定管理与 AI 辅助写作工作台。纯前端 SPA，无后端。
验收命令：`npm run build`（= `tsc -b` + vite build，须零错误）；开发 `npm run dev`。
技术栈：React 18 + TS + Vite + Tailwind + Zustand + Dexie + TipTap（富文本）+（Cytoscape/react-window 规划中未装）。

## 2. 目录地图（src/）

| 目录 | 职责与关键文件 |
|---|---|
| `db/database.ts` | Dexie schema，库名 `novel-tool`，**DB_VERSION=1**；全部实体 keyPath=id + projectId 索引 |
| `db/repositories.ts` | **Repository 模式唯一数据入口**（业务代码禁止直接操作 db）。每表一个 repo（见 §3）；含 `deleteProjectCascade` / `deleteCharacterCascade` / `deleteOutlineNodeCascade` / `deleteChapterCascade` / `deleteEventCascade` 等级联删除（删除前先查引用表批量解除） |
| `services/outline.ts` | 大纲领域服务：种子结构（幂等 ensure）、层级约束、伏笔埋设/回收、草稿生成 |
| `services/exportImport.ts` | 项目 JSON 导出/导入（全表按 projectId 收集） |
| `types/` | `base.ts`(id/时间戳通用)、`project.ts`、`character.ts`、`world.ts`(Location/StoryEvent/Relationship)、`outline.ts`、`chapter.ts`、`meta.ts`(Foreshadowing/模板等) |
| `components/ui.tsx` | **统一 UI 原语**：Button/Input/Textarea/Select/Field/Badge/Modal/ConfirmDialog/EmptyState/Tooltip/TextWithHint… 颜色 Badge='violet'/'amber'/'green'/'slate' 等；风格=圆角卡片 stone 系 |
| `components/rich/RichTextEditor.tsx` | TipTap 封装（StarterKit），value/onChange=**HTML 字符串** |
| `components/layout/` | 应用壳：侧栏导航/顶栏 |
| `components/{people,relationship,project,time,outline}/` | 分模块组件（如 outline 下 OutlineSetupCards / OutlineNodeEditor） |
| `pages/ProjectListPage.tsx` | 首页项目列表 |
| `pages/project/ProjectWorkspace.tsx` | 项目内布局 + 侧栏模块导航（设置 URL: `/projects/:id/xxx`） |
| `pages/project/*Page.tsx` | Characters/Locations/Events/Outline/Writing/CharacterDetail/Overview/Settings/ModulePlaceholder |
| `hooks/useProjectEntityList.ts` | `useProjectEntityList(repo, projectId)` → `{items, loaded, refresh}`（按项目订阅实体列表） |
| `stores/projectStore.ts` | 当前项目缓存（Zustand） |

## 3. 数据层约定

- 表：projects / characters / states(人物状态历史) / arcs(人物弧光) / relationships / locations / events / **outline_nodes** / **chapters** / chapter_versions / scenes / foreshadowings / idea_fragments / comments / prompt_templates / backup_metadata（后 5 个多为 Sprint 6+ 预留）。
- 主键：`createEntity(projectId, fields)` 生成（id = 随机串全局唯一）。通用字段：`id/projectId/createdAt/updatedAt`。软删除：projects 有 `deletedAt`，别家用 `repo.remove()` 物理删。
- 各 repo 形如 `outlineRepo = { listByProject, add, update(id, patch), remove }`，patch 是 `Partial` 按 id merge。
- **富文本一律 HTML 字符串**（TipTap 输出含 `<p>`、`<blockquote>` 等）；字数统一 `utils/text.ts countWords()`（去 HTML 标签按中文/英文词计）。
- 时间线排序键在 `utils/time.ts`（大纲/事件引用，Sprint 5 时间线用）。
- 导入校验用 DB_VERSION；结构变更需 `database.ts` 加 version(n).upgrade。

## 4. 领域模型速记

- **OutlineNode（大纲树）**：`type: root|story_core|logline|synopsis_item|act|chapter|scene|free`；`parentId/order` 构成树；`content`(HTML 概要)；chapter/scene 用 `characterIds[]、keyEventIds[]`；`foreshadowingPlantedIds[]` / `foreshadowingResolvedIds[]`；scene 有 `scene{goal,locationId,conflict,outcome,characterIds}`。层级约束：act→chapter→scene(+free)；root 直属 story_core/logline/act/free。种子结构=root→故事核+五句话(开端/发展/高潮/转折/结局)。
- **Chapter（正文章）**：`outlineNodeId?`(关联大纲章节细纲，一对多规避：新建时只允许选未被关联的细纲)、`content`(HTML)、`wordCount`、`status: not_started|draft|done|revised`、`order`、`targetWords?`。
- **Character**：基本信息 + `importance`；states/arcs 为其子表；关系 relationships(sourceId/targetId/type/strength)。
- **Foreshadowing（伏笔）**：`description`、`status: planted|resolved|abandoned`、优先级等；大纲节点通过 planted/resolved id 列表闭环（最小实现，Sprint 6 才做独立管理页）。

## 5. Sprint 进度

| Sprint | 内容（US） | 状态 |
|---|---|---|
| 0 | 脚手架/数据模型/UI 框架 | ✅ |
| 1 | 项目 CRUD + JSON 导出导入（US-001~005） | ✅ |
| 2 | 人物/地点/事件/关系（US-101,102,105~107） | ✅ |
| 3 | 大纲系统 + 写作区（US-201~204, 501a/501c） | ✅（本轮） |
| 4 | 人物状态历史 US-104、@快速建人 US-108、关系图 US-401/402（Cytoscape） | 规划 |
| 5 | 时间线 react-window（US-301~304）+ AI Provider 预研 | 规划 |
| 6 | 伏笔管理（US-601/602）、导出 Markdown（US-701）、PWA 速记（US-901） | 规划 |
| 7 | AI 功能开放（US-801~804）、自动备份（US-702/703） | 规划 |
| 8 | 一致性/写作辅助/版本历史（US-501b,504,505,805） | 规划 |
| 9 | AI 审稿与移动端（US-806,805-LLM,902,903） | 规划 |
| 10 | 协作批注、DOCX/PDF 导出、体检报告（US-1001,701,新增） | 规划 |

## 6. 核心约定 / 待办（决策记录）

- **US-205 大纲拖拽排序** → 明确推到 Sprint 5 后做（树组件行尾已预留）。
- **US-206 细纲→草稿生成** → 已在 Sprint 3 前瞻实现（大纲 Editor 一键建草稿并跳写作区 `?chapter=id`）。
- 正文写作区「五句话→自动展开分幕」三步引导 → 放 Sprint 5 时间线联动后。
- 写作富文本用 TipTap StarterKit（非 Markdown 源码；需求里的“Markdown 编辑”以富文本近似实现）。
- 未交付导航仍走 `ModulePlaceholderPage`（timeline/foreshadowing/ideas/…），其文案表直接删改该文件。
- 概览页可点击「开始写作 / 查看大纲」直达对应模块。
- 类型系统：项目内实体字段集中定义在 `types/`，改字段须同步 `db/database.ts` 索引与 `services/exportImport.ts` 导出兼容。

## 7. 跨模块引用链（改一处要检查的联动）

大纲章节细纲 ← `outlineNodeId` → 章节草稿；大纲节点 `keyEventIds` → events；`characterIds` → characters；伏笔 id 列表 ↔ foreshadowings（回收候选=非 abandoned 且未被本节点埋/收）。
级联删除要点：删 character → 解除 relationships 两端 + 大纲节点 characterIds 剔除；删 event → 大纲 keyEventIds 剔除；删 outline node → 后代级联 + 孤儿伏笔清除 + chapter 保留仅解关联；删 chapter → 版本/场景级联。

## 8. 最近变更（Sprint 3 摘要）

- 新增：`services/outline.ts`、`components/outline/{OutlineSetupCards,OutlineNodeEditor}.tsx`、`pages/project/{OutlinePage,WritingPage}.tsx`。
- 修改：`db/repositories.ts`(+级联/种子工具)、`db/database.ts` 无改动(表 S0 已建模)、路由/占位页/概览页启用、`utils/text.ts`(countWords)、`components/ui.tsx`(补充通用件)。
- Sprint 3 验收：故事核/五句话梗概可编辑；分幕→章→场景树增删改/展开折叠；章节细纲关联人物/事件/伏笔；正文写作自动保存+字数+状态+从细纲生成草稿。
