/**
 * 项目 Store（Zustand）：项目列表 / 当前项目 / 项目 CRUD
 * 当前仅承载项目管理状态；设定实体的数据在对应模块 Sprint 引入后，
 * 以同样的 Repository 方式接入（执行案 Epic 2 起）。
 */
import { create } from 'zustand'
import { projectRepo } from '@/db/repositories'
import type { Project, ProjectInput } from '@/types/project'
import { createEntity } from '@/utils/common'

interface ProjectStoreState {
  projects: Project[]
  loaded: boolean
  loading: boolean
  currentProjectId: string | null
  loadProjects: () => Promise<void>
  getProject: (id: string) => Project | undefined
  currentProject: () => Project | undefined
  setCurrentProject: (id: string | null) => void
  createProject: (input: ProjectInput) => Promise<Project>
  updateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => Promise<void>
  removeProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  loaded: false,
  loading: false,
  currentProjectId: null,

  async loadProjects() {
    set({ loading: true })
    try {
      const projects = await projectRepo.recent()
      set({ projects, loaded: true })
    } finally {
      set({ loading: false })
    }
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  currentProject: () => {
    const { projects, currentProjectId } = get()
    return projects.find((p) => p.id === currentProjectId)
  },

  setCurrentProject: (id) => set({ currentProjectId: id }),

  async createProject(input) {
    const base = createEntity<Project>('', {})
    const project: Project = {
      ...base,
      projectId: base.id, // 项目实体以自身 id 作为 projectId
      name: input.name.trim(),
      genre: input.genre?.trim() || '玄幻',
      penName: input.penName?.trim() || undefined,
      tagline: input.tagline?.trim() || undefined,
      template: input.template ?? 'blank',
      status: input.status ?? 'idea',
      tags: [],
      worldSetting: { freeText: '', tags: [] },
      timeSetting: { allowFuzzy: true },
      chapterDefaults: { targetWords: 3000, namingRule: '第X章 {标题}' },
      mode: 'guided',
    }
    const saved = await projectRepo.add(project)
    set((s) => ({
      projects: [saved, ...s.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    }))
    return saved
  },

  async updateProject(id, patch) {
    const updated = await projectRepo.update(id, patch)
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? updated : p)) }))
  },

  async removeProject(id) {
    await projectRepo.deleteCascade(id)
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      currentProjectId: s.currentProjectId === id ? null : s.currentProjectId,
    }))
  },
}))
