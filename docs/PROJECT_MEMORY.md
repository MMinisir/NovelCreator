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
| `services/ai/` | **AI 服务层（Sprint 5 预研 + Sprint 7 开放）**：`types.ts`(AIProvider 接口/AIProviderConfig)、`openaiCompat.ts`(OpenAI 兼容 Provider + createAIProvider)、`contextBuilder.ts`(项目/人物上下文纯函数)、**`config.ts`**(US-801 配置 localStorage + 服务商预设)、**`tasks.ts`**(US-802~804 生成与解析：generateSynopsisText/parseSynopsis、generateCharacterBioText、generateRelationshipSuggestions/parseRelationshipSuggestions) |
| `services/backup.ts` | **自动备份与恢复（US-702/703）**：FSA 目录选择/权限、AES-GCM+PBKDF2 加解密、writeBackup / runAutoBackupIfDue / restoreFromBackupText |
| `components/ai/` | AIConfigPanel（US-801 配置+测试连接）、SynopsisGeneratorModal（US-802）、CharacterBioModal（US-803）、RelationshipSuggestModal（US-804） |
| `components/backup/BackupPanel.tsx` | 备份面板（选目录/间隔/加密口令/立即备份/从文件恢复），挂在项目设置页底部 |
| `hooks/` | `useProjectEntityList`、`useAITask`(AI 生成 loading/error/取消状态机)、`useAutoBackup`(60s 轮询自动备份) |
| `utils/eventTypes.ts` | 共享事件类型与配色（EVENT_TYPES / EVENT_TYPE_STYLE，事件页+时间线复用） |
| `utils/timeline.ts` | 时间线领域纯函数：TimelineItem 构建/排序（kind=event/state/foreshadow，US-602 伏笔按预期回收事件锚定）、manualKindOf、段归一 normalizeManualSegment/needsManualNormalize、swapManualNeighbors |
| `utils/markdown.ts` | **Markdown 导出（US-701）**：`htmlToMarkdown`（TipTap HTML 受控子集→md，纯函数）+ `chaptersToMarkdown` 组装（头部元信息+按写作顺序章节） |
| `utils/diff.ts` | **行级差异对比（US-504）**：自实现 LCS（公共前后缀裁剪 + >1200 行退化），`htmlToTextLines` / `diffLines` / `diffSummary` |
| `services/chapterVersions.ts` | 章节版本历史（US-504）：`autoSnapshot`（内容变化且距上条自动版本 ≥2 分钟才写，自动版本保留 50 条）、`saveManualVersion`（带 label 里程碑）、`restoreVersion`（回滚前先把当前正文存为里程碑） |
| `services/consistency.ts` | **一致性检查规则引擎（US-805 规则版）**：`runConsistencyChecks` 纯函数输出 Issue 列表（人物/关系/地点/事件/伏笔/章节/大纲/综合 规则）+ `summarizeIssues`；Issue.category 含 `综合`（供 AI 语义结果归位） |
| `components/writing/` | `ChapterVersionModal`（版本列表+差异+回滚）、`ReferencePanel`（US-501b/505 分屏参考：细纲/人物/地点/伏笔/关键事件） |
| `services/comments.ts` | **评论/批注服务（US-1001）**：章节评论过滤、根+回复树、统计、引用锚点截断、时间格式化 |
| `components/writing/CommentModal.tsx` | **批注面板（US-1001）**：新建批注（可引用选中文本/署名）、回复、解决/重开、删除（删根连带回复）、仅看未解决 |
| `services/health.ts` | **故事健康度报告**：五维评分（伏笔回收 25 / 人物弧光 25 / 时间线连贯 20 / 一致性 20 / 章节进度 10）→ 加权总分、等级、可执行建议 |
| `pages/project/HealthReportPage.tsx` | 体检报告页（路由 `/projects/:id/health`，侧栏「体检报告」）：总分卡 + 建议清单 + 五维明细卡 |
| `services/search.ts` | **全局搜索**：`searchDataset`/`searchDatasets` 跨 9 类实体匹配（项目/人物/地点/事件/章节正文/伏笔/灵感/大纲/批注），字段权重打分、同实体取最佳字段、返回高亮片段区间与跳转 URL |
| `components/search/GlobalSearchModal.tsx` | 搜索面板：按需加载项目数据（不常驻）、当前项目/全部项目切换、↑↓ 键盘选择 + Enter 跳转、命中词 `<mark>` 高亮、结果计数 |
| `services/merge.ts` | **共享合并（US-1002）**：`buildMergePlan`（本地 vs 远端 JSON 实体级差异：added/changed/localNewer/removed + 差异字段）、`applyMergePlan`（远端行写入时覆盖 projectId）、`defaultSelection` |
| `components/settings/MergeWizardModal.tsx` | 合并向导：按实体类型分组勾选差异（默认勾选远端新增/更新），全选/清空、合并计数 |
| `services/exportDoc.ts` | **导出扩展（US-701）**：`exportChaptersDocx`（动态 import `docx` 库，独立 chunk）、`chaptersToPrintHtml`+`printHtml`（打印对话框另存 PDF，A4 排版） |
| `services/ai/prompts.ts` | **提示构建层**：`SYSTEM_PROMPT`、`withSystem`、`buildXxxPrompt`（7 个任务）+ `AI_KIND_LABELS`；执行与「提示预览」共用同一构建函数，保证预览即所发 |
| `services/ai/log.ts` | **AI 请求日志**：`startRequestLog`/`finishRequestLog`（记录完整 messages、响应、错误、耗时、模型）、`listRequestLogs`/`deleteRequestLog`/`clearRequestLogs`/`summarizeLogs`；存 IndexedDB `ai_request_logs`（db version 3），不随项目导出，随项目删除清理 |
| `components/ai/PromptPreviewModal.tsx` | 提示预览：展示 system（可折叠）+ user（可编辑）、复制提示、「用此提示生成」（编辑仅本次生效，走 `runCustomPrompt`） |
| `components/ai/PasteImportModal.tsx` | **粘贴填充（AI 写回）**：把别处生成的内容粘贴导入，复用各任务解析管线填为可编辑结果；props：`title/description/placeholder/example`（示例可一键填入）+ `onImport(text) => Promise<string\|null>|string\|null`（返回 null 成功自动关闭，返回文案则在弹窗内展示）；「读取剪贴板」用 `navigator.clipboard.readText`（失败提示手动粘贴）；不走内置 AI、不写请求日志 |
| `pages/project/AIHistoryPage.tsx` | AI 请求历史页（路由 `/projects/:id/ai-log`，侧栏「AI 请求」）：统计 + 列表 + 展开看完整提示/响应/错误、复制、删除、清空本项目 |
| `components/ai/CharacterCardModal.tsx` | **一句话生成角色卡**：设定输入 → AI 产出结构化字段 → 表单逐项编辑 → `characterRepo.add` 创建人物并跳转详情（纯文本字段经 `textToHtmlParagraphs` 转富文本） |
| `components/ai/PolishModal.tsx` | **AI 润色弹窗（US-806）**：原文只读 + 润色方向 + 结果可编辑 + 行 diff 对比 +「替换选中」（onApply 返回 false=选区失效提示） |
| `components/rich/RichTextEditor.tsx` | 新增选区 API：`EditorSelection`、`RichTextEditorAPI`（getSelection/replaceSelectionWithText）、`RichTextEditorAPIRef`（普通对象避开 React19 RefObject 只读 current）；`onSelectionUpdate` 上报选区、`onSelectionChange` 回调 |
| `pages/ProjectListPage.tsx` | 首页项目列表 |
| `pages/project/ProjectWorkspace.tsx` | 项目内布局 + 侧栏模块导航（设置 URL: `/projects/:id/xxx`） |
| `pages/project/*Page.tsx` | Characters/Locations/Events/Outline/Writing/CharacterDetail/Overview/Settings/Timeline/Graph/**Foreshadowings**/Ideas/ModulePlaceholder（兜底） |
| `hooks/useProjectEntityList.ts` | `useProjectEntityList(repo, projectId)` → `{items, loaded, refresh}`（按项目订阅实体列表） |
| `stores/projectStore.ts` | 当前项目缓存（Zustand） |

