import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import ProjectListPage from '@/pages/ProjectListPage'
import ProjectWorkspace from '@/pages/project/ProjectWorkspace'
import ProjectOverviewPage from '@/pages/project/ProjectOverviewPage'
import ProjectSettingsPage from '@/pages/project/ProjectSettingsPage'
import ModulePlaceholderPage from '@/pages/project/ModulePlaceholderPage'
import CharactersPage from '@/pages/project/CharactersPage'
import CharacterDetailPage from '@/pages/project/CharacterDetailPage'
import LocationsPage from '@/pages/project/LocationsPage'
import EventsPage from '@/pages/project/EventsPage'
import OutlinePage from '@/pages/project/OutlinePage'
import WritingPage from '@/pages/project/WritingPage'

/** 路由结构（设计文档 §6.1 导航：项目 -> 人物/地点/事件/大纲/时间线/关系图/伏笔/写作/灵感/设置） */
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="projects/:projectId" element={<ProjectWorkspace />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="characters/:characterId" element={<CharacterDetailPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="outline" element={<OutlinePage />} />
          <Route path="writing" element={<WritingPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path=":module" element={<ModulePlaceholderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  )
}
