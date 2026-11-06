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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      lessons: {
        Row: {
          created_at: string
          created_by: string
          duration_minutes: number
          id: string
          location: string
          rating: number | null
          seats: number
          starts_at: string
          status: string
          student_id: string | null
          subject: string
          teacher_id: string
          title: string
          topics: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          duration_minutes?: number
          id?: string
          location?: string
          rating?: number | null
          seats?: number
          starts_at: string
          status?: string
          student_id?: string | null
          subject: string
          teacher_id: string
          title: string
          topics?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          duration_minutes?: number
          id?: string
          location?: string
          rating?: number | null
          seats?: number
          starts_at?: string
          status?: string
          student_id?: string | null
          subject?: string
          teacher_id?: string
          title?: string
          topics?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          category: string
          created_at: string
          dedupe_key: string | null
          id: string
          lesson_id: string | null
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          category: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          lesson_id?: string | null
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          lesson_id?: string | null
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          avatar_url: string | null
          banner_url: string | null
          bio: string
          city: string
          created_at: string
          display_name: string
          document_name: string | null
          email: string | null
          grade: string | null
          id: string
          last_seen_at: string | null
          links: Json
          public_profile: boolean
          rejection_reason: string | null
          show_email: boolean
          subjects: string[]
          suspended: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          approval_status?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string
          city?: string
          created_at?: string
          display_name?: string
          document_name?: string | null
          email?: string | null
          grade?: string | null
          id: string
          last_seen_at?: string | null
          links?: Json
          public_profile?: boolean
          rejection_reason?: string | null
          show_email?: boolean
          subjects?: string[]
          suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          approval_status?: string
          avatar_url?: string | null
          banner_url?: string | null
          bio?: string
          city?: string
          created_at?: string
          display_name?: string
          document_name?: string | null
          email?: string | null
          grade?: string | null
          id?: string
          last_seen_at?: string | null
          links?: Json
          public_profile?: boolean
          rejection_reason?: string | null
          show_email?: boolean
          subjects?: string[]
          suspended?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          categories: string[]
          date_format: string
          high_contrast: boolean
          notify_inapp: boolean
          notify_push: boolean
          notify_sound: boolean
          reduce_motion: boolean
          reminder_minutes: number
          text_scale: number
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categories?: string[]
          date_format?: string
          high_contrast?: boolean
          notify_inapp?: boolean
          notify_push?: boolean
          notify_sound?: boolean
          reduce_motion?: boolean
          reminder_minutes?: number
          text_scale?: number
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categories?: string[]
          date_format?: string
          high_contrast?: boolean
          notify_inapp?: boolean
          notify_push?: boolean
          notify_sound?: boolean
          reduce_motion?: boolean
          reminder_minutes?: number
          text_scale?: number
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_lesson_reminders: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      notify: {
        Args: {
          _body: string
          _cat: string
          _key: string
          _lesson: string
          _link: string
          _title: string
          _user: string
        }
        Returns: undefined
      }
      public_profiles: {
        Args: never
        Returns: {
          approval_status: string
          avatar_url: string
          banner_url: string
          bio: string
          city: string
          display_name: string
          email: string
          id: string
          links: Json
          role: Database["public"]["Enums"]["app_role"]
          subjects: string[]
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "professor" | "voluntario" | "aluno"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "professor", "voluntario", "aluno"],
    },
  },
} as const