## 3. 数据层约定

- 表：projects / characters / states(人物状态历史) / arcs(人物弧光) / relationships / locations / events / **outline_nodes** / **chapters** / chapter_versions / scenes / **foreshadowings**(S6) / **idea_fragments**(S6) / **backup_settings**(S7 新增，单条 id='auto'，存 FSA 目录句柄) / comments / prompt_templates / backup_metadata（后 2 个多为 Sprint 8+ 预留）。Dexie schema 已到 **version 2**（新增表无需 upgrade 迁移）；导出文件版本常量 `DB_VERSION` 仍为 1（数据格式未变）。
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
| 7 | AI 功能开放（US-801~804）、自动备份（US-702/703） | ✅（本轮） |
| 8 | 一致性/写作辅助/版本历史（US-501b,504,505,805） | ✅（本轮） |
| 9 | AI 审稿与移动端（US-806,805-LLM,902,903） | ✅（本轮） |
| 10 | 协作批注、DOCX/PDF 导出、体检报告（US-1001,701,新增） | ✅（Sprint 10） |
| 11（执行案外收尾） | US-205 大纲拖拽排序、US-1002 冲突检测与合并向导、体检报告 AI 解读 | ✅（本轮） |

## 6. 核心约定 / 待办（决策记录）

- **US-205 大纲拖拽排序（已交付）**：大纲树行整行可拖拽，行上缘 28%=插入到目标之前、下缘 28%=之后、中部=成为目标子节点；`computeOutlineMove` 防环（不能拖到自己后代下）+ 层级约束（`allowedChildTypes`：root→act/free、act→chapter/free/act、chapter→scene/free、scene→无子），非法放置给中文提示条；order 在目标同级内归一 0..n-1 后批量 `outlineRepo.update`。
- **US-1002 共享合并（已交付，执行案外）**：项目设置页「协作与合并」→ 选择外部导出的项目 JSON → `buildMergePlan` 按实体 id 比对 12 张表，分「远端新增 / 远端更新 / 本地更新 / 远端缺失」四类（含差异字段名与两端时间戳），向导默认只勾选远端新增与远端更新，应用时远端行 `projectId` 覆盖为当前项目；「远端缺失」勾选会删除本地记录，需手动确认。
- **AI 提示预览与请求历史（已交付）**：所有 AI 入口（梗概/小传/关系建议/润色/一致性深度检查/体检解读/角色卡）都提供「提示预览」——展示实际将发送的 system+user 提示，可就地编辑 user 内容后用「用此提示生成」发起请求（`runCustomPrompt`，kind 与所属项目照常记录）。每次请求都会写入 `ai_request_logs`（提示、响应、错误、耗时、模型、项目 id），历史在侧栏「AI 请求」页查看：状态统计、按时间倒序列表、展开看完整提示与响应、复制、单条删除、清空本项目（有确认）。日志存本机 IndexedDB，不随项目 JSON 导出，项目删除时级联清理。
- **一句话生成角色卡（已交付）**：人物页「AI 生成角色卡」→ 输入一句话设定（可加补充要求）→ `generateCharacterCard` 让模型输出固定 JSON（含 name/aliases/importance/gender/age/appearance/personalityTags/desire/flaw/background/abilities/notes/currentState），`parseCharacterCard` 容错解析后填入可编辑表单，确认后创建人物并进入详情页。生成上下文自动带项目 `genre`、世界观 `worldSetting.freeText`+tags、已有人物名（提示避免重名）。`currentState` 落库为 `{ time:{type:'fuzzy',value:'初始'}, state }`；外貌/背景/备注经 `textToHtmlParagraphs` 存为富文本。
- **全局搜索（已完善）**：顶栏入口 + `⌘K/Ctrl K` 快捷键；`services/search.ts` 纯函数计算（数据由面板打开时按需加载，关闭即释放，不全量常驻）。搜索范围默认当前项目，可切「全部项目」。结果按 `score` 排序：权重（项目名 6/名称标题 5/别名标签 3/正文 1）+ 命中位置（越靠前越高）。跳转：人物→人物详情页、章节→写作区 `?chapter=id`、批注→对应章节写作区，其余→对应模块列表页。
- **体检报告 AI 解读（已交付）**：体检页「AI 解读」把总分/等级/五维摘要/系统建议交给 LLM，输出总体诊断 + 优先事项 + 下一步（需先配置 AI 服务）。
- **版本历史（US-504 已交付）**：写作区编辑器头部「版本历史」入口。自动快照=保存后触发 `autoSnapshot`（内容未变或距上条自动版本 <2 分钟则跳过；自动版本上限 50 条，手动里程碑版本不裁剪）；弹窗左侧版本列表、右侧为该版本→当前正文的行 diff（+绿新增 / -红删除）；「回滚」会先把当前正文存为里程碑版本再恢复。首次进入可能还没有版本（写完一段并等待自动保存后出现）。
- **分屏参考（US-501b/505 已交付）**：写作区头部「分屏参考」开关，左面板展示本章关联设定——细纲概要、出场人物（含当前状态；细纲未标记时按正文提及人物名/别名兜底匹配）、地点（细纲 scene.locationId 或正文提及）、伏笔（本章埋设/回收 + 其它待回收提醒）、关键事件（细纲 keyEventIds）。
- **一致性检查（US-805 规则引擎+AI 语义已交付）**：路由 `/projects/:id/consistency`（侧栏「一致性检查」）。`services/consistency.ts` 纯函数规则：主角缺失、人物缺标签/欲望缺陷/当前状态、关系指向已删人物（error）、主要人物孤立、地点无描述、事件无时间/无参与者/引用不存在人物（error）、活跃伏笔无预期回收锚点（warn）、伏笔状态与大纲回收标记不一致（error）、活跃超 30 天、章节无正文/完成章字数不足目标 50%（warn）、大纲无分幕、细纲未展开正文。页面「AI 深度检查」→ `runDeepConsistencyCheck`：把人物清单+正文片段+伏笔+规则结果发给 LLM 做语义推断（人物已死仍出场/时间矛盾等），结果带紫色「AI 语义」徽标并入报告（id 前缀 `ai:`，不可跳转；category 白名单+「综合」兜底）。
- **AI 润色（US-806 已交付）**：写作区选中正文出现「AI 润色选中」→ PolishModal：原文只读、可选润色方向、结果可编辑、「与原文对比」行 diff（+绿/-红）、「替换选中」用 `editor.commands.insertContentAt` 回写（多段纯文本自动转 `<p>`），替换触发自动保存。选区失效时（内容已变）提示重新选中。未配置 AI 服务时按钮点击会报中文错误。
- **评论批注（US-1001 已交付）**：写作区章节头部「批注」按钮（显示未解决条数）打开面板；选中正文后「添加批注」会自动记录引用文本。`comments` 表（Sprint 0 已建，索引 `id, projectId, targetType, targetId, status`）挂 `targetType='chapter'`+`targetId=章节id`，`anchor` 存引用文本；支持回复（parentId）、解决/重开、删除（删根评论会连带删除其回复）；`deleteChapterCascade` 已级联清理章节批注。
- **故事体检报告（Sprint 10 新增用户故事已交付）**：路由 `/projects/:id/health`（侧栏「体检报告」），`services/health.ts` 纯函数计算：伏笔回收（回收率为主，缺锚点/超 30 天扣分）、人物弧光（主要人物 desire/flaw/弧光阶段/当前状态四项 25 分制）、时间线连贯（事件参与者/地点/非模糊时间占比）、设定一致性（严重 -8/提示 -3/提醒 -1）、章节进度（完成率 60% + 均字达标 40%）；加权总分 + 等级 + 去重建议（按维度低分优先）。
- **导出扩展（US-701 DOCX/PDF 已交付）**：写作区头部「导出 Word」→ `docx` 库生成（标题居中 + 每章另起页 + 首行缩进，动态 import 不拖首屏）；「导出 PDF」→ 生成 A4 排版打印 HTML 并 `window.print()`，在打印对话框选「另存为 PDF」（保留中文字体、零依赖）。Markdown 导出（Sprint 6）保持不变。
- **移动端（US-902/903 已交付基础版）**：ProjectWorkspace 在 `md` 以下把左侧栏换成内容顶部横向滚动 tab（全部模块可达）；查看类页面网格本就是 `grid-cols-1 sm/lg/xl` 响应式（人物/大纲/时间线可直接查看）；写作区窄屏布局改为列向堆叠（章节列表在上、编辑器在下），正文区 `overflow-wrap:anywhere` 防横向溢出，编辑器最小高度移动端降到 42vh（避免键盘遮挡）。时间线行为固定行高容器、内容 chips wrap，无整页横向滚动。
- **时间线（Sprint 5+6 已交付）**：路由 `/projects/:id/timeline`（TimelinePage）。全局=全部事件；顶部 Select 选人=角色时间线（该人物事件+`CharacterState` 状态变化合并）。筛选=人物/地点/类型 chips + **「伏笔节点」开关（US-602，sky 色节点）**。排序=compareFlexibleTime 类别段内序；**模糊/相对事件行右侧 ▲▼ 在同类段内移动**（写 `time.sortOrder`，首次移动自动归一 0..n-1）。虚拟滚动=react-window v2 `List`。事件编辑仍在事件页。
- **伏笔管理（Sprint 6 已交付）**：路由 `/projects/:id/foreshadowing`（ForeshadowingsPage）。列表状态筛选（全部/活跃/已回收/已废弃）+ 优先级/预期回收事件/相关人物展示；新建/编辑 Modal（描述必填；**预期回收事件**锚到事件 → 时间线节点）；删除走 `deleteForeshadowingCascade`（自动解除全部大纲节点 planted/resolved 引用）。大纲节点侧（OutlineNodeEditor）埋设/回收闭环仍可用。
- **Markdown 导出（US-701）**：写作页头部「导出 Markdown」→ `chaptersToMarkdown` 组装（# 作品名 + 元信息 + 按顺序各章 `## 标题` + 状态/字数 + htmlToMarkdown 正文）。htmlToMarkdown 支持子集：h1-6/p/strong/em/code/s/del/a/br/img/blockquote/ul/ol(嵌套)/hr/pre。DOCX/PDF 留 Sprint 10。
- **PWA/灵感碎片（US-901 简版）**：vite-plugin-pwa generateSW（autoUpdate，dist 产物 sw.js + registerSW.js + manifest.webmanifest；图标用 /favicon.svg 简版，未含 png 图标故移动端可能无安装提示——验收以离线可用为准）；灵感碎片页 `/projects/:id/ideas`（IdeaFragment: content/tags[]/kind:text，搜索、点标签筛选、删除）。
- **AI 层（Sprint 7 开放）**：Provider 抽象 + OpenAI 兼容实现（baseURL 可配，覆盖 DeepSeek/Moonshot/Ollama 等兼容端点；浏览器直连受 CORS 限制，跨域失败请自建代理并改 baseURL）。配置存 localStorage（`novel-creator.ai-config.v1`，含 API Key，仅本机），入口=项目设置页底部「AI 服务配置」（预设选择 + 测试连接）。生成任务统一走 `services/ai/tasks.ts` + `hooks/useAITask`（loading/错误/AbortController 取消）：US-802 五句话梗概（大纲页 LoglineCard「AI 生成」→ 可编辑 → `applySynopsis` 写 5 个 synopsis_item）、US-803 人物小传（人物详情页「AI 生成小传」→ 写入 background，纯文本经 `textToHtmlParagraphs` 转 `<p>`）、US-804 关系建议（关系图页「AI 关系建议」→ JSON 候选勾选 → 写入 relationships，按 sourceId<targetId 归一、已存在自动跳过）。
- **自动备份（US-702/703）**：File System Access API 选目录，句柄持久化到 `backup_settings`（IndexedDB 可结构化克隆），重开页面需重新授权写入；可选 AES-GCM（PBKDF2 100k）口令加密，口令存 localStorage（`novel-creator.backup-passphrase.v1`）；`useAutoBackup` 每 60s 检查间隔（默认 60 分钟）触发。恢复=选择备份文件（加密需口令）→ `importProjectFromJson(asNewProject=true)` 导入为副本，不覆盖现有数据。不支持 FSA 的浏览器（Firefox/Safari）自动备份禁用，仅能手动导出/恢复。
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

