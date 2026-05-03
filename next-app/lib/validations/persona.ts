import { z } from 'zod'

export const MBTI_LIST = [
  'INTJ','INTP','ENTJ','ENTP',
  'INFJ','INFP','ENFJ','ENFP',
  'ISTJ','ISFJ','ESTJ','ESFJ',
  'ISTP','ISFP','ESTP','ESFP',
] as const

export const ELEMENT_LIST = [
  { code: 'fire',  label: '🔥 불', color: '#F97316' },
  { code: 'water', label: '💧 물', color: '#38BDF8' },
  { code: 'earth', label: '🌿 흙', color: '#86EFAC' },
  { code: 'air',   label: '🌬 바람', color: '#C4B5FD' },
  { code: 'void',  label: '🌑 공허', color: '#6B7280' },
] as const

export const GENRE_LIST = [
  'lifestyle', 'beauty', 'fashion', 'gaming',
  'music', 'art', 'tech', 'wellness',
  'food', 'travel', 'education', 'comedy',
] as const

export const personaIdentitySchema = z.object({
  name: z
    .string()
    .min(1, '이름을 입력해 주세요.')
    .max(30, '30자 이내로 입력해 주세요.'),

  slug: z
    .string()
    .min(2, '슬러그는 최소 2자 이상이어야 합니다.')
    .max(30, '30자 이내로 입력해 주세요.')
    .regex(/^[a-z0-9-]+$/, '소문자, 숫자, 하이픈(-)만 사용 가능합니다.')
    .refine(v => !v.startsWith('-') && !v.endsWith('-'), '하이픈으로 시작하거나 끝날 수 없습니다.'),

  tagline: z
    .string()
    .max(60, '60자 이내로 입력해 주세요.')
    .optional()
    .or(z.literal('')),

  backstory: z
    .string()
    .max(500, '500자 이내로 입력해 주세요.')
    .optional()
    .or(z.literal('')),

  mbti: z
    .enum(MBTI_LIST)
    .optional()
    .or(z.literal('')),

  element_code: z
    .enum(['fire', 'water', 'earth', 'air', 'void'] as const)
    .optional()
    .or(z.literal('')),

  genre: z
    .enum(GENRE_LIST)
    .optional()
    .or(z.literal('')),



  avatar_url: z
    .string()
    .url('올바른 URL을 입력해 주세요.')
    .optional()
    .or(z.literal('')),
})

export type PersonaIdentityValues = z.infer<typeof personaIdentitySchema>

export const defaultPersonaIdentity: PersonaIdentityValues = {
  name: '',
  slug: '',
  tagline: '',
  backstory: '',
  mbti: '',
  element_code: '',
  genre: '',
  avatar_url: '',
}

/** name → slug 자동 변환 */
export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 30)
}
