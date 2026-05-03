/**
 * Supabase Database 타입 정의
 *
 * 실제 스키마 기반 타입을 자동 생성하려면:
 *   npx supabase gen types typescript --project-id yfzhvuyrdabpzowprupa > types/database.ts
 *
 * 또는 로컬 Supabase 사용 시:
 *   npx supabase gen types typescript --local > types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string | null
          nickname: string | null
          avatar_url: string | null
          onboarded_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          nickname?: string | null
          avatar_url?: string | null
          onboarded_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string | null
          nickname?: string | null
          avatar_url?: string | null
          onboarded_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      personas: {
        Row: {
          id: string
          user_id: string
          name: string
          slug: string
          tagline: string | null
          backstory: string | null
          mbti: string | null
          element_code: string | null
          genre: string | null
          avatar_url: string | null
          description: string | null
          voice_config: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          name: string
          slug: string
          tagline?: string | null
          backstory?: string | null
          mbti?: string | null
          element_code?: string | null
          genre?: string | null
          avatar_url?: string | null
          description?: string | null
          voice_config?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          slug?: string
          tagline?: string | null
          backstory?: string | null
          mbti?: string | null
          element_code?: string | null
          genre?: string | null
          avatar_url?: string | null
          description?: string | null
          voice_config?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'personas_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      projects: {
        Row: {
          id: string
          user_id: string
          title: string
          status: 'draft' | 'in_progress' | 'published' | 'archived'
          metadata: Json | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          status?: 'draft' | 'in_progress' | 'published' | 'archived'
          metadata?: Json | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          status?: 'draft' | 'in_progress' | 'published' | 'archived'
          metadata?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'projects_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// 편의용 타입 헬퍼
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