### 本轮（AI 粘贴填充写回）
- 新增：`components/ai/PasteImportModal.tsx`（通用粘贴导入弹窗）。
- 7 个 AI 入口（梗概/小传/关系建议/润色/一致性深度检查/体检解读/角色卡）的按钮区新增「粘贴填充」（与「AI 生成」「提示预览」并列），粘贴别处生成的内容 → 复用各自解析管线填为可编辑结果后照常落库：梗概自动拆五句（parseSynopsis）、角色卡/关系建议/深度检查解析 JSON（parseCharacterCard/parseRelationshipSuggestions/parseDeepConsistencyIssues，错误留在弹窗内可改后重试）、小传/润色/体检解读直接填充文本。
- 关系建议/深度检查/角色卡弹窗提供「填入示例」演示解析效果；梗概支持「开端：…」前缀或顺序无前缀两种格式。
- 粘贴不走内置 AI：不消耗 API、不写 ai_request_logs。

### 上轮（提示预览 + AI 请求留痕与历史页）
- 新增：`services/ai/prompts.ts`（提示构建层）、`services/ai/log.ts`（请求日志）、`components/ai/PromptPreviewModal.tsx`、`pages/project/AIHistoryPage.tsx`；db 升到 version 3 新增 `ai_request_logs` 表（`id, projectId, kind, createdAt`）。
- 重构：`services/ai/tasks.ts` 的 7 个任务改为「prompts.ts 构建提示 → runPrompt(带 meta) 执行并留痕」，新增 `runCustomPrompt`（供预览编辑后生成）；各任务 input 增加可选 `projectId` 用于日志归类。
- 接线：五句话梗概、人物小传、关系建议、润色、一致性深度检查、体检解读、角色卡 7 个入口全部增加「提示预览」（查看/编辑/复制/用此提示生成）；侧栏新增「AI 请求」历史页。
- 日志内容：完整 system+user 提示、响应全文、错误信息、耗时、模型、项目归属；状态 pending/ok/error/aborted（中止记为 aborted）。

