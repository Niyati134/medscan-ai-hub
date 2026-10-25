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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      alternative_selections: {
        Row: {
          alternative_manufacturer: string | null
          alternative_name: string
          alternative_price: number
          created_at: string
          id: string
          member_id: string | null
          original_name: string
          original_price: number
          savings: number
          scan_id: string | null
          user_id: string
        }
        Insert: {
          alternative_manufacturer?: string | null
          alternative_name: string
          alternative_price?: number
          created_at?: string
          id?: string
          member_id?: string | null
          original_name: string
          original_price?: number
          savings?: number
          scan_id?: string | null
          user_id: string
        }
        Update: {
          alternative_manufacturer?: string | null
          alternative_name?: string
          alternative_price?: number
          created_at?: string
          id?: string
          member_id?: string | null
          original_name?: string
          original_price?: number
          savings?: number
          scan_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alternative_selections_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alternative_selections_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          age: number | null
          allergies: string | null
          avatar_url: string | null
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          gender: string | null
          id: string
          medical_conditions: string | null
          name: string
          notes: string | null
          relationship: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          allergies?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          id?: string
          medical_conditions?: string | null
          name: string
          notes?: string | null
          relationship?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          allergies?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          gender?: string | null
          id?: string
          medical_conditions?: string | null
          name?: string
          notes?: string | null
          relationship?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_places: {
        Row: {
          address: string | null
          created_at: string
          id: string
          kind: string
          lat: number | null
          lng: number | null
          maps_uri: string | null
          name: string
          phone: string | null
          place_id: string
          rating: number | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          maps_uri?: string | null
          name: string
          phone?: string | null
          place_id: string
          rating?: number | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          maps_uri?: string | null
          name?: string
          phone?: string | null
          place_id?: string
          rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
      medicine_logs: {
        Row: {
          id: string
          medicine_id: string
          medicine_name: string
          member_id: string | null
          scan_id: string
          slot: string
          taken_at: string
          taken_on: string
          user_id: string
        }
        Insert: {
          id?: string
          medicine_id: string
          medicine_name: string
          member_id?: string | null
          scan_id: string
          slot: string
          taken_at?: string
          taken_on?: string
          user_id: string
        }
        Update: {
          id?: string
          medicine_id?: string
          medicine_name?: string
          member_id?: string | null
          scan_id?: string
          slot?: string
          taken_at?: string
          taken_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "medicine_logs_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      place_searches: {
        Row: {
          created_at: string
          id: string
          kind: string
          lat: number | null
          lng: number | null
          query: string
          result_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          query?: string
          result_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          query?: string
          result_count?: number
          user_id?: string
        }
        Relationships: []
      }
      price_comparisons: {
        Row: {
          alternatives: Json
          brand_name: string
          created_at: string
          generic_name: string | null
          id: string
          manufacturer: string | null
          market_price: number | null
          medicine_key: string
          pack_size: number | null
          price_per_strip: number | null
          price_per_tablet: number | null
          substitution_notes: string | null
          updated_at: string
          warnings: string | null
        }
        Insert: {
          alternatives?: Json
          brand_name: string
          created_at?: string
          generic_name?: string | null
          id?: string
          manufacturer?: string | null
          market_price?: number | null
          medicine_key: string
          pack_size?: number | null
          price_per_strip?: number | null
          price_per_tablet?: number | null
          substitution_notes?: string | null
          updated_at?: string
          warnings?: string | null
        }
        Update: {
          alternatives?: Json
          brand_name?: string
          created_at?: string
          generic_name?: string | null
          id?: string
          manufacturer?: string | null
          market_price?: number | null
          medicine_key?: string
          pack_size?: number | null
          price_per_strip?: number | null
          price_per_tablet?: number | null
          substitution_notes?: string | null
          updated_at?: string
          warnings?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allergies: string | null
          avatar_url: string | null
          blood_group: string | null
          created_at: string
          display_name: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          preferred_language: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          display_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id: string
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          created_at?: string
          display_name?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          active: boolean
          created_at: string
          days_of_week: number[]
          dosage: string | null
          end_date: string | null
          id: string
          medicine_name: string
          member_id: string | null
          notes: string | null
          scan_id: string | null
          snooze_until: string | null
          start_date: string
          times: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          dosage?: string | null
          end_date?: string | null
          id?: string
          medicine_name: string
          member_id?: string | null
          notes?: string | null
          scan_id?: string | null
          snooze_until?: string | null
          start_date?: string
          times?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          days_of_week?: number[]
          dosage?: string | null
          end_date?: string | null
          id?: string
          medicine_name?: string
          member_id?: string | null
          notes?: string | null
          scan_id?: string | null
          snooze_until?: string | null
          start_date?: string
          times?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          created_at: string
          file_name: string
          id: string
          image_path: string
          medicines: Json
          member_id: string | null
          ocr_text: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          image_path: string
          medicines?: Json
          member_id?: string | null
          ocr_text?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          image_path?: string
          medicines?: Json
          member_id?: string | null
          ocr_text?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_links: {
        Row: {
          created_at: string
          expires_at: string | null
          failed_attempts: number
          id: string
          include_adherence: boolean
          include_ai: boolean
          include_emergency: boolean
          last_viewed_at: string | null
          lock_until: string | null
          member_id: string | null
          password_hash: string | null
          revoked: boolean
          scan_id: string | null
          share_type: string
          title: string | null
          token: string
          updated_at: string
          user_id: string
          view_count: number
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          include_adherence?: boolean
          include_ai?: boolean
          include_emergency?: boolean
          last_viewed_at?: string | null
          lock_until?: string | null
          member_id?: string | null
          password_hash?: string | null
          revoked?: boolean
          scan_id?: string | null
          share_type?: string
          title?: string | null
          token: string
          updated_at?: string
          user_id: string
          view_count?: number
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          failed_attempts?: number
          id?: string
          include_adherence?: boolean
          include_ai?: boolean
          include_emergency?: boolean
          last_viewed_at?: string | null
          lock_until?: string | null
          member_id?: string | null
          password_hash?: string | null
          revoked?: boolean
          scan_id?: string | null
          share_type?: string
          title?: string | null
          token?: string
          updated_at?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "shared_links_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_links_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
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
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
