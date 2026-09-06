import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Hammer } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/** 各功能模块占位页：标注规划中的 Sprint（依据执行案迭代计划） */
const MODULE_PLAN: Record<string, { title: string; sprint: string; stories: string[] }> = {
  timeline: {
    title: '时间线',
    sprint: 'Sprint 5',
    stories: ['US-301 全局时间线（虚拟滚动 2000 事件）', 'US-302 筛选', 'US-304 角色时间线'],
  },
  graph: {
    title: '人物关系图',
    sprint: 'Sprint 4',
    stories: ['US-401 力导向图（500 节点流畅）', 'US-402 点击详情/双击聚焦', 'US-403 导出 PNG/SVG'],
  },
  foreshadowing: {
    title: '伏笔管理',
    sprint: 'Sprint 6',
    stories: ['US-601 伏笔手动标记', 'US-602 时间线伏笔节点'],
  },
  ideas: {
    title: '灵感碎片',
    sprint: 'Sprint 6',
    stories: ['US-901 文本灵感速记（PWA 离线可用）'],
  },
}

export default function ModulePlaceholderPage() {
  const { module } = useParams<{ module: string }>()
  const plan = module ? MODULE_PLAN[module] : undefined

  return (
    <div>
      <Link
        to=".."
        relative="path"
        className="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-violet-700"
      >
        <ArrowLeft className="size-4" /> 返回概览
      </Link>
      <EmptyState
        icon={<Hammer className="size-6" />}
        title={plan ? `${plan.title} · 规划中` : '模块不存在'}
        description={
          plan
            ? `该模块计划在 ${plan.sprint} 交付：${plan.stories.join('、')}。当前进行中的是 Sprint 0/1（项目管理与本地存储）。`
            : '请从左侧导航选择功能模块。'
        }
      />
    </div>
  )
}
