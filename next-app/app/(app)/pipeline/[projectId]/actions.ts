'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { nanoid } from 'nanoid'

// ─── helpers ──────────────────────────────────────────────────────────────────

async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  return { supabase, user }
}

// ─── project ──────────────────────────────────────────────────────────────────

export async function getProjectDetail(projectId: string) {
  const { supabase, user } = await requireUser()
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .single()
  return data
}

// ─── episodes ─────────────────────────────────────────────────────────────────

export async function getEpisodes(projectId: string) {
  const { supabase, user } = await requireUser()
  const { data } = await supabase
    .from('episodes')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .eq('archived', false)
    .order('number', { ascending: true })
  return data ?? []
}

export async function createEpisode(projectId: string) {
  const { supabase, user } = await requireUser()

  // 다음 번호 계산
  const { count } = await supabase
    .from('episodes')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('archived', false)

  const nextNumber = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('episodes')
    .insert({
      id: nanoid(),
      user_id: user.id,
      project_id: projectId,
      number: nextNumber,
      title: `에피소드 ${nextNumber}`,
      status: 'draft',
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/pipeline/${projectId}`)
  return { episode: data }
}

export async function updateEpisodeTitle(episodeId: string, title: string, projectId: string) {
  const { supabase, user } = await requireUser()
  await supabase
    .from('episodes')
    .update({ title })
    .eq('id', episodeId)
    .eq('user_id', user.id)
  revalidatePath(`/pipeline/${projectId}`)
}

// ─── scenes ───────────────────────────────────────────────────────────────────

export async function getScenes(episodeId: string) {
  const { supabase, user } = await requireUser()
  const { data } = await supabase
    .from('scenes')
    .select('*')
    .eq('episode_id', episodeId)
    .eq('user_id', user.id)
    .eq('archived', false)
    .order('number', { ascending: true })
  return data ?? []
}

export async function createScene(projectId: string, episodeId: string) {
  const { supabase, user } = await requireUser()

  const { count } = await supabase
    .from('scenes')
    .select('id', { count: 'exact', head: true })
    .eq('episode_id', episodeId)
    .eq('archived', false)

  const nextNumber = (count ?? 0) + 1

  const { data, error } = await supabase
    .from('scenes')
    .insert({
      id: nanoid(),
      user_id: user.id,
      project_id: projectId,
      episode_id: episodeId,
      number: nextNumber,
      heading: `S${String(nextNumber).padStart(2, '0')} — 새 씬`,
      status: 'draft',
    })
    .select()
    .single()

  if (error) return { error: error.message }
  revalidatePath(`/pipeline/${projectId}`)
  return { scene: data }
}
