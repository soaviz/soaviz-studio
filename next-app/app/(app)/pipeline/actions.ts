'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type ProjectFormat = 'film' | 'short' | 'series' | 'mv' | 'ad'

export interface CreateProjectInput {
  title: string
  format: ProjectFormat
  genre: string
  logline: string
  color: string
}

export async function createProject(input: CreateProjectInput) {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      title: input.title,
      status: 'draft',
      metadata: {
        format: input.format,
        genre: input.genre,
        logline: input.logline,
        color: input.color,
      },
    })
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/pipeline')
  return { id: data.id }
}

export async function getProjects() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (error) return []
  return data
}

// ─── 진행률 포함 프로젝트 목록 ────────────────────────────────────────────────

export interface SceneStat {
  total: number
  done: number    // status: 'locked' | 'done'
  locked: number
}

export type ProjectWithProgress = Awaited<ReturnType<typeof getProjects>>[number] & {
  sceneStat: SceneStat
}

export async function getProjectsWithProgress(): Promise<ProjectWithProgress[]> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return []

  // 쿼리 1: 프로젝트 목록
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })

  if (pErr || !projects?.length) return []

  const projectIds = projects.map(p => p.id)

  // 쿼리 2: 씬 상태 집계 (id, project_id, status만 가져옴)
  const { data: scenes } = await supabase
    .from('scenes')
    .select('id, project_id, status')
    .in('project_id', projectIds)
    .eq('user_id', user.id)
    .eq('archived', false)

  // JS 집계
  const statMap: Record<string, SceneStat> = {}
  for (const s of scenes ?? []) {
    if (!statMap[s.project_id]) statMap[s.project_id] = { total: 0, done: 0, locked: 0 }
    const stat = statMap[s.project_id]
    stat.total++
    if (s.status === 'done')   stat.done++
    if (s.status === 'locked') stat.locked++
  }

  return projects.map(p => ({
    ...p,
    sceneStat: statMap[p.id] ?? { total: 0, done: 0, locked: 0 },
  }))
}
