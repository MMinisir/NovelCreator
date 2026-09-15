# NovelCreator · 小说创作工作台

> 本地优先、方法论驱动的中文小说创作工具：**设定管理 + 大纲/时间线 + 一致性检查 + AI 辅助写作**，在一个工作台里完成从灵感到成稿。

纯前端应用，所有数据都保存在你自己的设备上（IndexedDB），**不需要服务器、不需要注册账号**。提供两种使用方式：

- **Web 版（PWA）**：浏览器打开即用，可安装到桌面、支持离线
- **Windows 桌面版**：单文件便携 exe，双击即用、免安装

---

## 功能特性

### 创作管理

| 模块 | 说明 |
| --- | --- |
| **项目** | 多项目并行，含创作模式、题材、目标章节数与字数预设 |
| **人物** | 结构化人物卡：姓名 / 别名 / 重要度 / 性别 / 年龄 / 外貌 / 性格标签 / 欲望 / 缺陷 / 背景 / 能力 / 当前状态 / 弧光阶段，并可按剧情推进记录人物状态变化 |
| **地点** | 世界观地点的描述与关联 |
| **事件** | 灵活时间（精确 / 模糊 / 相对）、重要度星级、参与人物与地点、**情节张力 1–5** |
| **大纲** | 多级树（分幕 → 章 → 场景 → 自由节点），整行拖拽排序，含层级约束与防环校验 |
| **伏笔** | 状态（活跃 / 已回收 / 已废弃）、优先级、预期回收事件锚点；与大纲节点「埋设 / 回收」形成闭环 |
| **灵感碎片** | 随手记录零散点子，需要时转正为正式设定 |

### 可视化与检查

- **时间线**：列表视图 + **甘特视图**（人物 / 地点泳道、活跃区间、**情节张力带**与峰值统计）；模糊时间可在同类段内手工微调顺序；超长列表虚拟滚动
- **关系图**：人物关系网络（cytoscape 交互式图谱）
- **一致性检查**：内置规则引擎（主角缺失、人物缺设定、关系指向已删人物、事件无时间/无参与者、伏笔无回收锚点、章节无正文……）叠加 **AI 深度语义检查**（如"人物已死亡却在后续章节再出场"）
- **故事体检报告**：伏笔回收 / 人物弧光 / 时间线连贯 / 设定一致性 / 章节进度 五维评分 → 总分、等级与可执行建议

### 写作体验

- **章节管理**：排序、状态（草稿 / 修订 / 完成）、目标字数与完成度
- **富文本正文编辑**（TipTap）：标题、加粗、列表、引用、水平线；**打字机模式**让光标行始终保持在视野中部
- **自动保存 + 版本历史**：自动快照（带节流与条数上限）+ 手动里程碑，版本间 **行级 diff 对比与一键回滚**
- **分屏参考**：写作时并排查看本章细纲、出场人物（含当前状态）、地点、伏笔、关键事件
- **批注**：选中正文添加批注、回复、解决 / 重开、仅看未解决
- **导出**：Markdown / Word（`.docx`，按需加载）/ PDF（A4 打印排版后另存为 PDF）
- **阅读舒适度**：界面字号与写作区字号可分别调节；左侧菜单可在桌面端收起为纯图标，且与内容区各自独立滚动

### AI 辅助（可选，自带 API Key）

兼容任意 **OpenAI 兼容接口**（OpenAI / DeepSeek / 通义 / 智谱 / Ollama 等，内置常用服务商预设），覆盖 10 类任务：

| 任务 | 说明 |
| --- | --- |
| 五句话梗概 | 由题材与一句话设定生成开端 / 发展 / 转折 / 高潮 / 结局 |
| 故事大纲 | 生成分幕与章节细纲，结构化预览可编辑后写入大纲树 |
| 章节正文 | 结合本章细纲、出场人物、上一章结尾续写正文 |
| 人物小传 | 依据人物卡与补充要求生成小传 |
| 人物关系建议 | 生成结构化关系候选并直接落库 |
| 角色卡 | 一句话设定 → 完整结构化角色卡 |
| 润色 | 选中正文润色，行 diff 对比后替换 |
| 一致性深度检查 | 语义级矛盾推断 |
| 体检解读 | 对体检报告做语义诊断与优先行动建议 |
| 自定义 | 在「提示词管理」中自定义模板扩展新任务用法 |

AI 使用透明可控：

- **提示预览**：发送前查看完整 system + user 提示，可就地改写后再生成
- **请求留痕**：「AI 请求」页记录每次请求的提示、响应、错误、耗时与模型
- **提示词管理**：系统提示与各任务提示均可在线编辑、恢复默认；支持新建自定义模板（`{{变量}}` 插值、`{{?变量}}…{{/变量}}` 条件块），并在任意生成入口选用
- **粘贴填充**：在别处（如网页版 AI）生成内容后可粘贴回填，复用同一套解析管线

### 数据与平台

- **本地优先**：数据存 IndexedDB，无云端、无账号，断网可用
- **导入导出**：项目 JSON 完整导出 / 导入
- **备份与恢复**：项目打开期间自动定时备份
- **共享合并**：选择他人导出的项目 JSON，按实体比对生成「远端新增 / 远端更新 / 本地更新 / 远端缺失」合并计划
- **全局搜索**：`Ctrl / Cmd + K` 跨 9 类实体检索（项目 / 人物 / 地点 / 事件 / 章节正文 / 伏笔 / 灵感 / 大纲 / 批注），字段权重打分 + 命中高亮 + 键盘导航
- **PWA**：可安装到桌面、离线可用
- **Windows 桌面版**：单文件便携 exe（Electron）

