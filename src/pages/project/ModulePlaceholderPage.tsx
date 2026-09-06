import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Hammer } from 'lucide-react'
import { EmptyState } from '@/components/ui'

/** 未知模块兜底（各功能模块已陆续交付，此页仅在误导航时出现） */
export default function ModulePlaceholderPage() {
  const { module } = useParams<{ module: string }>()
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
        title="模块不存在"
        description={module ? `「${module}」不是有效的功能模块，请从左侧导航选择。` : '请从左侧导航选择功能模块。'}
      />
    </div>
  )
}
