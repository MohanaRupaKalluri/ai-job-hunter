export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      applications: {
        Row: {
          applied_at: string | null
          cover_letter_document_id: string | null
          created_at: string
          id: string
          interview_at: string | null
          job_id: string
          notes: string | null
          offer_at: string | null
          rejected_at: string | null
          resume_document_id: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          cover_letter_document_id?: string | null
          created_at?: string
          id?: string
          interview_at?: string | null
          job_id: string
          notes?: string | null
          offer_at?: string | null
          rejected_at?: string | null
          resume_document_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          cover_letter_document_id?: string | null
          created_at?: string
          id?: string
          interview_at?: string | null
          job_id?: string
          notes?: string | null
          offer_at?: string | null
          rejected_at?: string | null
          resume_document_id?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          careers_url: string
          created_at: string
          id: string
          last_scrape_status: string | null
          last_scraped_at: string | null
          name: string
          notes: string | null
          tracking_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          careers_url: string
          created_at?: string
          id?: string
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          name: string
          notes?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          careers_url?: string
          created_at?: string
          id?: string
          last_scrape_status?: string | null
          last_scraped_at?: string | null
          name?: string
          notes?: string | null
          tracking_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_documents: {
        Row: {
          content_preview: string | null
          created_at: string
          format: string
          id: string
          job_id: string | null
          kind: Database["public"]["Enums"]["document_kind"]
          storage_path: string
          user_id: string
        }
        Insert: {
          content_preview?: string | null
          created_at?: string
          format?: string
          id?: string
          job_id?: string | null
          kind: Database["public"]["Enums"]["document_kind"]
          storage_path: string
          user_id: string
        }
        Update: {
          content_preview?: string | null
          created_at?: string
          format?: string
          id?: string
          job_id?: string | null
          kind?: Database["public"]["Enums"]["document_kind"]
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_matches: {
        Row: {
          category: Database["public"]["Enums"]["match_category"] | null
          created_at: string
          experience_score: number
          id: string
          job_id: string
          location_score: number
          matched_skills: string[]
          missing_skills: string[]
          overall_score: number
          rationale: string | null
          resume_score: number
          skill_score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["match_category"] | null
          created_at?: string
          experience_score?: number
          id?: string
          job_id: string
          location_score?: number
          matched_skills?: string[]
          missing_skills?: string[]
          overall_score?: number
          rationale?: string | null
          resume_score?: number
          skill_score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["match_category"] | null
          created_at?: string
          experience_score?: number
          id?: string
          job_id?: string
          location_score?: number
          matched_skills?: string[]
          missing_skills?: string[]
          overall_score?: number
          rationale?: string | null
          resume_score?: number
          skill_score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_matches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          apply_url: string
          company_id: string | null
          company_name: string
          created_at: string
          description: string | null
          discovered_at: string
          employment_type: string | null
          external_id: string | null
          id: string
          location: string | null
          posted_date: string | null
          source_url: string | null
          title: string
          user_id: string
        }
        Insert: {
          apply_url: string
          company_id?: string | null
          company_name: string
          created_at?: string
          description?: string | null
          discovered_at?: string
          employment_type?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          posted_date?: string | null
          source_url?: string | null
          title: string
          user_id: string
        }
        Update: {
          apply_url?: string
          company_id?: string | null
          company_name?: string
          created_at?: string
          description?: string | null
          discovered_at?: string
          employment_type?: string | null
          external_id?: string | null
          id?: string
          location?: string | null
          posted_date?: string | null
          source_url?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          current_resume_url: string | null
          daily_digest_enabled: boolean
          desired_roles: string[]
          email: string | null
          full_name: string | null
          github_url: string | null
          id: string
          linkedin_url: string | null
          onboarded: boolean
          phone: string | null
          portfolio_url: string | null
          preferred_locations: string[]
          remote_preference: Database["public"]["Enums"]["remote_preference"]
          salary_currency: string | null
          salary_max: number | null
          salary_min: number | null
          skills: string[]
          updated_at: string
          visa_sponsorship_required: boolean
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          current_resume_url?: string | null
          daily_digest_enabled?: boolean
          desired_roles?: string[]
          email?: string | null
          full_name?: string | null
          github_url?: string | null
          id: string
          linkedin_url?: string | null
          onboarded?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_locations?: string[]
          remote_preference?: Database["public"]["Enums"]["remote_preference"]
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          updated_at?: string
          visa_sponsorship_required?: boolean
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          current_resume_url?: string | null
          daily_digest_enabled?: boolean
          desired_roles?: string[]
          email?: string | null
          full_name?: string | null
          github_url?: string | null
          id?: string
          linkedin_url?: string | null
          onboarded?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_locations?: string[]
          remote_preference?: Database["public"]["Enums"]["remote_preference"]
          salary_currency?: string | null
          salary_max?: number | null
          salary_min?: number | null
          skills?: string[]
          updated_at?: string
          visa_sponsorship_required?: boolean
          years_experience?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      application_status:
        | "found"
        | "resume_generated"
        | "cover_letter_generated"
        | "applied"
        | "interview"
        | "rejected"
        | "offer"
      document_kind: "resume" | "cover_letter"
      match_category: "excellent" | "strong" | "moderate" | "weak"
      remote_preference: "remote" | "hybrid" | "onsite" | "any"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "found",
        "resume_generated",
        "cover_letter_generated",
        "applied",
        "interview",
        "rejected",
        "offer",
      ],
      document_kind: ["resume", "cover_letter"],
      match_category: ["excellent", "strong", "moderate", "weak"],
      remote_preference: ["remote", "hybrid", "onsite", "any"],
    },
  },
} as const