---

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 框架 | React 18 + TypeScript 5.7 |
| 构建 | Vite 6（`--mode electron` 切换桌面构建目标） |
| 样式 | Tailwind CSS 4 |
| 状态 | Zustand 5（+ immer） |
| 本地数据 | Dexie 4（IndexedDB） |
| 富文本 | TipTap 2 / ProseMirror |
| 图谱 | cytoscape 3 |
| 虚拟列表 | react-window 2 |
| 路由 | React Router 7（Web 用 Browser 路由，桌面用 Hash 路由） |
| 图标 | lucide-react |
| 导出 | docx 9（Word）+ 浏览器打印（PDF） |
| PWA | vite-plugin-pwa 1.3（Workbox） |
| 桌面封装 | Electron 44 + electron-builder 26 |

---

## 本地运行

**环境要求**：Node.js 20 或更高（建议 20 / 22 LTS）、npm。

```bash
git clone https://github.com/MMinisir/NovelCreator.git
cd NovelCreator
npm install
npm run dev        # 浏览器开发服务器（默认 http://localhost:5173）
```

桌面版开发（构建后启动 Electron 窗口）：

```bash
npm run electron:dev
```

### 可用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器（HMR） |
| `npm run build` | Web 生产构建 → `dist/`（含 PWA Service Worker） |
| `npm run preview` | 本地预览生产构建 |
| `npm run build:electron` | 桌面模式构建（相对资源路径、关闭 SW） |
| `npm run electron:dev` | 构建并启动桌面窗口 |
| `npm run dist:exe` | 一键打包 Windows 单文件便携版 exe |

---

## 打包说明

### Web 版（PWA）

```bash
npm run build      # 产物在 dist/，可直接部署到任意静态托管服务
```

### Windows 桌面版（单文件便携 exe）

```bash
npm run dist:exe                       # 0.1.4 → 0.1.5（自动升补丁号，日常用）
npm run dist:exe:minor                 # 0.1.4 → 0.2.0（有功能更新）
npm run dist:exe:major                 # 0.1.4 → 1.0.0（大版本）
npm run dist:exe -- --version=2.0.0    # 指定版本号
```

一条命令完成五步：

1. **自动升级版本号**（写回 `package.json`，并带入产物文件名）
2. 以 electron 模式构建前端（`tsc -b` + `vite build --mode electron`）
3. 用 electron-builder 打出 **单文件便携版**（在系统临时目录产出，不污染仓库）
4. 复制为 `release-desktop/NovelCreator-v<版本>.exe`（约 100 MB，**双击即用、免安装**）
5. **清理旧版本** exe 与历史 `release*` 产物目录

> 默认仅产出当前平台的 Windows x64 便携版。如需 NSIS 安装包或 macOS / Linux 产物，可在 `package.json` 的 `build.win.target` 中调整，或补充对应平台配置。

---

## 目录结构

```
src/
├── components/          # UI 组件（ai / layout / people / outline / timeline / writing / rich / search …）
│   └── ui.tsx           # 统一 UI 原语（Button / Input / Field / Modal / Badge …）
├── db/                  # Dexie 数据库与仓储（database.ts / repositories.ts）
├── hooks/               # useAITask / useAutoBackup / useProjectEntityList
├── pages/               # 页面（ProjectListPage / AppSettingsPage / PromptTemplatesPage / project/*）
├── services/            # 领域服务
│   ├── ai/              # 提示构建 prompts / 模板层 templates / 执行与解析 tasks / 配置 config / 留痕 log
│   ├── consistency.ts   # 一致性规则引擎
│   ├── health.ts        # 故事体检评分
│   ├── outline.ts       # 大纲树操作
│   ├── search.ts        # 全局搜索
│   ├── exportDoc.ts     # Word / PDF 导出
│   ├── backup.ts        # 备份与恢复
│   ├── exportImport.ts  # 项目导入导出
│   ├── merge.ts         # 共享合并
│   └── chapterVersions.ts / comments.ts
├── stores/              # Zustand（projectStore / settingsStore）
├── types/               # 领域类型定义
└── utils/               # 时间、文本、diff、markdown 等纯函数

electron/main.cjs            # 桌面主进程
scripts/build-desktop.mjs    # 一键打包脚本
docs/PROJECT_MEMORY.md       # 开发速查（架构与约定，改代码前建议先读）
docs/设计文档.md              # 需求与设计
```

---

## 数据与隐私

- 所有项目数据保存在本机 IndexedDB。桌面版数据目录为 `%APPDATA%\NovelCreator`，与浏览器版数据相互独立
- 不采集任何统计数据，不向第三方上传数据
- AI 功能为**可选**：需在「设置 → AI 服务」中自行填写服务商地址与 API Key；密钥仅存本机，请求由你的浏览器 / 桌面端直接发往你配置的服务商
- 建议定期使用「项目设置 → 导出」或「备份」留存副本

---

## 开发约定

- 分层：`pages`（页面组装）→ `components`（展示与交互）→ `services`（领域逻辑，纯函数优先）→ `db`（持久化）
- 类型集中在 `src/types`；路径别名 `@` 指向 `src`
- 关键约定与历史决策记录在 `docs/PROJECT_MEMORY.md`
- `npm run build` 必须零 TypeScript 错误

---

## 许可证

[MIT](./LICENSE) © 2026 MMinisir
