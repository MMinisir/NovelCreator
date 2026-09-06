import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Hammer } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/** 各功能模块占位页：标注规划中的 Sprint（依据执行案迭代计划） */
const MODULE_PLAN: Record<string, { title: string; sprint: string; stories: string[] }> = {
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
            ? `该模块计划在 ${plan.sprint} 交付：${plan.stories.join('、')}。`
            : '请从左侧导航选择功能模块。'
        }
      />
    </div>
  )
}
