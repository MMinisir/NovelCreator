/** 事件类型与配色（事件页 / 时间线 / 角色时间线共用） */
export const EVENT_TYPES = ['主线', '支线', '日常', '战斗', '感情', '转折', '伏笔', '回收', '其他'] as const

export const EVENT_TYPE_STYLE: Record<string, string> = {
  主线: 'bg-violet-100 text-violet-700',
  支线: 'bg-sky-100 text-sky-700',
  日常: 'bg-stone-100 text-stone-600',
  战斗: 'bg-red-100 text-red-700',
  感情: 'bg-rose-100 text-rose-700',
  转折: 'bg-amber-100 text-amber-700',
  伏笔: 'bg-orange-100 text-orange-700',
  回收: 'bg-emerald-100 text-emerald-700',
  其他: 'bg-stone-100 text-stone-600',
}
