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
      aircraft_ownership_period: {
        Row: {
          aircraft_id: string
          created_at: string
          ended_at: string | null
          id: string
          owner_username: string
          start_inferred: boolean
          started_at: string
          updated_at: string
        }
        Insert: {
          aircraft_id: string
          created_at?: string
          ended_at?: string | null
          id?: string
          owner_username: string
          start_inferred?: boolean
          started_at: string
          updated_at?: string
        }
        Update: {
          aircraft_id?: string
          created_at?: string
          ended_at?: string | null
          id?: string
          owner_username?: string
          start_inferred?: boolean
          started_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      airport_identity_cache: {
        Row: {
          asset_id: string | null
          country: string | null
          dispatch_airport_active: boolean | null
          dispatch_slots_capacity: number | null
          dispatch_slots_fetched_at: string | null
          dispatch_slots_used: number | null
          fetched_at: string
          icao: string
          level: number | null
          name: string | null
          owner_username: string | null
          payload: Json | null
          refresh_after: string
          tier: number | null
        }
        Insert: {
          asset_id?: string | null
          country?: string | null
          dispatch_airport_active?: boolean | null
          dispatch_slots_capacity?: number | null
          dispatch_slots_fetched_at?: string | null
          dispatch_slots_used?: number | null
          fetched_at?: string
          icao: string
          level?: number | null
          name?: string | null
          owner_username?: string | null
          payload?: Json | null
          refresh_after?: string
          tier?: number | null
        }
        Update: {
          asset_id?: string | null
          country?: string | null
          dispatch_airport_active?: boolean | null
          dispatch_slots_capacity?: number | null
          dispatch_slots_fetched_at?: string | null
          dispatch_slots_used?: number | null
          fetched_at?: string
          icao?: string
          level?: number | null
          name?: string | null
          owner_username?: string | null
          payload?: Json | null
          refresh_after?: string
          tier?: number | null
        }
        Relationships: []
      }
      airport_spy_access: {
        Row: {
          enabled: boolean
          granted_at: string
          granted_by: string | null
          notes: string | null
          updated_at: string
          username: string
        }
        Insert: {
          enabled?: boolean
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          enabled?: boolean
          granted_at?: string
          granted_by?: string | null
          notes?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      airport_spy_pilot: {
        Row: {
          arrivals: number
          departures: number
          first_seen_at: string | null
          icao: string
          last_seen_at: string | null
          observed_owner_pax: number
          observed_pax: number
          operations: number
          pilot_username: string
          updated_at: string
        }
        Insert: {
          arrivals?: number
          departures?: number
          first_seen_at?: string | null
          icao: string
          last_seen_at?: string | null
          observed_owner_pax?: number
          observed_pax?: number
          operations?: number
          pilot_username: string
          updated_at?: string
        }
        Update: {
          arrivals?: number
          departures?: number
          first_seen_at?: string | null
          icao?: string
          last_seen_at?: string | null
          observed_owner_pax?: number
          observed_pax?: number
          operations?: number
          pilot_username?: string
          updated_at?: string
        }
        Relationships: []
      }
      airport_spy_record: {
        Row: {
          arrivals: number
          asset_id: string | null
          country: string | null
          created_at: string
          departures: number
          error_message: string | null
          first_observed_at: string
          flights_analyzed: number
          icao: string
          investigations: number
          last_refreshed_at: string | null
          level: number | null
          name: string | null
          newest_flight_at: string | null
          oldest_flight_at: string | null
          operations: number
          owner_username: string | null
          pages_walked: number
          progress_message: string | null
          progress_page: number
          progress_total: number
          status: string
          tier: number | null
          unique_aircraft: number
          unique_pilots: number
          updated_at: string
          weeks_covered: number
        }
        Insert: {
          arrivals?: number
          asset_id?: string | null
          country?: string | null
          created_at?: string
          departures?: number
          error_message?: string | null
          first_observed_at?: string
          flights_analyzed?: number
          icao: string
          investigations?: number
          last_refreshed_at?: string | null
          level?: number | null
          name?: string | null
          newest_flight_at?: string | null
          oldest_flight_at?: string | null
          operations?: number
          owner_username?: string | null
          pages_walked?: number
          progress_message?: string | null
          progress_page?: number
          progress_total?: number
          status?: string
          tier?: number | null
          unique_aircraft?: number
          unique_pilots?: number
          updated_at?: string
          weeks_covered?: number
        }
        Update: {
          arrivals?: number
          asset_id?: string | null
          country?: string | null
          created_at?: string
          departures?: number
          error_message?: string | null
          first_observed_at?: string
          flights_analyzed?: number
          icao?: string
          investigations?: number
          last_refreshed_at?: string | null
          level?: number | null
          name?: string | null
          newest_flight_at?: string | null
          oldest_flight_at?: string | null
          operations?: number
          owner_username?: string | null
          pages_walked?: number
          progress_message?: string | null
          progress_page?: number
          progress_total?: number
          status?: string
          tier?: number | null
          unique_aircraft?: number
          unique_pilots?: number
          updated_at?: string
          weeks_covered?: number
        }
        Relationships: []
      }
      airport_spy_traffic: {
        Row: {
          bucket: string
          dimension: string
          flights: number
          icao: string
          observed_owner_pax: number
          observed_pax: number
          updated_at: string
        }
        Insert: {
          bucket: string
          dimension: string
          flights?: number
          icao: string
          observed_owner_pax?: number
          observed_pax?: number
          updated_at?: string
        }
        Update: {
          bucket?: string
          dimension?: string
          flights?: number
          icao?: string
          observed_owner_pax?: number
          observed_pax?: number
          updated_at?: string
        }
        Relationships: []
      }
      airport_spy_week: {
        Row: {
          arrivals: number
          departures: number
          flights_observed: number
          icao: string
          observed_owner_pax: number
          observed_pax: number
          operations: number
          unique_aircraft: number
          unique_pilots: number
          updated_at: string
          week_start_utc: string
        }
        Insert: {
          arrivals?: number
          departures?: number
          flights_observed?: number
          icao: string
          observed_owner_pax?: number
          observed_pax?: number
          operations?: number
          unique_aircraft?: number
          unique_pilots?: number
          updated_at?: string
          week_start_utc: string
        }
        Update: {
          arrivals?: number
          departures?: number
          flights_observed?: number
          icao?: string
          observed_owner_pax?: number
          observed_pax?: number
          operations?: number
          unique_aircraft?: number
          unique_pilots?: number
          updated_at?: string
          week_start_utc?: string
        }
        Relationships: []
      }
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
      airport_utilization_week: {
        Row: {
          capacity: number
          created_at: string
          icao: string
          used: number
          username: string
          week_number: number
          week_start_utc: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          icao: string
          used?: number
          username: string
          week_number: number
          week_start_utc: string
        }
        Update: {
          capacity?: number
          created_at?: string
          icao?: string
          used?: number
          username?: string
          week_number?: number
          week_start_utc?: string
        }
        Relationships: []
      }
      alliance_build_item: {
        Row: {
          attempts: number
          build_id: string
          key: string
          kind: string
          payload: Json | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          build_id: string
          key: string
          kind: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          build_id?: string
          key?: string
          kind?: string
          payload?: Json | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      alliance_build_job: {
        Row: {
          airports_done: number
          airports_total: number
          build_id: string
          error_message: string | null
          phase: string
          pilots_done: number
          pilots_total: number
          started_at: string
          updated_at: string
          username: string
        }
        Insert: {
          airports_done?: number
          airports_total?: number
          build_id?: string
          error_message?: string | null
          phase?: string
          pilots_done?: number
          pilots_total?: number
          started_at?: string
          updated_at?: string
          username: string
        }
        Update: {
          airports_done?: number
          airports_total?: number
          build_id?: string
          error_message?: string | null
          phase?: string
          pilots_done?: number
          pilots_total?: number
          started_at?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      alliance_intel_cache: {
        Row: {
          generated_at: string
          payload: Json
          refresh_after: string
          username: string
        }
        Insert: {
          generated_at?: string
          payload: Json
          refresh_after: string
          username: string
        }
        Update: {
          generated_at?: string
          payload?: Json
          refresh_after?: string
          username?: string
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
      asset_watch_state: {
        Row: {
          asset_key: string
          asset_kind: string
          consecutive_failures: number
          created_at: string
          last_error: string | null
          last_flight_at: string | null
          last_flight_id: string | null
          last_probed_at: string | null
          owner_username: string
          updated_at: string
        }
        Insert: {
          asset_key: string
          asset_kind: string
          consecutive_failures?: number
          created_at?: string
          last_error?: string | null
          last_flight_at?: string | null
          last_flight_id?: string | null
          last_probed_at?: string | null
          owner_username: string
          updated_at?: string
        }
        Update: {
          asset_key?: string
          asset_kind?: string
          consecutive_failures?: number
          created_at?: string
          last_error?: string | null
          last_flight_at?: string | null
          last_flight_id?: string | null
          last_probed_at?: string | null
          owner_username?: string
          updated_at?: string
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
      community_traffic_observation: {
        Row: {
          aircraft_icao: string | null
          aircraft_name: string | null
          destination_icao: string | null
          first_seen_at: string
          flight_id: string
          origin_icao: string | null
          username: string | null
          week_start_utc: string
        }
        Insert: {
          aircraft_icao?: string | null
          aircraft_name?: string | null
          destination_icao?: string | null
          first_seen_at?: string
          flight_id: string
          origin_icao?: string | null
          username?: string | null
          week_start_utc: string
        }
        Update: {
          aircraft_icao?: string | null
          aircraft_name?: string | null
          destination_icao?: string | null
          first_seen_at?: string
          flight_id?: string
          origin_icao?: string | null
          username?: string | null
          week_start_utc?: string
        }
        Relationships: []
      }
      dispatch_completions: {
        Row: {
          awarded_points: number
          completed_at: string
          created_at: string
          flight_id: string
          id: string
          month: string
          pilot_username: string
          route_id: string
        }
        Insert: {
          awarded_points: number
          completed_at: string
          created_at?: string
          flight_id: string
          id?: string
          month: string
          pilot_username: string
          route_id: string
        }
        Update: {
          awarded_points?: number
          completed_at?: string
          created_at?: string
          flight_id?: string
          id?: string
          month?: string
          pilot_username?: string
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_completions_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "dispatch_monthly_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_monthly_routes: {
        Row: {
          airport_a: string
          airport_b: string
          base_points: number
          bonuses: string[]
          created_at: string
          distance_nm: number
          id: string
          month: string
          multiplier: number
          points: number
          route_class: string
        }
        Insert: {
          airport_a: string
          airport_b: string
          base_points: number
          bonuses?: string[]
          created_at?: string
          distance_nm: number
          id?: string
          month: string
          multiplier?: number
          points: number
          route_class: string
        }
        Update: {
          airport_a?: string
          airport_b?: string
          base_points?: number
          bonuses?: string[]
          created_at?: string
          distance_nm?: number
          id?: string
          month?: string
          multiplier?: number
          points?: number
          route_class?: string
        }
        Relationships: []
      }
      hauler_airport_state: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          current_pax: number
          icao: string
          level: number
          name: string
          owner_username: string
          regenerated_at: string
          tier: number
        }
        Insert: {
          active?: boolean
          capacity: number
          created_at?: string
          current_pax: number
          icao: string
          level?: number
          name: string
          owner_username: string
          regenerated_at?: string
          tier: number
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          current_pax?: number
          icao?: string
          level?: number
          name?: string
          owner_username?: string
          regenerated_at?: string
          tier?: number
        }
        Relationships: []
      }
      hauler_catalogue: {
        Row: {
          fetched_at: string
          icao: string
          name: string
          range_nm: number | null
          seats: number
          slug: string
          tier: number
        }
        Insert: {
          fetched_at?: string
          icao: string
          name: string
          range_nm?: number | null
          seats: number
          slug: string
          tier: number
        }
        Update: {
          fetched_at?: string
          icao?: string
          name?: string
          range_nm?: number | null
          seats?: number
          slug?: string
          tier?: number
        }
        Relationships: []
      }
      hauler_flight_ledger: {
        Row: {
          accepted: number
          aircraft_icao: string
          aircraft_tier: number
          boarded: number
          costs: number
          departure_at: string
          destination_fee: number
          destination_icao: string
          destination_owner: string
          distance_nm: number
          flight_id: string
          gross: number
          net: number
          observed_at: string
          origin_fee: number
          origin_icao: string
          origin_owner: string
          pilot_username: string
          seats: number
          settled_at: string | null
          status: string
          unpaid: number
        }
        Insert: {
          accepted?: number
          aircraft_icao: string
          aircraft_tier: number
          boarded?: number
          costs?: number
          departure_at: string
          destination_fee?: number
          destination_icao: string
          destination_owner: string
          distance_nm?: number
          flight_id: string
          gross?: number
          net?: number
          observed_at?: string
          origin_fee?: number
          origin_icao: string
          origin_owner: string
          pilot_username: string
          seats: number
          settled_at?: string | null
          status?: string
          unpaid?: number
        }
        Update: {
          accepted?: number
          aircraft_icao?: string
          aircraft_tier?: number
          boarded?: number
          costs?: number
          departure_at?: string
          destination_fee?: number
          destination_icao?: string
          destination_owner?: string
          distance_nm?: number
          flight_id?: string
          gross?: number
          net?: number
          observed_at?: string
          origin_fee?: number
          origin_icao?: string
          origin_owner?: string
          pilot_username?: string
          seats?: number
          settled_at?: string | null
          status?: string
          unpaid?: number
        }
        Relationships: []
      }
      hauler_worker_state: {
        Row: {
          error: string | null
          key: string
          last_completed_at: string | null
          last_started_at: string
        }
        Insert: {
          error?: string | null
          key: string
          last_completed_at?: string | null
          last_started_at?: string
        }
        Update: {
          error?: string | null
          key?: string
          last_completed_at?: string | null
          last_started_at?: string
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
      module_usage_daily: {
        Row: {
          created_at: string
          day: string
          hits: number
          last_seen_at: string
          module: string
          username: string
        }
        Insert: {
          created_at?: string
          day?: string
          hits?: number
          last_seen_at?: string
          module: string
          username: string
        }
        Update: {
          created_at?: string
          day?: string
          hits?: number
          last_seen_at?: string
          module?: string
          username?: string
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
      pilot_presence: {
        Row: {
          created_at: string
          hit_count: number
          last_action: string
          last_seen_at: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          hit_count?: number
          last_action?: string
          last_seen_at?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          hit_count?: number
          last_action?: string
          last_seen_at?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      pilot_sync_state: {
        Row: {
          consecutive_failures: number
          created_at: string
          enabled: boolean
          last_error: string | null
          last_flight_at: string | null
          last_imported_count: number
          last_synced_at: string | null
          next_sync_after: string
          updated_at: string
          username: string
        }
        Insert: {
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          last_error?: string | null
          last_flight_at?: string | null
          last_imported_count?: number
          last_synced_at?: string | null
          next_sync_after?: string
          updated_at?: string
          username: string
        }
        Update: {
          consecutive_failures?: number
          created_at?: string
          enabled?: boolean
          last_error?: string | null
          last_flight_at?: string | null
          last_imported_count?: number
          last_synced_at?: string | null
          next_sync_after?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      pilot_teams: {
        Row: {
          created_at: string
          member_username: string
          owner_username: string
        }
        Insert: {
          created_at?: string
          member_username: string
          owner_username: string
        }
        Update: {
          created_at?: string
          member_username?: string
          owner_username?: string
        }
        Relationships: []
      }
      portfolio_horizon: {
        Row: {
          created_at: string
          horizon_started_at: string
          rule_registry_version: string
          username: string
          weights_version: string
        }
        Insert: {
          created_at?: string
          horizon_started_at?: string
          rule_registry_version: string
          username: string
          weights_version: string
        }
        Update: {
          created_at?: string
          horizon_started_at?: string
          rule_registry_version?: string
          username?: string
          weights_version?: string
        }
        Relationships: []
      }
      portfolio_snapshot_week: {
        Row: {
          composites: Json
          created_at: string
          degraded_sources: string[]
          inputs_frozen: Json
          recommendations: Json
          rule_registry_version: string
          source_versions: Json
          username: string
          week_start_utc: string
          weights_version: string
        }
        Insert: {
          composites: Json
          created_at?: string
          degraded_sources?: string[]
          inputs_frozen: Json
          recommendations: Json
          rule_registry_version: string
          source_versions: Json
          username: string
          week_start_utc: string
          weights_version: string
        }
        Update: {
          composites?: Json
          created_at?: string
          degraded_sources?: string[]
          inputs_frozen?: Json
          recommendations?: Json
          rule_registry_version?: string
          source_versions?: Json
          username?: string
          week_start_utc?: string
          weights_version?: string
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
          grounded_until: string | null
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
          grounded_until?: string | null
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
          grounded_until?: string | null
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
      system_airport_scan: {
        Row: {
          created_at: string
          cursor_index: number
          error_message: string | null
          last_scanned_at: string | null
          message: string | null
          resolved: number
          scan_key: string
          status: string
          tiers: string
          total: number
          updated_at: string
          username: string
          window_days: number
        }
        Insert: {
          created_at?: string
          cursor_index?: number
          error_message?: string | null
          last_scanned_at?: string | null
          message?: string | null
          resolved?: number
          scan_key: string
          status?: string
          tiers?: string
          total?: number
          updated_at?: string
          username: string
          window_days?: number
        }
        Update: {
          created_at?: string
          cursor_index?: number
          error_message?: string | null
          last_scanned_at?: string | null
          message?: string | null
          resolved?: number
          scan_key?: string
          status?: string
          tiers?: string
          total?: number
          updated_at?: string
          username?: string
          window_days?: number
        }
        Relationships: []
      }
      system_airport_watch: {
        Row: {
          created_at: string
          icao: string
          id: string
          last_opened_at: string | null
          notes: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          icao: string
          id?: string
          last_opened_at?: string | null
          notes?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          icao?: string
          id?: string
          last_opened_at?: string | null
          notes?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hauler_acquire_sweep: { Args: never; Returns: boolean }
      hauler_observe_flight: {
        Args: {
          _aircraft: string
          _departure: string
          _destination: string
          _flight_id: string
          _origin: string
          _pilot: string
          _seats: number
          _tier: number
        }
        Returns: undefined
      }
      hauler_refresh_stock: { Args: { _icao: string }; Returns: undefined }
      hauler_settle_flight: {
        Args: {
          _destination: string
          _distance: number
          _flight_id: string
          _landed: string
          _origin: string
          _pilot: string
        }
        Returns: undefined
      }
      touch_module_usage: {
        Args: { _module: string; _username: string }
        Returns: undefined
      }
      touch_pilot_presence: {
        Args: { _action: string; _username: string }
        Returns: undefined
      }
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
