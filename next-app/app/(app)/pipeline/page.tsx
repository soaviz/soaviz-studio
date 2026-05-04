import { getProjectsWithProgress } from './actions'
import { PipelineClientShell } from './pipeline-client-shell'

export const dynamic = 'force-dynamic'

export default async function PipelinePage() {
  const projects = await getProjectsWithProgress()
  return <PipelineClientShell initialProjects={projects} />
}
