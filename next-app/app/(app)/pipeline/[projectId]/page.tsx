import { notFound } from 'next/navigation'
import { getProjectDetail, getEpisodes } from './actions'
import { ProjectDetailShell } from './project-detail-shell'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ projectId: string }>
}

export default async function ProjectDetailPage({ params }: Props) {
  const { projectId } = await params
  const [project, episodes] = await Promise.all([
    getProjectDetail(projectId),
    getEpisodes(projectId),
  ])
  if (!project) notFound()
  return <ProjectDetailShell project={project} initialEpisodes={episodes} />
}
