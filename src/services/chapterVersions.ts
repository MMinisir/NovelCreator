import { chapterRepo, chapterVersionRepo } from '@/db/repositories'
import { isoNow, uid } from '@/utils/common'
import { countWords } from '@/utils/text'
import type { Chapter } from '@/types/chapter'
import type { ChapterVersion } from '@/types/chapter'

/**
 * 章节版本历史（Sprint 8 US-504）。
 * 自动快照：内容变化且距上一条自动版本超过阈值才写入（避免高频写作产生海量版本）；
 * 手动版本：带 label，永不自动裁剪；自动版本最多保留 MAX_AUTO_KEEP 条。
 */

/** 自动快照最小间隔（毫秒） */
const AUTO_MIN_INTERVAL = 2 * 60_000
/** 自动版本保留上限 */
const MAX_AUTO_KEEP = 50

type StoredVersion = ChapterVersion & { projectId: string }

function sortDesc(list: StoredVersion[]): StoredVersion[] {
  return [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

export async function listVersions(chapterId: string): Promise<StoredVersion[]> {
  return sortDesc(await chapterVersionRepo.listByChapter(chapterId))
}

async function addVersion(chapter: Chapter, label?: string): Promise<void> {
  await chapterVersionRepo.add({
    id: uid(),
    chapterId: chapter.id,
    projectId: chapter.projectId,
    content: chapter.content,
    savedAt: isoNow(),
    label,
  })
  await trimAutoVersions(chapter.id)
}

/** 裁剪多余的自动版本（保留最近 MAX_AUTO_KEEP 条，手动版本不动） */
async function trimAutoVersions(chapterId: string): Promise<void> {
  const all = sortDesc(await chapterVersionRepo.listByChapter(chapterId))
  const auto = all.filter((v) => !v.label)
  if (auto.length <= MAX_AUTO_KEEP) return
  for (const v of auto.slice(MAX_AUTO_KEEP)) {
    await chapterVersionRepo.remove(v.id)
  }
}

/** 写入一条手动标记版本 */
export async function saveManualVersion(chapter: Chapter, label: string): Promise<void> {
  await addVersion(chapter, label.trim() || '手动保存')
}

/** 自动快照（内容未变或与上条自动版本间隔太短时跳过） */
export async function autoSnapshot(chapter: Chapter): Promise<void> {
  if (!chapter.content?.trim()) return
  const versions = await listVersions(chapter.id)
  const latest = versions[0]
  if (latest && latest.content === chapter.content) return
  if (latest && !latest.label && Date.now() - new Date(latest.savedAt).getTime() < AUTO_MIN_INTERVAL) return
  await addVersion(chapter)
}

/** 回滚到指定版本：回滚前先把当前正文存为手动版本，避免内容丢失；返回恢复后的正文 */
export async function restoreVersion(chapter: Chapter, versionId: string): Promise<string> {
  const versions = await chapterVersionRepo.listByChapter(chapter.id)
  const target = versions.find((v) => v.id === versionId)
  if (!target) throw new Error('版本不存在或已被清理')
  if (target.content !== chapter.content) {
    await addVersion(chapter, '回滚前自动保存')
  }
  await chapterRepo.update(chapter.id, {
    content: target.content,
    wordCount: countWords(target.content),
  })
  return target.content
}
