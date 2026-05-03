import { redirect } from 'next/navigation'

/**
 * /personas is no longer part of Soaviz Studio.
 * Soaviz Studio = 영상 제작 전용 SaaS OS
 * Personas belong to Sovita (separate project).
 */
export default function PersonasRedirect() {
  redirect('/pipeline')
}
