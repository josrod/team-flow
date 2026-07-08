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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          created_at: string
          end_date: string
          id: string
          member_id: string
          start_date: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id: string
          member_id: string
          start_date: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          member_id?: string
          start_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      azure_devops_settings: {
        Row: {
          area_paths: string[]
          auto_sync_enabled: boolean
          bugs_query_id: string | null
          collection: string | null
          created_at: string
          epics_area_paths: string[]
          epics_iteration_paths: string[]
          epics_project: string | null
          epics_query_id: string | null
          epics_tags: string[]
          epics_team: string | null
          id: string
          iteration_paths: string[]
          last_diagnostic: Json | null
          last_diagnostic_at: string | null
          last_synced_at: string | null
          organization: string | null
          pat_encrypted: string
          pat_iv: string | null
          project: string
          server_url: string | null
          sync_interval_minutes: number
          team: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          area_paths?: string[]
          auto_sync_enabled?: boolean
          bugs_query_id?: string | null
          collection?: string | null
          created_at?: string
          epics_area_paths?: string[]
          epics_iteration_paths?: string[]
          epics_project?: string | null
          epics_query_id?: string | null
          epics_tags?: string[]
          epics_team?: string | null
          id?: string
          iteration_paths?: string[]
          last_diagnostic?: Json | null
          last_diagnostic_at?: string | null
          last_synced_at?: string | null
          organization?: string | null
          pat_encrypted: string
          pat_iv?: string | null
          project: string
          server_url?: string | null
          sync_interval_minutes?: number
          team?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          area_paths?: string[]
          auto_sync_enabled?: boolean
          bugs_query_id?: string | null
          collection?: string | null
          created_at?: string
          epics_area_paths?: string[]
          epics_iteration_paths?: string[]
          epics_project?: string | null
          epics_query_id?: string | null
          epics_tags?: string[]
          epics_team?: string | null
          id?: string
          iteration_paths?: string[]
          last_diagnostic?: Json | null
          last_diagnostic_at?: string | null
          last_synced_at?: string | null
          organization?: string | null
          pat_encrypted?: string
          pat_iv?: string | null
          project?: string
          server_url?: string | null
          sync_interval_minutes?: number
          team?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      handovers: {
        Row: {
          absence_id: string
          created_at: string
          from_member_id: string
          handover_date: string
          id: string
          notes: string
          to_member_id: string
          topic_ids: string[]
          updated_at: string
        }
        Insert: {
          absence_id: string
          created_at?: string
          from_member_id: string
          handover_date?: string
          id: string
          notes?: string
          to_member_id: string
          topic_ids?: string[]
          updated_at?: string
        }
        Update: {
          absence_id?: string
          created_at?: string
          from_member_id?: string
          handover_date?: string
          id?: string
          notes?: string
          to_member_id?: string
          topic_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handovers_absence_id_fkey"
            columns: ["absence_id"]
            isOneToOne: false
            referencedRelation: "absences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handovers_from_member_id_fkey"
            columns: ["from_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handovers_to_member_id_fkey"
            columns: ["to_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          avatar: string | null
          base_capacity: number | null
          created_at: string
          id: string
          login_name: string | null
          max_capacity: number | null
          name: string
          role: string
          team_id: string
          updated_at: string
        }
        Insert: {
          avatar?: string | null
          base_capacity?: number | null
          created_at?: string
          id: string
          login_name?: string | null
          max_capacity?: number | null
          name: string
          role: string
          team_id: string
          updated_at?: string
        }
        Update: {
          avatar?: string | null
          base_capacity?: number | null
          created_at?: string
          id?: string
          login_name?: string | null
          max_capacity?: number | null
          name?: string
          role?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      task_handover_notes: {
        Row: {
          author_id: string
          author_name: string | null
          content: string
          created_at: string
          done: boolean
          id: string
          kind: string
          task_id: string
          updated_at: string
          url: string | null
        }
        Insert: {
          author_id: string
          author_name?: string | null
          content: string
          created_at?: string
          done?: boolean
          id?: string
          kind: string
          task_id: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          author_id?: string
          author_name?: string | null
          content?: string
          created_at?: string
          done?: boolean
          id?: string
          kind?: string
          task_id?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      tfs_import_history: {
        Row: {
          created_at: string
          id: string
          imported_count: number
          imported_members: Json
          source: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          imported_count?: number
          imported_members?: Json
          source?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          imported_count?: number
          imported_members?: Json
          source?: string
          team_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      work_topics: {
        Row: {
          created_at: string
          description: string
          id: string
          member_id: string
          name: string
          reassigned_from: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id: string
          member_id: string
          name: string
          reassigned_from?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          member_id?: string
          name?: string
          reassigned_from?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_topics_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