### 上一轮（一句话生成角色卡）
- 新增：`components/ai/CharacterCardModal.tsx`；`services/ai/tasks.ts` 增 `generateCharacterCard` / `parseCharacterCard`（`CharacterCardDraft`）。
- 修改：`CharactersPage` 头部增「AI 生成角色卡」按钮，创建成功后刷新列表并跳转人物详情。
- 能力：一句话设定（+ 可选补充要求）→ AI 输出姓名/别名/重要度/性别/年龄/性格标签/核心欲望/致命缺陷/能力/外貌/背景故事/当前状态/备注；解析容错（```json 包裹、数组↔字符串互转、重要度白名单兜底 supporting）；生成后全部字段可编辑；上下文自动带入项目题材、世界观自由文本与已有人物名（避免重名）。

### 上一轮（全局搜索完善）
- 新增：`services/search.ts`、`components/search/GlobalSearchModal.tsx`；`AppLayout` 顶栏搜索框由「开发中」占位改为可用入口（桌面搜索框带 `⌘K/Ctrl K` 提示，小屏折叠为图标按钮），并注册 `Cmd/Ctrl+K` 全局快捷键。
- 能力：跨 9 类实体搜索（人物含别名/标签/欲望/缺陷/背景/当前状态，章节含正文纯文本，另有项目/地点/事件/伏笔/灵感/大纲/批注）；字段权重打分（名称 5 > 别名/标签 3 > 正文 1，命中位置靠前加分），同实体保留最佳字段命中；结果带类型徽标、命中字段、高亮片段；当前项目 / 全部项目范围切换；键盘 ↑↓ + Enter 打开 + Esc 关闭，选中项自动滚入可视区。

### 上一轮（执行案外 Backlog 收尾）
- 新增：`services/merge.ts`、`components/settings/MergeWizardModal.tsx`；`services/outline.ts` 增 `computeOutlineMove`/`applyOutlineMove`（US-205）；`services/ai/tasks.ts` 增 `explainHealthReport`。
- 修改：`OutlinePage` 树节点支持 HTML5 拖拽（上/下缘=同级前后、中部=成为子节点，落点高亮 + 层级约束报错提示）；`HealthReportPage` 增「AI 解读」；`ProjectSettingsPage` 增「协作与合并（US-1002）」面板与文件选择。
- 验收：大纲可拖拽调序与跨层；体检报告可让 AI 给出解读；设置页可选外部项目 JSON 逐项合并差异。

### Sprint 10（历史）
- 新增：`services/comments.ts`、`components/writing/CommentModal.tsx`、`services/health.ts`、`pages/project/HealthReportPage.tsx`、`services/exportDoc.ts`；依赖新增 `docx`（动态 import，独立 chunk）。
- 修改：`WritingPage` 头部增「批注」（带未解决数角标，选中文本可直接「添加批注」并记住引用）+「导出 Word」「导出 PDF」；`App.tsx`/`ProjectWorkspace` 增 `/projects/:id/health` 路由与侧栏入口；`deleteChapterCascade` 级联删除章节批注。
- Sprint 10 验收：正文可留批注（引用/回复/解决），写作区可导出 .docx 与打印 PDF，体检报告给出五维评分与建议。

### Sprint 9（历史）
- 新增：`components/ai/PolishModal.tsx`；`services/ai/tasks.ts` 增 `polishText`（US-806）与 `runDeepConsistencyCheck`/`parseDeepConsistencyIssues`（US-805 LLM）；`RichTextEditor` 增选区 API 与上报。
- 修改：`WritingPage` 接入「AI 润色选中」（选中文本后按钮出现，替换后自动保存）；`ConsistencyPage` 增「AI 深度检查」（紫色 AI 徽标问题并入报告列表，可停止）；`ProjectWorkspace` 移动端横向 tab 导航（md 以下）；`WritingPage` 写作布局窄屏列向堆叠（US-903）；`index.css` 正文长文本自动换行；编辑器 `minHeight` 移动端降低。
- Sprint 9 验收：选中正文可 AI 润色并对比/替换；一致性页可跑 AI 语义深度检查；手机可经横向导航查看人物/大纲/时间线并在写作区编辑。

### Sprint 8（历史）
- 新增：`utils/diff.ts`、`services/chapterVersions.ts`、`services/consistency.ts`、`components/writing/{ChapterVersionModal,ReferencePanel}.tsx`、`pages/project/ConsistencyPage.tsx`。
- 修改：`WritingPage` 接入自动快照（flush 后）+「版本历史」按钮 +「分屏参考」开关与左参考面板；`App.tsx` 注册 `consistency` 路由；`ProjectWorkspace` 侧栏加「一致性检查」。
- Sprint 8 验收：写作时可开关分屏参考看到本章关联人物/地点/伏笔；停笔自动保存产生版本，版本弹窗可看行差异并回滚；一致性检查页按错误/警告/提示统计并列出问题，可一键跳转处理。

### Sprint 7（历史）
- 新增：`services/ai/config.ts`（配置 localStorage + 4 个服务商预设）、`services/ai/tasks.ts`（US-802~804 生成与结果解析）、`services/backup.ts`（FSA 目录/AES-GCM 加密/写入与恢复）、`components/ai/{AIConfigPanel,SynopsisGeneratorModal,CharacterBioModal,RelationshipSuggestModal}.tsx`、`components/backup/BackupPanel.tsx`、`hooks/{useAITask,useAutoBackup}.ts`。
- 修改：`types/meta.ts` 增 `BackupSettings`；`db/database.ts` 增 **version(2)** 表 `backup_settings`（DB_VERSION 仍 1）；`db/repositories.ts` 增 `loadBackupSettings/saveBackupSettings`；`services/outline.ts` 增 `applySynopsis`；`ProjectSettingsPage` 底部接入 AI 配置与备份面板；`OutlinePage`/`CharacterDetailPage`/`RelationshipGraphPage` 各增 AI 入口；`ProjectWorkspace` 挂 `useAutoBackup`。
- Sprint 7 验收：项目设置页可保存 AI 配置并测试连接；大纲页 AI 生成五句话可编辑写入；人物详情页 AI 生成小传写入背景故事；关系图 AI 建议可勾选采纳（去重/归一）；备份面板可选目录、立即备份、加密口令、从备份文件恢复为副本。

### Sprint 6（历史）
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
