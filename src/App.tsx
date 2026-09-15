import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import ProjectListPage from '@/pages/ProjectListPage'
import PromptTemplatesPage from '@/pages/PromptTemplatesPage'
import AppSettingsPage from '@/pages/AppSettingsPage'
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
import RelationshipGraphPage from '@/pages/project/RelationshipGraphPage'
import TimelinePage from '@/pages/project/TimelinePage'
import ForeshadowingsPage from '@/pages/project/ForeshadowingsPage'
import IdeasPage from '@/pages/project/IdeasPage'
import ConsistencyPage from '@/pages/project/ConsistencyPage'
import HealthReportPage from '@/pages/project/HealthReportPage'
import AIHistoryPage from '@/pages/project/AIHistoryPage'

/** 路由结构（设计文档 §6.1 导航：项目 -> 人物/地点/事件/大纲/时间线/关系图/伏笔/写作/灵感/设置） */
export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects" element={<ProjectListPage />} />
        <Route path="prompts" element={<PromptTemplatesPage />} />
        <Route path="settings" element={<AppSettingsPage />} />
        <Route path="projects/:projectId" element={<ProjectWorkspace />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="characters" element={<CharactersPage />} />
          <Route path="characters/:characterId" element={<CharacterDetailPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="outline" element={<OutlinePage />} />
          <Route path="writing" element={<WritingPage />} />
          <Route path="graph" element={<RelationshipGraphPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="foreshadowing" element={<ForeshadowingsPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="consistency" element={<ConsistencyPage />} />
          <Route path="health" element={<HealthReportPage />} />
          <Route path="ai-log" element={<AIHistoryPage />} />
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path=":module" element={<ModulePlaceholderPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  )
}
