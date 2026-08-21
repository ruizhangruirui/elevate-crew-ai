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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      access_users: {
        Row: {
          created_at: string
          id: string
          name: string
          role_label: string
          scope: string[]
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          role_label: string
          scope?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          role_label?: string
          scope?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      actions: {
        Row: {
          completed_at: string | null
          created_at: string
          detail: string | null
          due_on: string | null
          id: string
          org_node_id: string | null
          owner: string | null
          person_id: string | null
          priority: string
          role_id: string | null
          source_key: string | null
          source_kind: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          org_node_id?: string | null
          owner?: string | null
          person_id?: string | null
          priority?: string
          role_id?: string | null
          source_key?: string | null
          source_kind?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          detail?: string | null
          due_on?: string | null
          id?: string
          org_node_id?: string | null
          owner?: string | null
          person_id?: string | null
          priority?: string
          role_id?: string | null
          source_key?: string | null
          source_kind?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_org_node_id_fkey"
            columns: ["org_node_id"]
            isOneToOne: false
            referencedRelation: "org_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          detail: string | null
          entity: string | null
          id: string
          person_id: string | null
        }
        Insert: {
          action: string
          actor?: string
          created_at?: string
          detail?: string | null
          entity?: string | null
          id?: string
          person_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          detail?: string | null
          entity?: string | null
          id?: string
          person_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      capability_snapshots: {
        Row: {
          activities_90d: number
          blank_caps: number
          coverage_rate: number
          covered_caps: number
          created_at: string
          id: string
          onboard_people: number
          scope_node_id: string | null
          single_caps: number
          taken_on: string
          target_seats: number
          total_caps: number
        }
        Insert: {
          activities_90d?: number
          blank_caps?: number
          coverage_rate?: number
          covered_caps?: number
          created_at?: string
          id?: string
          onboard_people?: number
          scope_node_id?: string | null
          single_caps?: number
          taken_on?: string
          target_seats?: number
          total_caps?: number
        }
        Update: {
          activities_90d?: number
          blank_caps?: number
          coverage_rate?: number
          covered_caps?: number
          created_at?: string
          id?: string
          onboard_people?: number
          scope_node_id?: string | null
          single_caps?: number
          taken_on?: string
          target_seats?: number
          total_caps?: number
        }
        Relationships: [
          {
            foreignKeyName: "capability_snapshots_scope_node_id_fkey"
            columns: ["scope_node_id"]
            isOneToOne: false
            referencedRelation: "org_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      config_items: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      directions: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          org_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          org_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "directions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_activities: {
        Row: {
          capability_tags: string[]
          created_at: string
          direction_id: string | null
          duration_minutes: number | null
          happened_on: string
          host: string | null
          id: string
          kind: string
          link: string | null
          note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          capability_tags?: string[]
          created_at?: string
          direction_id?: string | null
          duration_minutes?: number | null
          happened_on?: string
          host?: string | null
          id?: string
          kind?: string
          link?: string | null
          note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          capability_tags?: string[]
          created_at?: string
          direction_id?: string | null
          duration_minutes?: number | null
          happened_on?: string
          host?: string | null
          id?: string
          kind?: string
          link?: string | null
          note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_activities_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_activity_participants: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          person_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          person_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_activity_participants_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "org_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_activity_participants_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      org_nodes: {
        Row: {
          archived: boolean
          created_at: string
          id: string
          mission: string | null
          name: string
          parent_id: string | null
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          id: string
          mission?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          id?: string
          mission?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tagline: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tagline?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tagline?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          assessed_at: string | null
          assessed_by: string | null
          assessed_skills: Json
          attrition_risk: string
          contract_type: string | null
          created_at: string
          id: string
          importance: string
          is_leader: boolean
          level: number | null
          name: string
          note: string | null
          org_id: string
          org_node_id: string | null
          performance: string | null
          prior_experience: string[]
          readiness: string
          role_id: string | null
          status: string
          tags: string[]
          tenure_months: number | null
          updated_at: string
        }
        Insert: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessed_skills?: Json
          attrition_risk?: string
          contract_type?: string | null
          created_at?: string
          id?: string
          importance?: string
          is_leader?: boolean
          level?: number | null
          name: string
          note?: string | null
          org_id: string
          org_node_id?: string | null
          performance?: string | null
          prior_experience?: string[]
          readiness?: string
          role_id?: string | null
          status?: string
          tags?: string[]
          tenure_months?: number | null
          updated_at?: string
        }
        Update: {
          assessed_at?: string | null
          assessed_by?: string | null
          assessed_skills?: Json
          attrition_risk?: string
          contract_type?: string | null
          created_at?: string
          id?: string
          importance?: string
          is_leader?: boolean
          level?: number | null
          name?: string
          note?: string | null
          org_id?: string
          org_node_id?: string | null
          performance?: string | null
          prior_experience?: string[]
          readiness?: string
          role_id?: string | null
          status?: string
          tags?: string[]
          tenure_months?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "people_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_org_node_id_fkey"
            columns: ["org_node_id"]
            isOneToOne: false
            referencedRelation: "org_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_records: {
        Row: {
          created_at: string
          highlights: string | null
          id: string
          improvements: string | null
          period: string
          person_id: string
          rating: string
          recorded_on: string
          reviewer: string | null
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          highlights?: string | null
          id?: string
          improvements?: string | null
          period: string
          person_id: string
          rating?: string
          recorded_on?: string
          reviewer?: string | null
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          highlights?: string | null
          id?: string
          improvements?: string | null
          period?: string
          person_id?: string
          rating?: string
          recorded_on?: string
          reviewer?: string | null
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_records_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_milestones: {
        Row: {
          created_at: string
          detail: string | null
          effective_on: string
          from_level: number | null
          id: string
          issuer: string | null
          kind: string
          person_id: string
          title: string
          to_level: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          effective_on?: string
          from_level?: number | null
          id?: string
          issuer?: string | null
          kind?: string
          person_id: string
          title: string
          to_level?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          effective_on?: string
          from_level?: number | null
          id?: string
          issuer?: string | null
          kind?: string
          person_id?: string
          title?: string
          to_level?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_milestones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_role_fit: {
        Row: {
          created_at: string
          fit_score: number
          gaps: string[]
          id: string
          model: string | null
          person_id: string
          recommendation: string | null
          role_id: string
          source: string
          strengths: string[]
          summary: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fit_score?: number
          gaps?: string[]
          id?: string
          model?: string | null
          person_id: string
          recommendation?: string | null
          role_id: string
          source?: string
          strengths?: string[]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fit_score?: number
          gaps?: string[]
          id?: string
          model?: string | null
          person_id?: string
          recommendation?: string | null
          role_id?: string
          source?: string
          strengths?: string[]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_role_fit_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_role_fit_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          archived: boolean
          created_at: string
          criticality: string
          description: string | null
          direction_id: string
          domains: string[]
          experience: string[]
          id: string
          knowledge: string[]
          kpa: string | null
          leadership: string[]
          level_max: number
          level_min: number
          org_node_id: string | null
          recommended_action: string[]
          skills: Json
          sort_order: number
          target_count: number
          title: string
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          criticality?: string
          description?: string | null
          direction_id: string
          domains?: string[]
          experience?: string[]
          id?: string
          knowledge?: string[]
          kpa?: string | null
          leadership?: string[]
          level_max?: number
          level_min?: number
          org_node_id?: string | null
          recommended_action?: string[]
          skills?: Json
          sort_order?: number
          target_count?: number
          title: string
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          criticality?: string
          description?: string | null
          direction_id?: string
          domains?: string[]
          experience?: string[]
          id?: string
          knowledge?: string[]
          kpa?: string | null
          leadership?: string[]
          level_max?: number
          level_min?: number
          org_node_id?: string | null
          recommended_action?: string[]
          skills?: Json
          sort_order?: number
          target_count?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_direction_id_fkey"
            columns: ["direction_id"]
            isOneToOne: false
            referencedRelation: "directions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roles_org_node_id_fkey"
            columns: ["org_node_id"]
            isOneToOne: false
            referencedRelation: "org_nodes"
            referencedColumns: ["id"]
          },
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
    Enums: {},
  },
} as const
