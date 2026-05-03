'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { personaIdentitySchema } from '@/lib/validations/persona'

export async function createPersona(data: unknown) {
  const parsed = personaIdentitySchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값을 확인해 주세요.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: '로그인이 필요합니다.' }

  const v = parsed.data

  // slug 중복 확인
  const { data: existing } = await supabase
    .from('personas')
    .select('id')
    .eq('slug', v.slug)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return { error: `슬러그 "@${v.slug}"는 이미 사용 중입니다.` }
  }

  const { data: persona, error } = await supabase
    .from('personas')
    .insert({
      user_id: user.id,
      name: v.name,
      slug: v.slug,
      tagline: v.tagline || null,
      backstory: v.backstory || null,
      mbti: v.mbti || null,
      element_code: v.element_code || null,
      genre: v.genre || null,
      avatar_url: v.avatar_url || null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  redirect(`/personas/${persona.id}`)
}
