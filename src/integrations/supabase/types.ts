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
      airport_upgrade_cache: {
        Row: {
          generated_at: string
          icao: string
          last_manual_refresh_at: string | null
          level: number
          refresh_after: string
          row: Json
          tier: number
          updated_at: string
          window_days: number
        }
        Insert: {
          generated_at?: string
          icao: string
          last_manual_refresh_at?: string | null
          level: number
          refresh_after: string
          row: Json
          tier: number
          updated_at?: string
          window_days: number
        }
        Update: {
          generated_at?: string
          icao?: string
          last_manual_refresh_at?: string | null
          level?: number
          refresh_after?: string
          row?: Json
          tier?: number
          updated_at?: string
          window_days?: number
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      backfill_progress: {
        Row: {
          created_at: string
          current_page: number
          error_message: string | null
          flights_imported: number
          flights_total_est: number
          last_page_at: string | null
          started_at: string | null
          status: string
          total_pages: number
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          current_page?: number
          error_message?: string | null
          flights_imported?: number
          flights_total_est?: number
          last_page_at?: string | null
          started_at?: string | null
          status?: string
          total_pages?: number
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          current_page?: number
          error_message?: string | null
          flights_imported?: number
          flights_total_est?: number
          last_page_at?: string | null
          started_at?: string | null
          status?: string
          total_pages?: number
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      hub_support: {
        Row: {
          activated_at: string
          qualifying_arrival_at: string | null
          qualifying_flight_id: string | null
          qualifying_icao: string | null
          support_source: string
          updated_at: string
          username: string
          week_start_utc: string
        }
        Insert: {
          activated_at?: string
          qualifying_arrival_at?: string | null
          qualifying_flight_id?: string | null
          qualifying_icao?: string | null
          support_source: string
          updated_at?: string
          username: string
          week_start_utc: string
        }
        Update: {
          activated_at?: string
          qualifying_arrival_at?: string | null
          qualifying_flight_id?: string | null
          qualifying_icao?: string | null
          support_source?: string
          updated_at?: string
          username?: string
          week_start_utc?: string
        }
        Relationships: []
      }
      pilot_nonces: {
        Row: {
          created_at: string
          nonce: string
          resolved_at: string
          username: string
        }
        Insert: {
          created_at?: string
          nonce: string
          resolved_at?: string
          username: string
        }
        Update: {
          created_at?: string
          nonce?: string
          resolved_at?: string
          username?: string
        }
        Relationships: []
      }
      simfly_flights: {
        Row: {
          aircraft: string | null
          aircraft_icao: string | null
          aircraft_id: string | null
          aircraft_tail_number: string | null
          created_at: string
          departure_icao: string | null
          destination_icao: string | null
          destination_name: string | null
          flight_id: string
          flight_time: string | null
          landing_rate: number | null
          licence: string | null
          licence_rank: number | null
          licence_rank_name: string | null
          mission_start_ts: string | null
          origin_name: string | null
          pax: number | null
          raw: Json
          total_distance: number | null
          total_reward: number | null
          username: string
          xp: number | null
        }
        Insert: {
          aircraft?: string | null
          aircraft_icao?: string | null
          aircraft_id?: string | null
          aircraft_tail_number?: string | null
          created_at?: string
          departure_icao?: string | null
          destination_icao?: string | null
          destination_name?: string | null
          flight_id: string
          flight_time?: string | null
          landing_rate?: number | null
          licence?: string | null
          licence_rank?: number | null
          licence_rank_name?: string | null
          mission_start_ts?: string | null
          origin_name?: string | null
          pax?: number | null
          raw: Json
          total_distance?: number | null
          total_reward?: number | null
          username: string
          xp?: number | null
        }
        Update: {
          aircraft?: string | null
          aircraft_icao?: string | null
          aircraft_id?: string | null
          aircraft_tail_number?: string | null
          created_at?: string
          departure_icao?: string | null
          destination_icao?: string | null
          destination_name?: string | null
          flight_id?: string
          flight_time?: string | null
          landing_rate?: number | null
          licence?: string | null
          licence_rank?: number | null
          licence_rank_name?: string | null
          mission_start_ts?: string | null
          origin_name?: string | null
          pax?: number | null
          raw?: Json
          total_distance?: number | null
          total_reward?: number | null
          username?: string
          xp?: number | null
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
