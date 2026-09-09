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
      ai_image_results: {
        Row: {
          confidence: number | null
          created_at: string
          explanation: string | null
          id: string
          image_hash: string
          kind: string
          name: string | null
          place_name: string | null
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          id?: string
          image_hash: string
          kind?: string
          name?: string | null
          place_name?: string | null
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          id?: string
          image_hash?: string
          kind?: string
          name?: string | null
          place_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          country: string | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          sort_order: number
          start_date: string | null
          trip_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          sort_order?: number
          start_date?: string | null
          trip_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          sort_order?: number
          start_date?: string | null
          trip_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      entries: {
        Row: {
          ai_confidence: number | null
          ai_error: string | null
          ai_explanation: string | null
          ai_place: string | null
          ai_processed_at: string | null
          ai_status: string
          ai_suggestion: string | null
          body: string | null
          city_id: string | null
          created_at: string
          id: string
          kind: string
          landmark_id: string | null
          occurred_at: string
          place_name: string | null
          status: string
          title: string | null
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_error?: string | null
          ai_explanation?: string | null
          ai_place?: string | null
          ai_processed_at?: string | null
          ai_status?: string
          ai_suggestion?: string | null
          body?: string | null
          city_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          landmark_id?: string | null
          occurred_at?: string
          place_name?: string | null
          status?: string
          title?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_error?: string | null
          ai_explanation?: string | null
          ai_place?: string | null
          ai_processed_at?: string | null
          ai_status?: string
          ai_suggestion?: string | null
          body?: string | null
          city_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          landmark_id?: string | null
          occurred_at?: string
          place_name?: string | null
          status?: string
          title?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_landmark_id_fkey"
            columns: ["landmark_id"]
            isOneToOne: false
            referencedRelation: "landmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_photos: {
        Row: {
          bytes: number | null
          captured_at: string | null
          created_at: string
          entry_id: string
          height: number | null
          id: string
          lat: number | null
          lng: number | null
          mime: string | null
          sha256: string | null
          storage_path: string
          user_id: string
          width: number | null
        }
        Insert: {
          bytes?: number | null
          captured_at?: string | null
          created_at?: string
          entry_id: string
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mime?: string | null
          sha256?: string | null
          storage_path: string
          user_id: string
          width?: number | null
        }
        Update: {
          bytes?: number | null
          captured_at?: string | null
          created_at?: string
          entry_id?: string
          height?: number | null
          id?: string
          lat?: number | null
          lng?: number | null
          mime?: string | null
          sha256?: string | null
          storage_path?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
        ]
      }
      landmarks: {
        Row: {
          caption: string | null
          city_id: string | null
          created_at: string
          culture: string | null
          description: string | null
          enriched_at: string | null
          fun_fact: string | null
          history: string | null
          id: string
          name: string
          place_name: string | null
          trip_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          city_id?: string | null
          created_at?: string
          culture?: string | null
          description?: string | null
          enriched_at?: string | null
          fun_fact?: string | null
          history?: string | null
          id?: string
          name: string
          place_name?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          city_id?: string | null
          created_at?: string
          culture?: string | null
          description?: string | null
          enriched_at?: string | null
          fun_fact?: string | null
          history?: string | null
          id?: string
          name?: string
          place_name?: string | null
          trip_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "landmarks_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landmarks_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          cover_path: string | null
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          start_date: string | null
          subtitle: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_path?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          start_date?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_path?: string | null
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          start_date?: string | null
          subtitle?: string | null
          title?: string
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
    Enums: {},
  },
} as const
