export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_user_id: string | null;
          entity_id: string;
          entity_type: string;
          id: string;
          metadata: Json;
          occurred_at: string;
          target_user_id: string | null;
        };
        Insert: {
          action: string;
          actor_user_id?: string | null;
          entity_id: string;
          entity_type: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          target_user_id?: string | null;
        };
        Update: {
          action?: string;
          actor_user_id?: string | null;
          entity_id?: string;
          entity_type?: string;
          id?: string;
          metadata?: Json;
          occurred_at?: string;
          target_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      bracket_match_sets: {
        Row: {
          match_id: string;
          set_number: number;
          team_a_score: number;
          team_b_score: number;
        };
        Insert: {
          match_id: string;
          set_number: number;
          team_a_score: number;
          team_b_score: number;
        };
        Update: {
          match_id?: string;
          set_number?: number;
          team_a_score?: number;
          team_b_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bracket_match_sets_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: false;
            referencedRelation: 'bracket_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      bracket_matches: {
        Row: {
          advances_to_match_id: string | null;
          advances_to_slot: string | null;
          best_of: number | null;
          bracket_id: string;
          bracket_side: string | null;
          court: string | null;
          created_at: string;
          entry_a_id: string | null;
          entry_b_id: string | null;
          id: string;
          loser_advances_to_match_id: string | null;
          loser_advances_to_slot: string | null;
          match_number: number;
          pool: string | null;
          round: number;
          scheduled_at: string | null;
          slot: number | null;
          status: string;
          target_score: number | null;
          updated_at: string;
          winner_entry_id: string | null;
          work_entry_id: string | null;
        };
        Insert: {
          advances_to_match_id?: string | null;
          advances_to_slot?: string | null;
          best_of?: number | null;
          bracket_id: string;
          bracket_side?: string | null;
          court?: string | null;
          created_at?: string;
          entry_a_id?: string | null;
          entry_b_id?: string | null;
          id?: string;
          loser_advances_to_match_id?: string | null;
          loser_advances_to_slot?: string | null;
          match_number: number;
          pool?: string | null;
          round: number;
          scheduled_at?: string | null;
          slot?: number | null;
          status?: string;
          target_score?: number | null;
          updated_at?: string;
          winner_entry_id?: string | null;
          work_entry_id?: string | null;
        };
        Update: {
          advances_to_match_id?: string | null;
          advances_to_slot?: string | null;
          best_of?: number | null;
          bracket_id?: string;
          bracket_side?: string | null;
          court?: string | null;
          created_at?: string;
          entry_a_id?: string | null;
          entry_b_id?: string | null;
          id?: string;
          loser_advances_to_match_id?: string | null;
          loser_advances_to_slot?: string | null;
          match_number?: number;
          pool?: string | null;
          round?: number;
          scheduled_at?: string | null;
          slot?: number | null;
          status?: string;
          target_score?: number | null;
          updated_at?: string;
          winner_entry_id?: string | null;
          work_entry_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'bracket_matches_advances_to_match_id_fkey';
            columns: ['advances_to_match_id'];
            isOneToOne: false;
            referencedRelation: 'bracket_matches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bracket_matches_bracket_id_fkey';
            columns: ['bracket_id'];
            isOneToOne: false;
            referencedRelation: 'event_brackets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'bracket_matches_loser_advances_to_match_id_fkey';
            columns: ['loser_advances_to_match_id'];
            isOneToOne: false;
            referencedRelation: 'bracket_matches';
            referencedColumns: ['id'];
          },
        ];
      };
      bracket_seeds: {
        Row: {
          bracket_id: string;
          entry_id: string;
          pool: string | null;
          seed: number;
        };
        Insert: {
          bracket_id: string;
          entry_id: string;
          pool?: string | null;
          seed: number;
        };
        Update: {
          bracket_id?: string;
          entry_id?: string;
          pool?: string | null;
          seed?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'bracket_seeds_bracket_id_fkey';
            columns: ['bracket_id'];
            isOneToOne: false;
            referencedRelation: 'event_brackets';
            referencedColumns: ['id'];
          },
        ];
      };
      bracket_teams: {
        Row: {
          bracket_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          bracket_id: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          bracket_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'bracket_teams_bracket_id_fkey';
            columns: ['bracket_id'];
            isOneToOne: false;
            referencedRelation: 'event_brackets';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcasts: {
        Row: {
          audience_id: string;
          audience_type: string;
          body: string;
          channels: string[];
          created_at: string;
          deleted_at: string | null;
          id: string;
          sender_id: string | null;
          sent_at: string | null;
          subject: string | null;
        };
        Insert: {
          audience_id: string;
          audience_type: string;
          body: string;
          channels?: string[];
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          sender_id?: string | null;
          sent_at?: string | null;
          subject?: string | null;
        };
        Update: {
          audience_id?: string;
          audience_type?: string;
          body?: string;
          channels?: string[];
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          sender_id?: string | null;
          sent_at?: string | null;
          subject?: string | null;
        };
        Relationships: [];
      };
      community_listing_reports: {
        Row: {
          created_at: string;
          id: string;
          listing_id: string;
          reason: string | null;
          reporter_user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          listing_id: string;
          reason?: string | null;
          reporter_user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          listing_id?: string;
          reason?: string | null;
          reporter_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_listing_reports_listing_id_fkey';
            columns: ['listing_id'];
            isOneToOne: false;
            referencedRelation: 'community_listings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listing_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listing_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      community_listings: {
        Row: {
          address_line: string | null;
          city: string | null;
          claimed_at: string | null;
          claimed_by_user_id: string | null;
          claimed_event_id: string | null;
          country: string | null;
          created_at: string;
          description: string;
          ends_at: string | null;
          external_host_name: string | null;
          external_url: string;
          format: Database['public']['Enums']['format'] | null;
          geo: unknown;
          id: string;
          postal_code: string | null;
          region: string | null;
          report_count: number;
          short_code: string | null;
          skill_level: Database['public']['Enums']['skill_level'] | null;
          slug: string | null;
          starts_at: string;
          status: string;
          submitter_user_id: string | null;
          surface: Database['public']['Enums']['surface'] | null;
          time_zone: string | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          address_line?: string | null;
          city?: string | null;
          claimed_at?: string | null;
          claimed_by_user_id?: string | null;
          claimed_event_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string;
          ends_at?: string | null;
          external_host_name?: string | null;
          external_url: string;
          format?: Database['public']['Enums']['format'] | null;
          geo?: unknown;
          id?: string;
          postal_code?: string | null;
          region?: string | null;
          report_count?: number;
          short_code?: string | null;
          skill_level?: Database['public']['Enums']['skill_level'] | null;
          slug?: string | null;
          starts_at: string;
          status?: string;
          submitter_user_id?: string | null;
          surface?: Database['public']['Enums']['surface'] | null;
          time_zone?: string | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          address_line?: string | null;
          city?: string | null;
          claimed_at?: string | null;
          claimed_by_user_id?: string | null;
          claimed_event_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string;
          ends_at?: string | null;
          external_host_name?: string | null;
          external_url?: string;
          format?: Database['public']['Enums']['format'] | null;
          geo?: unknown;
          id?: string;
          postal_code?: string | null;
          region?: string | null;
          report_count?: number;
          short_code?: string | null;
          skill_level?: Database['public']['Enums']['skill_level'] | null;
          slug?: string | null;
          starts_at?: string;
          status?: string;
          submitter_user_id?: string | null;
          surface?: Database['public']['Enums']['surface'] | null;
          time_zone?: string | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'community_listings_claimed_by_user_id_fkey';
            columns: ['claimed_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listings_claimed_by_user_id_fkey';
            columns: ['claimed_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listings_claimed_event_id_fkey';
            columns: ['claimed_event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listings_claimed_event_id_fkey';
            columns: ['claimed_event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listings_submitter_user_id_fkey';
            columns: ['submitter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'community_listings_submitter_user_id_fkey';
            columns: ['submitter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          joined_at: string;
          last_read_at: string | null;
          muted_at: string | null;
          role: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          last_read_at?: string | null;
          muted_at?: string | null;
          role?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          joined_at?: string;
          last_read_at?: string | null;
          muted_at?: string | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          context_id: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          dm_key: string | null;
          id: string;
          kind: string;
          last_message_at: string | null;
          title: string | null;
        };
        Insert: {
          context_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dm_key?: string | null;
          id?: string;
          kind: string;
          last_message_at?: string | null;
          title?: string | null;
        };
        Update: {
          context_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          dm_key?: string | null;
          id?: string;
          kind?: string;
          last_message_at?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      deletion_requests: {
        Row: {
          id: string;
          reason: string | null;
          requested_at: string;
          resolved_at: string | null;
          scheduled_for: string;
          status: string;
          user_id: string | null;
        };
        Insert: {
          id?: string;
          reason?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          scheduled_for: string;
          status?: string;
          user_id?: string | null;
        };
        Update: {
          id?: string;
          reason?: string | null;
          requested_at?: string;
          resolved_at?: string | null;
          scheduled_for?: string;
          status?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      email_suppressions: {
        Row: {
          address: string;
          created_at: string;
          last_event_at: string;
          provider_message_id: string | null;
          reason: string;
        };
        Insert: {
          address: string;
          created_at?: string;
          last_event_at?: string;
          provider_message_id?: string | null;
          reason: string;
        };
        Update: {
          address?: string;
          created_at?: string;
          last_event_at?: string;
          provider_message_id?: string | null;
          reason?: string;
        };
        Relationships: [];
      };
      event_badge_access: {
        Row: {
          access_kind: string;
          created_at: string;
          event_id: string;
          paid_at: string | null;
          purchased_by_user_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string;
        };
        Insert: {
          access_kind?: string;
          created_at?: string;
          event_id: string;
          paid_at?: string | null;
          purchased_by_user_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          access_kind?: string;
          created_at?: string;
          event_id?: string;
          paid_at?: string | null;
          purchased_by_user_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_badge_access_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_badge_access_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_badge_access_purchased_by_user_id_fkey';
            columns: ['purchased_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_badge_access_purchased_by_user_id_fkey';
            columns: ['purchased_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_badges: {
        Row: {
          created_at: string;
          description: string | null;
          event_id: string;
          grant_rule: string;
          icon_url: string | null;
          id: string;
          label: string;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          event_id: string;
          grant_rule?: string;
          icon_url?: string | null;
          id?: string;
          label: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          event_id?: string;
          grant_rule?: string;
          icon_url?: string | null;
          id?: string;
          label?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_badges_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_badges_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
        ];
      };
      event_brackets: {
        Row: {
          config: Json;
          created_at: string;
          division_id: string | null;
          format: string;
          id: string;
          owner_user_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string;
          division_id?: string | null;
          format: string;
          id?: string;
          owner_user_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          division_id?: string | null;
          format?: string;
          id?: string;
          owner_user_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_brackets_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'event_divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_brackets_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_brackets_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_co_hosts: {
        Row: {
          added_at: string;
          added_by: string | null;
          event_id: string;
          host_group_id: string | null;
          host_user_id: string | null;
          id: string;
        };
        Insert: {
          added_at?: string;
          added_by?: string | null;
          event_id: string;
          host_group_id?: string | null;
          host_user_id?: string | null;
          id?: string;
        };
        Update: {
          added_at?: string;
          added_by?: string | null;
          event_id?: string;
          host_group_id?: string | null;
          host_user_id?: string | null;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_co_hosts_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_added_by_fkey';
            columns: ['added_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_host_group_id_fkey';
            columns: ['host_group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_host_user_id_fkey';
            columns: ['host_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_co_hosts_host_user_id_fkey';
            columns: ['host_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_divisions: {
        Row: {
          age_group: Database['public']['Enums']['age_group'];
          allow_free_agents: boolean;
          capacity_kind: string | null;
          created_at: string;
          ends_at: string | null;
          event_id: string;
          format: Database['public']['Enums']['format'];
          gender: Database['public']['Enums']['gender'];
          id: string;
          label: string;
          max_spots: number | null;
          position_roster: Json | null;
          price_cents: number | null;
          price_unit: Database['public']['Enums']['price_unit'];
          prize_purse_cents: number | null;
          prize_text: string | null;
          runner_up_entry_id: string | null;
          skill_tier: Database['public']['Enums']['skill_tier'];
          sort_order: number;
          starts_at: string | null;
          surface: Database['public']['Enums']['surface'];
          team_composition: Database['public']['Enums']['team_composition'];
          team_registration_mode: Database['public']['Enums']['team_registration_mode'] | null;
          team_size: number | null;
          third_place_entry_id: string | null;
          tier_label: string | null;
          updated_at: string;
          winner_entry_id: string | null;
          winner_recorded_at: string | null;
        };
        Insert: {
          age_group?: Database['public']['Enums']['age_group'];
          allow_free_agents?: boolean;
          capacity_kind?: string | null;
          created_at?: string;
          ends_at?: string | null;
          event_id: string;
          format: Database['public']['Enums']['format'];
          gender: Database['public']['Enums']['gender'];
          id?: string;
          label: string;
          max_spots?: number | null;
          position_roster?: Json | null;
          price_cents?: number | null;
          price_unit?: Database['public']['Enums']['price_unit'];
          prize_purse_cents?: number | null;
          prize_text?: string | null;
          runner_up_entry_id?: string | null;
          skill_tier: Database['public']['Enums']['skill_tier'];
          sort_order?: number;
          starts_at?: string | null;
          surface: Database['public']['Enums']['surface'];
          team_composition?: Database['public']['Enums']['team_composition'];
          team_registration_mode?: Database['public']['Enums']['team_registration_mode'] | null;
          team_size?: number | null;
          third_place_entry_id?: string | null;
          tier_label?: string | null;
          updated_at?: string;
          winner_entry_id?: string | null;
          winner_recorded_at?: string | null;
        };
        Update: {
          age_group?: Database['public']['Enums']['age_group'];
          allow_free_agents?: boolean;
          capacity_kind?: string | null;
          created_at?: string;
          ends_at?: string | null;
          event_id?: string;
          format?: Database['public']['Enums']['format'];
          gender?: Database['public']['Enums']['gender'];
          id?: string;
          label?: string;
          max_spots?: number | null;
          position_roster?: Json | null;
          price_cents?: number | null;
          price_unit?: Database['public']['Enums']['price_unit'];
          prize_purse_cents?: number | null;
          prize_text?: string | null;
          runner_up_entry_id?: string | null;
          skill_tier?: Database['public']['Enums']['skill_tier'];
          sort_order?: number;
          starts_at?: string | null;
          surface?: Database['public']['Enums']['surface'];
          team_composition?: Database['public']['Enums']['team_composition'];
          team_registration_mode?: Database['public']['Enums']['team_registration_mode'] | null;
          team_size?: number | null;
          third_place_entry_id?: string | null;
          tier_label?: string | null;
          updated_at?: string;
          winner_entry_id?: string | null;
          winner_recorded_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_divisions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_divisions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_divisions_runner_up_entry_id_fkey';
            columns: ['runner_up_entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_divisions_third_place_entry_id_fkey';
            columns: ['third_place_entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_divisions_winner_entry_id_fkey';
            columns: ['winner_entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      event_participant_payments: {
        Row: {
          amount_paid_cents: number | null;
          checkout_session_id: string | null;
          created_at: string;
          paid_at: string | null;
          membership_id: string | null;
          participant_id: string;
          pass_purchase_id: string | null;
          payment_intent_id: string | null;
          payment_status: string;
          updated_at: string;
        };
        Insert: {
          amount_paid_cents?: number | null;
          checkout_session_id?: string | null;
          created_at?: string;
          paid_at?: string | null;
          participant_id: string;
          pass_purchase_id?: string | null;
          payment_intent_id?: string | null;
          payment_status?: string;
          updated_at?: string;
        };
        Update: {
          amount_paid_cents?: number | null;
          checkout_session_id?: string | null;
          created_at?: string;
          paid_at?: string | null;
          membership_id?: string | null;
          participant_id?: string;
          pass_purchase_id?: string | null;
          payment_intent_id?: string | null;
          payment_status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_participant_payments_participant_id_fkey';
            columns: ['participant_id'];
            isOneToOne: true;
            referencedRelation: 'event_participants';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participant_payments_pass_purchase_id_fkey';
            columns: ['pass_purchase_id'];
            isOneToOne: false;
            referencedRelation: 'pass_purchases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participant_payments_membership_id_fkey';
            columns: ['membership_id'];
            isOneToOne: false;
            referencedRelation: 'host_memberships';
            referencedColumns: ['id'];
          },
        ];
      };
      event_participants: {
        Row: {
          division_id: string;
          id: string;
          joined_at: string;
          notes: string | null;
          position: string | null;
          reminder_24h_sent_at: string | null;
          reminder_2h_sent_at: string | null;
          role: string;
          user_id: string | null;
        };
        Insert: {
          division_id: string;
          id?: string;
          joined_at?: string;
          notes?: string | null;
          position?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          role: string;
          user_id?: string | null;
        };
        Update: {
          division_id?: string;
          id?: string;
          joined_at?: string;
          notes?: string | null;
          position?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_2h_sent_at?: string | null;
          role?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_participants_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'event_divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_payment_audit: {
        Row: {
          action: string;
          amount_cents: number;
          category: string;
          event_id: string;
          id: string;
          occurred_at: string;
          off_platform: boolean;
          payment_intent_id: string | null;
          user_id: string | null;
        };
        Insert: {
          action: string;
          amount_cents: number;
          category?: string;
          event_id: string;
          id?: string;
          occurred_at?: string;
          off_platform?: boolean;
          payment_intent_id?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: string;
          amount_cents?: number;
          category?: string;
          event_id?: string;
          id?: string;
          occurred_at?: string;
          off_platform?: boolean;
          payment_intent_id?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_payment_audit_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_payment_audit_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_payment_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_payment_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_sponsor_access: {
        Row: {
          access_kind: string;
          created_at: string;
          event_id: string;
          paid_at: string | null;
          purchased_by_user_id: string | null;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string;
        };
        Insert: {
          access_kind?: string;
          created_at?: string;
          event_id: string;
          paid_at?: string | null;
          purchased_by_user_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Update: {
          access_kind?: string;
          created_at?: string;
          event_id?: string;
          paid_at?: string | null;
          purchased_by_user_id?: string | null;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_sponsor_access_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_sponsor_access_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
        ];
      };
      event_sponsors: {
        Row: {
          blurb: string | null;
          created_at: string;
          discount_code: string | null;
          event_id: string;
          id: string;
          link_url: string | null;
          logo_url: string | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          blurb?: string | null;
          created_at?: string;
          discount_code?: string | null;
          event_id: string;
          id?: string;
          link_url?: string | null;
          logo_url?: string | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          blurb?: string | null;
          created_at?: string;
          discount_code?: string | null;
          event_id?: string;
          id?: string;
          link_url?: string | null;
          logo_url?: string | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_sponsors_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_sponsors_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
        ];
      };
      event_team_entries: {
        Row: {
          captain_display_name: string | null;
          captain_id: string | null;
          captain_phone: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          division_id: string;
          forfeited_at: string | null;
          id: string;
          registered_at: string;
          source: string;
          team_id: string | null;
          updated_at: string;
        };
        Insert: {
          captain_display_name?: string | null;
          captain_id?: string | null;
          captain_phone?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          division_id: string;
          forfeited_at?: string | null;
          id?: string;
          registered_at?: string;
          source: string;
          team_id?: string | null;
          updated_at?: string;
        };
        Update: {
          captain_display_name?: string | null;
          captain_id?: string | null;
          captain_phone?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          division_id?: string;
          forfeited_at?: string | null;
          id?: string;
          registered_at?: string;
          source?: string;
          team_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_team_entries_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_entries_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_entries_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'event_divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_entries_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      event_team_entry_members: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          entry_id: string;
          id: string;
          sort_order: number;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          entry_id: string;
          id?: string;
          sort_order?: number;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          entry_id?: string;
          id?: string;
          sort_order?: number;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_team_entry_members_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_entry_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_entry_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_team_payments: {
        Row: {
          amount_paid_cents: number | null;
          captain_id: string | null;
          checkout_session_id: string | null;
          created_at: string;
          entry_id: string;
          id: string;
          paid_at: string | null;
          payment_intent_id: string | null;
          payment_note: string | null;
          payment_status: string;
          updated_at: string;
        };
        Insert: {
          amount_paid_cents?: number | null;
          captain_id?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          entry_id: string;
          id?: string;
          paid_at?: string | null;
          payment_intent_id?: string | null;
          payment_note?: string | null;
          payment_status?: string;
          updated_at?: string;
        };
        Update: {
          amount_paid_cents?: number | null;
          captain_id?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          entry_id?: string;
          id?: string;
          paid_at?: string | null;
          payment_intent_id?: string | null;
          payment_note?: string | null;
          payment_status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_team_payments_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_payments_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_team_payments_entry_fk';
            columns: ['entry_id'];
            isOneToOne: true;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      event_tips: {
        Row: {
          amount_cents: number;
          created_at: string;
          event_id: string;
          host_id: string | null;
          id: string;
          message: string | null;
          paid_at: string | null;
          platform_fee_cents: number;
          refunded_at: string | null;
          status: string;
          stripe_payment_intent_id: string | null;
          stripe_session_id: string | null;
          tipper_display_name: string | null;
          tipper_user_id: string | null;
        };
        Insert: {
          amount_cents: number;
          created_at?: string;
          event_id: string;
          host_id?: string | null;
          id?: string;
          message?: string | null;
          paid_at?: string | null;
          platform_fee_cents?: number;
          refunded_at?: string | null;
          status?: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          tipper_display_name?: string | null;
          tipper_user_id?: string | null;
        };
        Update: {
          amount_cents?: number;
          created_at?: string;
          event_id?: string;
          host_id?: string | null;
          id?: string;
          message?: string | null;
          paid_at?: string | null;
          platform_fee_cents?: number;
          refunded_at?: string | null;
          status?: string;
          stripe_payment_intent_id?: string | null;
          stripe_session_id?: string | null;
          tipper_display_name?: string | null;
          tipper_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_tips_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_tips_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
        ];
      };
      event_waitlist: {
        Row: {
          created_at: string;
          event_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'event_waitlist_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_waitlist_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_waitlist_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'event_waitlist_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      event_waivers: {
        Row: {
          body: string | null;
          created_at: string;
          event_id: string;
          external_url: string | null;
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          event_id: string;
          external_url?: string | null;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          event_id?: string;
          external_url?: string | null;
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'event_waivers_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: true;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
        ];
      };
      waiver_signatures: {
        Row: {
          event_id: string;
          id: string;
          method: string;
          recorded_by_user_id: string | null;
          signed_at: string;
          signed_name: string;
          user_id: string | null;
          waiver_version: number;
        };
        Insert: {
          event_id: string;
          id?: string;
          method?: string;
          recorded_by_user_id?: string | null;
          signed_at?: string;
          signed_name: string;
          user_id?: string | null;
          waiver_version: number;
        };
        Update: {
          event_id?: string;
          id?: string;
          method?: string;
          recorded_by_user_id?: string | null;
          signed_at?: string;
          signed_name?: string;
          user_id?: string | null;
          waiver_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'waiver_signatures_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'waiver_signatures_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      events: {
        Row: {
          accepts_pass_credits: boolean;
          address_line: string;
          city: string;
          country: string;
          created_at: string;
          description: string;
          ends_at: string;
          external_registration_instructions: string | null;
          external_registration_url: string | null;
          fundraiser_beneficiary: string | null;
          geo: unknown;
          hero_image_url: string | null;
          host_absorbs_fee: boolean;
          host_group_id: string | null;
          host_id: string | null;
          id: string;
          is_fundraiser: boolean;
          pass_processing_fee_to_buyer: boolean;
          payment_instructions: string | null;
          payments_off_platform: boolean;
          payout_group_id: string | null;
          postal_code: string;
          refund_window_hours: number;
          region: string;
          registration_closes_at: string | null;
          registration_close_offset_minutes: number | null;
          registration_override: string | null;
          registration_mode: Database['public']['Enums']['registration_mode'];
          rules: string;
          sanctioning_body: string | null;
          series_name: string | null;
          series_position: number | null;
          series_size: number | null;
          short_code: string;
          starts_at: string;
          status: Database['public']['Enums']['event_status'];
          surface: Database['public']['Enums']['surface'];
          theme_tags: string[];
          time_zone: string | null;
          title: string;
          type: Database['public']['Enums']['event_type'];
          updated_at: string;
          venue_name: string | null;
          visibility: Database['public']['Enums']['visibility'];
        };
        Insert: {
          address_line: string;
          city: string;
          country: string;
          created_at?: string;
          description?: string;
          ends_at: string;
          external_registration_instructions?: string | null;
          external_registration_url?: string | null;
          fundraiser_beneficiary?: string | null;
          accepts_pass_credits?: boolean;
          geo: unknown;
          hero_image_url?: string | null;
          host_absorbs_fee?: boolean;
          host_group_id?: string | null;
          host_id?: string | null;
          id?: string;
          is_fundraiser?: boolean;
          pass_processing_fee_to_buyer?: boolean;
          payment_instructions?: string | null;
          payments_off_platform?: boolean;
          payout_group_id?: string | null;
          postal_code: string;
          refund_window_hours?: number;
          region: string;
          registration_closes_at?: string | null;
          registration_close_offset_minutes?: number | null;
          registration_override?: string | null;
          registration_mode?: Database['public']['Enums']['registration_mode'];
          rules?: string;
          sanctioning_body?: string | null;
          series_name?: string | null;
          series_position?: number | null;
          series_size?: number | null;
          short_code: string;
          starts_at: string;
          status?: Database['public']['Enums']['event_status'];
          surface: Database['public']['Enums']['surface'];
          theme_tags?: string[];
          time_zone?: string | null;
          title: string;
          type: Database['public']['Enums']['event_type'];
          updated_at?: string;
          venue_name?: string | null;
          visibility?: Database['public']['Enums']['visibility'];
        };
        Update: {
          address_line?: string;
          city?: string;
          country?: string;
          created_at?: string;
          description?: string;
          ends_at?: string;
          external_registration_instructions?: string | null;
          external_registration_url?: string | null;
          fundraiser_beneficiary?: string | null;
          accepts_pass_credits?: boolean;
          geo?: unknown;
          hero_image_url?: string | null;
          host_absorbs_fee?: boolean;
          host_group_id?: string | null;
          host_id?: string | null;
          id?: string;
          is_fundraiser?: boolean;
          pass_processing_fee_to_buyer?: boolean;
          payment_instructions?: string | null;
          payments_off_platform?: boolean;
          payout_group_id?: string | null;
          postal_code?: string;
          refund_window_hours?: number;
          region?: string;
          registration_closes_at?: string | null;
          registration_close_offset_minutes?: number | null;
          registration_override?: string | null;
          registration_mode?: Database['public']['Enums']['registration_mode'];
          rules?: string;
          sanctioning_body?: string | null;
          series_name?: string | null;
          series_position?: number | null;
          series_size?: number | null;
          short_code?: string;
          starts_at?: string;
          status?: Database['public']['Enums']['event_status'];
          surface?: Database['public']['Enums']['surface'];
          theme_tags?: string[];
          time_zone?: string | null;
          title?: string;
          type?: Database['public']['Enums']['event_type'];
          updated_at?: string;
          venue_name?: string | null;
          visibility?: Database['public']['Enums']['visibility'];
        };
        Relationships: [
          {
            foreignKeyName: 'events_host_group_id_fkey';
            columns: ['host_group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      friendships: {
        Row: {
          created_at: string;
          friend_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          friend_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          friend_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'friendships_friend_id_fkey';
            columns: ['friend_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_friend_id_fkey';
            columns: ['friend_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'friendships_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      group_followers: {
        Row: {
          followed_at: string;
          group_id: string;
          user_id: string;
        };
        Insert: {
          followed_at?: string;
          group_id: string;
          user_id: string;
        };
        Update: {
          followed_at?: string;
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_followers_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_followers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_followers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          role: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          role?: Database['public']['Enums']['group_role'];
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          role?: Database['public']['Enums']['group_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_members_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'group_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      group_stripe_accounts: {
        Row: {
          charges_enabled: boolean;
          created_at: string;
          details_submitted: boolean;
          group_id: string;
          payouts_enabled: boolean;
          stripe_account_id: string;
          updated_at: string;
        };
        Insert: {
          charges_enabled?: boolean;
          created_at?: string;
          details_submitted?: boolean;
          group_id: string;
          payouts_enabled?: boolean;
          stripe_account_id: string;
          updated_at?: string;
        };
        Update: {
          charges_enabled?: boolean;
          created_at?: string;
          details_submitted?: boolean;
          group_id?: string;
          payouts_enabled?: boolean;
          stripe_account_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_stripe_accounts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: true;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      group_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          group_id: string;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          trial_end: string | null;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          group_id: string;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          group_id?: string;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'group_subscriptions_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: true;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      groups: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string;
          hero_image_url: string | null;
          home_city: string | null;
          id: string;
          name: string;
          region: string | null;
          slug: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string;
          hero_image_url?: string | null;
          home_city?: string | null;
          id?: string;
          name: string;
          region?: string | null;
          slug: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string;
          hero_image_url?: string | null;
          home_city?: string | null;
          id?: string;
          name?: string;
          region?: string | null;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'groups_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'groups_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      host_event_templates: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          payload: Json;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          payload?: Json;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          payload?: Json;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      host_membership_plans: {
        Row: {
          created_at: string;
          description: string | null;
          host_id: string | null;
          id: string;
          price_cents: number;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          host_id?: string | null;
          id?: string;
          price_cents: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          host_id?: string | null;
          id?: string;
          price_cents?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'host_membership_plans_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      host_memberships: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          host_id: string | null;
          id: string;
          member_user_id: string | null;
          plan_id: string;
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          title_snapshot: string;
          updated_at: string;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          host_id?: string | null;
          id?: string;
          member_user_id?: string | null;
          plan_id: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          title_snapshot: string;
          updated_at?: string;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          host_id?: string | null;
          id?: string;
          member_user_id?: string | null;
          plan_id?: string;
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          title_snapshot?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'host_memberships_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'host_membership_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'host_memberships_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'host_memberships_member_user_id_fkey';
            columns: ['member_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      host_passes: {
        Row: {
          created_at: string;
          credit_count: number;
          description: string | null;
          expires_in_days: number | null;
          host_id: string | null;
          id: string;
          price_cents: number;
          status: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          credit_count: number;
          description?: string | null;
          expires_in_days?: number | null;
          host_id?: string | null;
          id?: string;
          price_cents: number;
          status?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          credit_count?: number;
          description?: string | null;
          expires_in_days?: number | null;
          host_id?: string | null;
          id?: string;
          price_cents?: number;
          status?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'host_passes_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      pass_purchases: {
        Row: {
          amount_paid_cents: number | null;
          buyer_user_id: string | null;
          checkout_session_id: string | null;
          created_at: string;
          credits_total: number;
          credits_used: number;
          expires_at: string | null;
          host_id: string | null;
          id: string;
          paid_at: string | null;
          pass_id: string;
          payment_intent_id: string | null;
          payment_status: string;
          price_cents: number;
          title_snapshot: string;
        };
        Insert: {
          amount_paid_cents?: number | null;
          buyer_user_id?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          credits_total: number;
          credits_used?: number;
          expires_at?: string | null;
          host_id?: string | null;
          id?: string;
          paid_at?: string | null;
          pass_id: string;
          payment_intent_id?: string | null;
          payment_status?: string;
          price_cents: number;
          title_snapshot: string;
        };
        Update: {
          amount_paid_cents?: number | null;
          buyer_user_id?: string | null;
          checkout_session_id?: string | null;
          created_at?: string;
          credits_total?: number;
          credits_used?: number;
          expires_at?: string | null;
          host_id?: string | null;
          id?: string;
          paid_at?: string | null;
          pass_id?: string;
          payment_intent_id?: string | null;
          payment_status?: string;
          price_cents?: number;
          title_snapshot?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pass_purchases_pass_id_fkey';
            columns: ['pass_id'];
            isOneToOne: false;
            referencedRelation: 'host_passes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pass_purchases_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'pass_purchases_buyer_user_id_fkey';
            columns: ['buyer_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      host_stripe_accounts: {
        Row: {
          charges_enabled: boolean;
          created_at: string;
          details_submitted: boolean;
          id: string;
          payouts_enabled: boolean;
          stripe_account_id: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          charges_enabled?: boolean;
          created_at?: string;
          details_submitted?: boolean;
          id?: string;
          payouts_enabled?: boolean;
          stripe_account_id: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          charges_enabled?: boolean;
          created_at?: string;
          details_submitted?: boolean;
          id?: string;
          payouts_enabled?: boolean;
          stripe_account_id?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'host_stripe_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'host_stripe_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      host_subscriptions: {
        Row: {
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          plan: string | null;
          status: string;
          stripe_customer_id: string;
          stripe_subscription_id: string | null;
          trial_end: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan?: string | null;
          status?: string;
          stripe_customer_id: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          plan?: string | null;
          status?: string;
          stripe_customer_id?: string;
          stripe_subscription_id?: string | null;
          trial_end?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'host_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'host_subscriptions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      league_schedule_matches: {
        Row: {
          away_entry_id: string | null;
          away_score: number | null;
          court_label: string | null;
          created_at: string;
          division_id: string;
          home_entry_id: string | null;
          home_score: number | null;
          id: string;
          notes: string | null;
          reminded_at: string | null;
          scheduled_at: string;
          status: string;
          updated_at: string;
          week_number: number;
        };
        Insert: {
          away_entry_id?: string | null;
          away_score?: number | null;
          court_label?: string | null;
          created_at?: string;
          division_id: string;
          home_entry_id?: string | null;
          home_score?: number | null;
          id?: string;
          notes?: string | null;
          reminded_at?: string | null;
          scheduled_at: string;
          status?: string;
          updated_at?: string;
          week_number: number;
        };
        Update: {
          away_entry_id?: string | null;
          away_score?: number | null;
          court_label?: string | null;
          created_at?: string;
          division_id?: string;
          home_entry_id?: string | null;
          home_score?: number | null;
          id?: string;
          notes?: string | null;
          reminded_at?: string | null;
          scheduled_at?: string;
          status?: string;
          updated_at?: string;
          week_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'league_schedule_matches_away_entry_id_fkey';
            columns: ['away_entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'league_schedule_matches_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'event_divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'league_schedule_matches_home_entry_id_fkey';
            columns: ['home_entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      marketing_attribution: {
        Row: {
          attached_at: string;
          campaign: string | null;
          captured_at: string;
          content: string | null;
          landing_path: string | null;
          medium: string | null;
          referrer: string | null;
          source: string | null;
          term: string | null;
          user_id: string;
        };
        Insert: {
          attached_at?: string;
          campaign?: string | null;
          captured_at: string;
          content?: string | null;
          landing_path?: string | null;
          medium?: string | null;
          referrer?: string | null;
          source?: string | null;
          term?: string | null;
          user_id: string;
        };
        Update: {
          attached_at?: string;
          campaign?: string | null;
          captured_at?: string;
          content?: string | null;
          landing_path?: string | null;
          medium?: string | null;
          referrer?: string | null;
          source?: string | null;
          term?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketing_attribution_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketing_attribution_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      match_live_scores: {
        Row: {
          bracket_id: string | null;
          created_at: string;
          division_id: string | null;
          event_id: string | null;
          kind: string;
          live_state: Json;
          match_id: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          bracket_id?: string | null;
          created_at?: string;
          division_id?: string | null;
          event_id?: string | null;
          kind: string;
          live_state: Json;
          match_id: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          bracket_id?: string | null;
          created_at?: string;
          division_id?: string | null;
          event_id?: string | null;
          kind?: string;
          live_state?: Json;
          match_id?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'match_live_scores_bracket_id_fkey';
            columns: ['bracket_id'];
            isOneToOne: false;
            referencedRelation: 'event_brackets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_live_scores_division_id_fkey';
            columns: ['division_id'];
            isOneToOne: false;
            referencedRelation: 'event_divisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_live_scores_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_live_scores_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
        ];
      };
      media_post_reports: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          reason: string | null;
          reporter_user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          reason?: string | null;
          reporter_user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          reason?: string | null;
          reporter_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'media_post_reports_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'media_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      media_post_votes: {
        Row: {
          category: string;
          created_at: string;
          event_id: string;
          id: string;
          post_id: string;
          voter_user_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          event_id: string;
          id?: string;
          post_id: string;
          voter_user_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          event_id?: string;
          id?: string;
          post_id?: string;
          voter_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'media_post_votes_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'media_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_voter_user_id_fkey';
            columns: ['voter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_voter_user_id_fkey';
            columns: ['voter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      media_posts: {
        Row: {
          created_at: string;
          description: string;
          event_id: string | null;
          external_id: string | null;
          external_subtype: string | null;
          featured: boolean;
          id: string;
          kind: string;
          live_ended_at: string | null;
          live_started_at: string | null;
          match_id: string | null;
          provider: string;
          report_count: number;
          short_code: string | null;
          status: string;
          submitter_user_id: string;
          title: string;
          updated_at: string;
          video_url: string;
        };
        Insert: {
          created_at?: string;
          description?: string;
          event_id?: string | null;
          external_id?: string | null;
          external_subtype?: string | null;
          featured?: boolean;
          id?: string;
          kind: string;
          live_ended_at?: string | null;
          live_started_at?: string | null;
          match_id?: string | null;
          provider: string;
          report_count?: number;
          short_code?: string | null;
          status?: string;
          submitter_user_id: string;
          title: string;
          updated_at?: string;
          video_url: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          event_id?: string | null;
          external_id?: string | null;
          external_subtype?: string | null;
          featured?: boolean;
          id?: string;
          kind?: string;
          live_ended_at?: string | null;
          live_started_at?: string | null;
          match_id?: string | null;
          provider?: string;
          report_count?: number;
          short_code?: string | null;
          status?: string;
          submitter_user_id?: string;
          title?: string;
          updated_at?: string;
          video_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'media_posts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_posts_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_posts_submitter_user_id_fkey';
            columns: ['submitter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_posts_submitter_user_id_fkey';
            columns: ['submitter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      message_reports: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          reason: string | null;
          reporter_user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          reason?: string | null;
          reporter_user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          reason?: string | null;
          reporter_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_reports_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_reports_reporter_user_id_fkey';
            columns: ['reporter_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          attachments: Json;
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          edited_at: string | null;
          id: string;
          report_count: number;
          sender_id: string;
        };
        Insert: {
          attachments?: Json;
          body?: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          edited_at?: string | null;
          id?: string;
          report_count?: number;
          sender_id: string;
        };
        Update: {
          attachments?: Json;
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          edited_at?: string | null;
          id?: string;
          report_count?: number;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_deleted_by_fkey';
            columns: ['deleted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_deleted_by_fkey';
            columns: ['deleted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_outbox: {
        Row: {
          attempts: number;
          channel: string;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          kind: string;
          last_error: string | null;
          payload: Json;
          provider_id: string | null;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
          to_address: string;
          user_id: string | null;
        };
        Insert: {
          attempts?: number;
          channel: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          kind: string;
          last_error?: string | null;
          payload: Json;
          provider_id?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          to_address: string;
          user_id?: string | null;
        };
        Update: {
          attempts?: number;
          channel?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          kind?: string;
          last_error?: string | null;
          payload?: Json;
          provider_id?: string | null;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
          to_address?: string;
          user_id?: string | null;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          channel_overrides: Json;
          email_enabled: boolean;
          in_app_enabled: boolean;
          push_enabled: boolean;
          quiet_hours_end: string | null;
          quiet_hours_start: string | null;
          sms_enabled: boolean;
          sms_opted_in_at: string | null;
          sms_opted_out_at: string | null;
          sms_phone: string | null;
          timezone: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel_overrides?: Json;
          email_enabled?: boolean;
          in_app_enabled?: boolean;
          push_enabled?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          sms_enabled?: boolean;
          sms_opted_in_at?: string | null;
          sms_opted_out_at?: string | null;
          sms_phone?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel_overrides?: Json;
          email_enabled?: boolean;
          in_app_enabled?: boolean;
          push_enabled?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          sms_enabled?: boolean;
          sms_opted_in_at?: string | null;
          sms_opted_out_at?: string | null;
          sms_phone?: string | null;
          timezone?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_worker_kick: {
        Row: {
          id: number;
          last_kicked_at: string;
        };
        Insert: {
          id?: number;
          last_kicked_at?: string;
        };
        Update: {
          id?: number;
          last_kicked_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          body: string | null;
          created_at: string;
          data: Json;
          href: string | null;
          id: string;
          kind: string;
          read_at: string | null;
          title: string;
          user_id: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          href?: string | null;
          id?: string;
          kind: string;
          read_at?: string | null;
          title: string;
          user_id: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          data?: Json;
          href?: string | null;
          id?: string;
          kind?: string;
          read_at?: string | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      pro_grants: {
        Row: {
          created_at: string;
          granted_until: string;
          id: string;
          reason: string;
          source_ref: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_until: string;
          id?: string;
          reason?: string;
          source_ref?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_until?: string;
          id?: string;
          reason?: string;
          source_ref?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pro_grants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      referrals: {
        Row: {
          created_at: string;
          id: string;
          qualified_at: string | null;
          referred_user_id: string;
          referrer_user_id: string;
          rewarded_at: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          qualified_at?: string | null;
          referred_user_id: string;
          referrer_user_id: string;
          rewarded_at?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          qualified_at?: string | null;
          referred_user_id?: string;
          referrer_user_id?: string;
          rewarded_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'referrals_referrer_user_id_fkey';
            columns: ['referrer_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'referrals_referred_user_id_fkey';
            columns: ['referred_user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          auto_accept_team_invites: boolean;
          avatar_url: string | null;
          business_address: string | null;
          business_name: string | null;
          created_at: string;
          deleted_at: string | null;
          deletion_reason: string | null;
          discoverable: boolean;
          display_name: string;
          facebook_handle: string | null;
          first_name: string | null;
          handle: string;
          hero_image_url: string | null;
          home_city: string | null;
          id: string;
          instagram_handle: string | null;
          is_platform_admin: boolean;
          last_name: string | null;
          latitude: number | null;
          longitude: number | null;
          primary_position: string | null;
          secondary_position: string | null;
          show_pro_badge: boolean;
          tax_id: string | null;
          tertiary_position: string | null;
          theme_preference: string;
          tiktok_handle: string | null;
          twitter_handle: string | null;
          updated_at: string;
          website_url: string | null;
          youtube_handle: string | null;
        };
        Insert: {
          auto_accept_team_invites?: boolean;
          avatar_url?: string | null;
          business_address?: string | null;
          business_name?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          discoverable?: boolean;
          display_name: string;
          facebook_handle?: string | null;
          first_name?: string | null;
          handle: string;
          hero_image_url?: string | null;
          home_city?: string | null;
          id: string;
          instagram_handle?: string | null;
          is_platform_admin?: boolean;
          last_name?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          primary_position?: string | null;
          secondary_position?: string | null;
          show_pro_badge?: boolean;
          tax_id?: string | null;
          tertiary_position?: string | null;
          theme_preference?: string;
          tiktok_handle?: string | null;
          twitter_handle?: string | null;
          updated_at?: string;
          website_url?: string | null;
          youtube_handle?: string | null;
        };
        Update: {
          auto_accept_team_invites?: boolean;
          avatar_url?: string | null;
          business_address?: string | null;
          business_name?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          deletion_reason?: string | null;
          discoverable?: boolean;
          display_name?: string;
          facebook_handle?: string | null;
          first_name?: string | null;
          handle?: string;
          hero_image_url?: string | null;
          home_city?: string | null;
          id?: string;
          instagram_handle?: string | null;
          is_platform_admin?: boolean;
          last_name?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          primary_position?: string | null;
          secondary_position?: string | null;
          show_pro_badge?: boolean;
          tax_id?: string | null;
          tertiary_position?: string | null;
          theme_preference?: string;
          tiktok_handle?: string | null;
          twitter_handle?: string | null;
          updated_at?: string;
          website_url?: string | null;
          youtube_handle?: string | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          failure_count: number;
          id: string;
          last_used_at: string | null;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          failure_count?: number;
          id?: string;
          last_used_at?: string | null;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          failure_count?: number;
          id?: string;
          last_used_at?: string | null;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        Insert: {
          count: number;
          key: string;
          window_start?: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      spatial_ref_sys: {
        Row: {
          auth_name: string | null;
          auth_srid: number | null;
          proj4text: string | null;
          srid: number;
          srtext: string | null;
        };
        Insert: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid: number;
          srtext?: string | null;
        };
        Update: {
          auth_name?: string | null;
          auth_srid?: number | null;
          proj4text?: string | null;
          srid?: number;
          srtext?: string | null;
        };
        Relationships: [];
      };
      stripe_webhook_events: {
        Row: {
          event_type: string;
          id: string;
          processed_at: string | null;
          received_at: string;
        };
        Insert: {
          event_type: string;
          id: string;
          processed_at?: string | null;
          received_at?: string;
        };
        Update: {
          event_type?: string;
          id?: string;
          processed_at?: string | null;
          received_at?: string;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          invited_at: string | null;
          joined_at: string;
          status: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          invited_at?: string | null;
          joined_at?: string;
          status?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          invited_at?: string | null;
          joined_at?: string;
          status?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          captain_id: string;
          created_at: string;
          deleted_at: string | null;
          extra_member_count: number;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          captain_id: string;
          created_at?: string;
          deleted_at?: string | null;
          extra_member_count?: number;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          captain_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          extra_member_count?: number;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'teams_captain_id_fkey';
            columns: ['captain_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      user_badges: {
        Row: {
          awarded_at: string;
          badge_key: string;
          context: Json | null;
          hidden: boolean;
          id: string;
          source: string;
          user_id: string;
        };
        Insert: {
          awarded_at?: string;
          badge_key: string;
          context?: Json | null;
          hidden?: boolean;
          id?: string;
          source?: string;
          user_id: string;
        };
        Update: {
          awarded_at?: string;
          badge_key?: string;
          context?: Json | null;
          hidden?: boolean;
          id?: string;
          source?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_badges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_badges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      event_team_entry_members_public: {
        Row: {
          display_name: string | null;
          entry_id: string | null;
          id: string | null;
          sort_order: number | null;
        };
        Insert: {
          display_name?: string | null;
          entry_id?: string | null;
          id?: string | null;
          sort_order?: number | null;
        };
        Update: {
          display_name?: string | null;
          entry_id?: string | null;
          id?: string | null;
          sort_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'event_team_entry_members_entry_id_fkey';
            columns: ['entry_id'];
            isOneToOne: false;
            referencedRelation: 'event_team_entries';
            referencedColumns: ['id'];
          },
        ];
      };
      events_view: {
        Row: {
          address_line: string | null;
          attendee_count: number | null;
          city: string | null;
          country: string | null;
          created_at: string | null;
          description: string | null;
          ends_at: string | null;
          external_registration_instructions: string | null;
          external_registration_url: string | null;
          fundraiser_beneficiary: string | null;
          geo: unknown;
          hero_image_url: string | null;
          host_absorbs_fee: boolean | null;
          host_group_id: string | null;
          host_id: string | null;
          id: string | null;
          is_fundraiser: boolean | null;
          latitude: number | null;
          longitude: number | null;
          pass_processing_fee_to_buyer: boolean | null;
          payment_instructions: string | null;
          payments_off_platform: boolean | null;
          postal_code: string | null;
          refund_window_hours: number | null;
          region: string | null;
          registration_closes_at: string | null;
          registration_close_offset_minutes: number | null;
          registration_override: string | null;
          registration_mode: Database['public']['Enums']['registration_mode'] | null;
          rules: string | null;
          sanctioning_body: string | null;
          series_name: string | null;
          series_position: number | null;
          series_size: number | null;
          short_code: string | null;
          starts_at: string | null;
          status: Database['public']['Enums']['event_status'] | null;
          surface: Database['public']['Enums']['surface'] | null;
          team_count: number | null;
          theme_tags: string[] | null;
          time_zone: string | null;
          title: string | null;
          type: Database['public']['Enums']['event_type'] | null;
          updated_at: string | null;
          venue_name: string | null;
          visibility: Database['public']['Enums']['visibility'] | null;
        };
        Insert: {
          address_line?: string | null;
          attendee_count?: never;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          ends_at?: string | null;
          external_registration_instructions?: string | null;
          external_registration_url?: string | null;
          fundraiser_beneficiary?: string | null;
          geo?: unknown;
          hero_image_url?: string | null;
          host_absorbs_fee?: boolean | null;
          host_group_id?: string | null;
          host_id?: string | null;
          id?: string | null;
          is_fundraiser?: boolean | null;
          latitude?: never;
          longitude?: never;
          pass_processing_fee_to_buyer?: boolean | null;
          payment_instructions?: string | null;
          payments_off_platform?: boolean | null;
          postal_code?: string | null;
          refund_window_hours?: number | null;
          region?: string | null;
          registration_closes_at?: string | null;
          registration_close_offset_minutes?: number | null;
          registration_override?: string | null;
          registration_mode?: Database['public']['Enums']['registration_mode'] | null;
          rules?: string | null;
          sanctioning_body?: string | null;
          series_name?: string | null;
          series_position?: number | null;
          series_size?: number | null;
          short_code?: string | null;
          starts_at?: string | null;
          status?: Database['public']['Enums']['event_status'] | null;
          surface?: Database['public']['Enums']['surface'] | null;
          team_count?: never;
          theme_tags?: string[] | null;
          time_zone?: string | null;
          title?: string | null;
          type?: Database['public']['Enums']['event_type'] | null;
          updated_at?: string | null;
          venue_name?: string | null;
          visibility?: Database['public']['Enums']['visibility'] | null;
        };
        Update: {
          address_line?: string | null;
          attendee_count?: never;
          city?: string | null;
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          ends_at?: string | null;
          external_registration_instructions?: string | null;
          external_registration_url?: string | null;
          fundraiser_beneficiary?: string | null;
          geo?: unknown;
          hero_image_url?: string | null;
          host_absorbs_fee?: boolean | null;
          host_group_id?: string | null;
          host_id?: string | null;
          id?: string | null;
          is_fundraiser?: boolean | null;
          latitude?: never;
          longitude?: never;
          pass_processing_fee_to_buyer?: boolean | null;
          payment_instructions?: string | null;
          payments_off_platform?: boolean | null;
          postal_code?: string | null;
          refund_window_hours?: number | null;
          region?: string | null;
          registration_closes_at?: string | null;
          registration_close_offset_minutes?: number | null;
          registration_override?: string | null;
          registration_mode?: Database['public']['Enums']['registration_mode'] | null;
          rules?: string | null;
          sanctioning_body?: string | null;
          series_name?: string | null;
          series_position?: number | null;
          series_size?: number | null;
          short_code?: string | null;
          starts_at?: string | null;
          status?: Database['public']['Enums']['event_status'] | null;
          surface?: Database['public']['Enums']['surface'] | null;
          team_count?: never;
          theme_tags?: string[] | null;
          time_zone?: string | null;
          title?: string | null;
          type?: Database['public']['Enums']['event_type'] | null;
          updated_at?: string | null;
          venue_name?: string | null;
          visibility?: Database['public']['Enums']['visibility'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_host_group_id_fkey';
            columns: ['host_group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      geography_columns: {
        Row: {
          coord_dimension: number | null;
          f_geography_column: unknown;
          f_table_catalog: unknown;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Relationships: [];
      };
      geometry_columns: {
        Row: {
          coord_dimension: number | null;
          f_geometry_column: unknown;
          f_table_catalog: string | null;
          f_table_name: unknown;
          f_table_schema: unknown;
          srid: number | null;
          type: string | null;
        };
        Insert: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Update: {
          coord_dimension?: number | null;
          f_geometry_column?: unknown;
          f_table_catalog?: string | null;
          f_table_name?: unknown;
          f_table_schema?: unknown;
          srid?: number | null;
          type?: string | null;
        };
        Relationships: [];
      };
      host_activity_monthly: {
        Row: {
          avg_fill_rate: number | null;
          events_count: number | null;
          gmv_cents: number | null;
          host_id: string | null;
          month_start: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'events_host_id_fkey';
            columns: ['host_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
      media_post_vote_counts: {
        Row: {
          category: string | null;
          event_id: string | null;
          post_id: string | null;
          votes: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_post_votes_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'events_view';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'media_post_votes_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'media_posts';
            referencedColumns: ['id'];
          },
        ];
      };
      metro_health_weekly: {
        Row: {
          attendees_count: number | null;
          avg_fill_rate: number | null;
          events_count: number | null;
          gmv_cents: number | null;
          metro: string | null;
          week_start: string | null;
        };
        Relationships: [];
      };
      profiles_public: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          discoverable: boolean | null;
          display_name: string | null;
          facebook_handle: string | null;
          handle: string | null;
          hero_image_url: string | null;
          home_city: string | null;
          id: string | null;
          instagram_handle: string | null;
          latitude: number | null;
          longitude: number | null;
          primary_position: string | null;
          secondary_position: string | null;
          show_pro_badge: boolean | null;
          tertiary_position: string | null;
          theme_preference: string | null;
          tiktok_handle: string | null;
          twitter_handle: string | null;
          website_url: string | null;
          youtube_handle: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          discoverable?: boolean | null;
          display_name?: string | null;
          facebook_handle?: string | null;
          handle?: string | null;
          hero_image_url?: string | null;
          home_city?: string | null;
          id?: string | null;
          instagram_handle?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          primary_position?: string | null;
          secondary_position?: string | null;
          show_pro_badge?: boolean | null;
          tertiary_position?: string | null;
          theme_preference?: string | null;
          tiktok_handle?: string | null;
          twitter_handle?: string | null;
          website_url?: string | null;
          youtube_handle?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          discoverable?: boolean | null;
          display_name?: string | null;
          facebook_handle?: string | null;
          handle?: string | null;
          hero_image_url?: string | null;
          home_city?: string | null;
          id?: string | null;
          instagram_handle?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          primary_position?: string | null;
          secondary_position?: string | null;
          show_pro_badge?: boolean | null;
          tertiary_position?: string | null;
          theme_preference?: string | null;
          tiktok_handle?: string | null;
          twitter_handle?: string | null;
          website_url?: string | null;
          youtube_handle?: string | null;
        };
        Relationships: [];
      };
      user_badges_public: {
        Row: {
          awarded_at: string | null;
          badge_key: string | null;
          context: Json | null;
          source: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_badges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_badges_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles_public';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string };
        Returns: undefined;
      };
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown };
        Returns: unknown;
      };
      _postgis_pgsql_version: { Args: never; Returns: string };
      _postgis_scripts_pgsql_version: { Args: never; Returns: string };
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown };
        Returns: number;
      };
      _postgis_stats: {
        Args: { ''?: string; att_name: string; tbl: unknown };
        Returns: string;
      };
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_sortablehash: { Args: { geom: unknown }; Returns: number };
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      _st_voronoi: {
        Args: {
          clip?: unknown;
          g1: unknown;
          return_polygons?: boolean;
          tolerance?: number;
        };
        Returns: unknown;
      };
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      addauth: { Args: { '': string }; Returns: boolean };
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              new_dim: number;
              new_srid_in: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              schema_name: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              new_dim: number;
              new_srid: number;
              new_type: string;
              table_name: string;
              use_typmod?: boolean;
            };
            Returns: string;
          };
      attach_team_to_division: {
        Args: { p_division_id: string; p_team_id: string };
        Returns: undefined;
      };
      can_access_conversation: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
      can_moderate_conversation: {
        Args: { p_conversation_id: string };
        Returns: boolean;
      };
      clear_match_live_score: {
        Args: { p_match_id: string };
        Returns: undefined;
      };
      compute_player_badge_stats: {
        Args: { p_user_id: string };
        Returns: {
          attended_event_count: number;
          distinct_positions_played: number;
          leagues_completed: number;
          max_events_with_single_host: number;
          published_event_count: number;
          tournament_championships: number;
          tournament_podiums: number;
        }[];
      };
      consume_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: {
          allowed: boolean;
          retry_after_seconds: number;
        }[];
      };
      count_unread_conversations: { Args: never; Returns: number };
      disablelongtransactions: { Args: never; Returns: string };
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string;
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | {
            Args: {
              column_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { column_name: string; table_name: string }; Returns: string };
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string;
              schema_name: string;
              table_name: string;
            };
            Returns: string;
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string };
      enablelongtransactions: { Args: never; Returns: string };
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      event_has_attendee_friend: {
        Args: { p_event_id: string };
        Returns: boolean;
      };
      event_paid_attendee_count: {
        Args: { p_event_id: string };
        Returns: number;
      };
      event_tip_total_cents: { Args: { p_event_id: string }; Returns: number };
      feature_event_stream: {
        Args: { p_event_id: string; p_media_id: string };
        Returns: undefined;
      };
      gen_event_short_code: { Args: never; Returns: string };
      gen_short_id: { Args: { len?: number }; Returns: string };
      geometry: { Args: { '': string }; Returns: unknown };
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      geomfromewkt: { Args: { '': string }; Returns: unknown };
      get_inbox: {
        Args: { p_limit?: number };
        Returns: {
          context_id: string;
          context_slug: string;
          conversation_id: string;
          is_unread: boolean;
          kind: string;
          last_message_at: string;
          last_read_at: string;
          preview: string;
          preview_sender_id: string;
          preview_sender_name: string;
          title: string;
        }[];
      };
      get_or_create_conversation: {
        Args: { p_context_id: string; p_kind: string };
        Returns: string;
      };
      get_or_create_dm: { Args: { p_other_id: string }; Returns: string };
      gettransactionid: { Args: never; Returns: unknown };
      event_attendee_ids: {
        Args: { p_event_id: string };
        Returns: { user_id: string }[];
      };
      badge_reconcile_candidate_ids: {
        Args: { p_since: string; p_now: string };
        Returns: { user_id: string }[];
      };
      grant_attended_badges_for_event: {
        Args: { p_event_id: string };
        Returns: undefined;
      };
      grant_attended_event_badges: {
        Args: { p_user_id: string };
        Returns: { badge_key: string; label: string }[];
      };
      host_paid_event_count_30d: {
        Args: { p_user_id: string };
        Returns: number;
      };
      is_anon_session: { Args: never; Returns: boolean };
      is_blocked_pair: { Args: { p_a: string; p_b: string }; Returns: boolean };
      is_bracket_match_captain: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
      is_event_host: { Args: { p_event_id: string }; Returns: boolean };
      is_event_host_for_division: {
        Args: { p_division_id: string };
        Returns: boolean;
      };
      is_league_match_captain: {
        Args: { p_match_id: string };
        Returns: boolean;
      };
      is_active_member: { Args: { p_user_id: string; p_host_id: string }; Returns: boolean };
      is_club_group: { Args: { p_group_id: string }; Returns: boolean };
      user_has_club_benefits: { Args: { p_user_id: string }; Returns: boolean };
      is_platform_admin: { Args: never; Returns: boolean };
      is_pro_host: { Args: { p_user_id: string }; Returns: boolean };
      kick_badge_reconcile: { Args: never; Returns: undefined };
      list_room_recipients: {
        Args: { p_conversation_id: string; p_exclude: string };
        Returns: {
          user_id: string;
        }[];
      };
      claim_membership_spot: {
        Args: { p_event_id: string };
        Returns: string;
      };
      longtransactionsenabled: { Args: never; Returns: boolean };
      redeem_pass_credit: {
        Args: { p_purchase_id: string; p_event_id: string };
        Returns: string;
      };
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string };
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: number;
      };
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string };
        Returns: string;
      };
      postgis_extensions_upgrade: { Args: never; Returns: string };
      postgis_full_version: { Args: never; Returns: string };
      postgis_geos_version: { Args: never; Returns: string };
      postgis_lib_build_date: { Args: never; Returns: string };
      postgis_lib_revision: { Args: never; Returns: string };
      postgis_lib_version: { Args: never; Returns: string };
      postgis_libjson_version: { Args: never; Returns: string };
      postgis_liblwgeom_version: { Args: never; Returns: string };
      postgis_libprotobuf_version: { Args: never; Returns: string };
      postgis_libxml_version: { Args: never; Returns: string };
      postgis_proj_version: { Args: never; Returns: string };
      postgis_scripts_build_date: { Args: never; Returns: string };
      postgis_scripts_installed: { Args: never; Returns: string };
      postgis_scripts_released: { Args: never; Returns: string };
      postgis_svn_version: { Args: never; Returns: string };
      postgis_type_name: {
        Args: {
          coord_dimension: number;
          geomname: string;
          use_new_name?: boolean;
        };
        Returns: string;
      };
      postgis_version: { Args: never; Returns: string };
      postgis_wagyu_version: { Args: never; Returns: string };
      purge_avatar_orphans: {
        Args: { p_grace_hours?: number };
        Returns: number;
      };
      purge_chat_attachment_orphans: {
        Args: { p_grace_hours?: number };
        Returns: number;
      };
      purge_event_badge_orphans: {
        Args: { p_grace_hours?: number };
        Returns: number;
      };
      purge_hero_image_orphans: {
        Args: { p_grace_hours?: number };
        Returns: number;
      };
      purge_sponsor_logo_orphans: {
        Args: { p_grace_hours?: number };
        Returns: number;
      };
      record_bracket_match_result: {
        Args: {
          p_actor_match_id: string;
          p_bracket_id: string;
          p_config: Json;
          p_division_id: string;
          p_format: string;
          p_match_sets: Json;
          p_matches: Json;
          p_seeds: Json;
          p_status: string;
        };
        Returns: undefined;
      };
      record_league_match_result: {
        Args: {
          p_away_score: number;
          p_home_score: number;
          p_match_id: string;
          p_status: string;
        };
        Returns: undefined;
      };
      save_bracket: {
        Args: {
          p_bracket_id: string;
          p_config: Json;
          p_division_id: string;
          p_format: string;
          p_match_sets: Json;
          p_matches: Json;
          p_seeds: Json;
          p_status: string;
        };
        Returns: undefined;
      };
      save_event: {
        Args: {
          p_event: Json;
          p_attendees: Json;
          p_waitlist: Json;
          p_teams: Json;
          p_free_agents: Json;
          p_divisions: Json;
        };
        Returns: undefined;
      };
      save_league_schedule: {
        Args: { p_division_id: string; p_matches: Json };
        Returns: undefined;
      };
      search_community_listings: {
        Args: {
          p_format?: string;
          p_lat?: number;
          p_limit?: number;
          p_lng?: number;
          p_radius_km?: number;
          p_skill_level?: string;
          p_starts_after?: string;
          p_starts_before?: string;
          p_statuses?: string[];
          p_surface?: string;
        };
        Returns: {
          city: string;
          distance_km: number;
          ends_at: string;
          external_host_name: string;
          external_url: string;
          format: string;
          id: string;
          region: string;
          short_code: string;
          skill_level: string;
          slug: string;
          starts_at: string;
          status: string;
          surface: string;
          time_zone: string;
          title: string;
        }[];
      };
      search_events: {
        Args: {
          p_age_group?: string;
          p_format?: string;
          p_gender?: string;
          p_is_fundraiser?: boolean;
          p_lat?: number;
          p_limit?: number;
          p_lng?: number;
          p_radius_km?: number;
          p_registration_mode?: string;
          p_series_name?: string;
          p_skill_band?: string;
          p_skill_level?: string;
          p_starts_after?: string;
          p_starts_before?: string;
          p_surface?: string;
          p_team_composition?: string;
          p_type?: string;
        };
        Returns: {
          address_line: string;
          attendee_count: number;
          city: string;
          country: string;
          distance_km: number;
          divisions: Json;
          ends_at: string;
          format: string;
          gender: string;
          id: string;
          is_fundraiser: boolean;
          latitude: number;
          longitude: number;
          postal_code: string;
          region: string;
          registration_mode: string;
          series_name: string;
          series_position: number;
          series_size: number;
          skill_level: string;
          spots_remaining: number;
          starts_at: string;
          status: string;
          surface: string;
          team_count: number;
          time_zone: string;
          title: string;
          type: string;
          visibility: string;
        }[];
      };
      set_user_badge_hidden: {
        Args: { p_badge_key: string; p_hidden: boolean };
        Returns: undefined;
      };
      slugify: { Args: { input: string }; Returns: string };
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown };
            Returns: number;
          };
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { '': string }; Returns: number };
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number };
        Returns: string;
      };
      st_asewkt: { Args: { '': string }; Returns: string };
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | {
            Args: {
              geom_column?: string;
              maxdecimaldigits?: number;
              pretty_bool?: boolean;
              r: Record<string, unknown>;
            };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_asgml:
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
            };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string }
        | {
            Args: {
              geog: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown;
              id?: string;
              maxdecimaldigits?: number;
              nprefix?: string;
              options?: number;
              version: number;
            };
            Returns: string;
          };
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string };
        Returns: string;
      };
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string };
      st_asmvtgeom: {
        Args: {
          bounds: unknown;
          buffer?: number;
          clip_geom?: boolean;
          extent?: number;
          geom: unknown;
        };
        Returns: unknown;
      };
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number };
            Returns: string;
          }
        | { Args: { '': string }; Returns: string };
      st_astext: { Args: { '': string }; Returns: string };
      st_astwkb:
        | {
            Args: {
              geom: unknown;
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          }
        | {
            Args: {
              geom: unknown[];
              ids: number[];
              prec?: number;
              prec_m?: number;
              prec_z?: number;
              with_boxes?: boolean;
              with_sizes?: boolean;
            };
            Returns: string;
          };
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number };
        Returns: string;
      };
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown };
        Returns: unknown;
      };
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number };
            Returns: unknown;
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number };
            Returns: unknown;
          };
      st_centroid: { Args: { '': string }; Returns: unknown };
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown };
        Returns: unknown;
      };
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean;
          param_geom: unknown;
          param_pctconvex: number;
        };
        Returns: unknown;
      };
      st_contains: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_coorddim: { Args: { geometry: unknown }; Returns: number };
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number };
        Returns: unknown;
      };
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean };
            Returns: number;
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number };
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number };
            Returns: number;
          };
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_dwithin: {
        Args: {
          geog1: unknown;
          geog2: unknown;
          tolerance: number;
          use_spheroid?: boolean;
        };
        Returns: boolean;
      };
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number };
            Returns: unknown;
          }
        | {
            Args: {
              dm?: number;
              dx: number;
              dy: number;
              dz?: number;
              geom: unknown;
            };
            Returns: unknown;
          };
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown };
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number };
        Returns: unknown;
      };
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number };
        Returns: unknown;
      };
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number };
        Returns: unknown;
      };
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number };
            Returns: unknown;
          };
      st_geogfromtext: { Args: { '': string }; Returns: unknown };
      st_geographyfromtext: { Args: { '': string }; Returns: unknown };
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string };
      st_geomcollfromtext: { Args: { '': string }; Returns: unknown };
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean;
          g: unknown;
          max_iter?: number;
          tolerance?: number;
        };
        Returns: unknown;
      };
      st_geometryfromtext: { Args: { '': string }; Returns: unknown };
      st_geomfromewkt: { Args: { '': string }; Returns: unknown };
      st_geomfromgeojson:
        | { Args: { '': Json }; Returns: unknown }
        | { Args: { '': Json }; Returns: unknown }
        | { Args: { '': string }; Returns: unknown };
      st_geomfromgml: { Args: { '': string }; Returns: unknown };
      st_geomfromkml: { Args: { '': string }; Returns: unknown };
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown };
      st_geomfromtext: { Args: { '': string }; Returns: unknown };
      st_gmltosql: { Args: { '': string }; Returns: unknown };
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean };
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_hexagongrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown };
        Returns: number;
      };
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown };
        Returns: Database['public']['CompositeTypes']['valid_detail'];
        SetofOptions: {
          from: '*';
          to: 'valid_detail';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { '': string }; Returns: number };
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown };
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown };
        Returns: number;
      };
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string };
        Returns: unknown;
      };
      st_linefromtext: { Args: { '': string }; Returns: unknown };
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown };
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number };
        Returns: unknown;
      };
      st_locatebetween: {
        Args: {
          frommeasure: number;
          geometry: unknown;
          leftrightoffset?: number;
          tomeasure: number;
        };
        Returns: unknown;
      };
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number };
        Returns: unknown;
      };
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_makevalid: {
        Args: { geom: unknown; params: string };
        Returns: unknown;
      };
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: number;
      };
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number };
        Returns: unknown;
      };
      st_mlinefromtext: { Args: { '': string }; Returns: unknown };
      st_mpointfromtext: { Args: { '': string }; Returns: unknown };
      st_mpolyfromtext: { Args: { '': string }; Returns: unknown };
      st_multilinestringfromtext: { Args: { '': string }; Returns: unknown };
      st_multipointfromtext: { Args: { '': string }; Returns: unknown };
      st_multipolygonfromtext: { Args: { '': string }; Returns: unknown };
      st_node: { Args: { g: unknown }; Returns: unknown };
      st_normalize: { Args: { geom: unknown }; Returns: unknown };
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string };
        Returns: unknown;
      };
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: boolean;
      };
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean };
        Returns: number;
      };
      st_pointfromtext: { Args: { '': string }; Returns: unknown };
      st_pointm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
        };
        Returns: unknown;
      };
      st_pointz: {
        Args: {
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_pointzm: {
        Args: {
          mcoordinate: number;
          srid?: number;
          xcoordinate: number;
          ycoordinate: number;
          zcoordinate: number;
        };
        Returns: unknown;
      };
      st_polyfromtext: { Args: { '': string }; Returns: unknown };
      st_polygonfromtext: { Args: { '': string }; Returns: unknown };
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown };
        Returns: unknown;
      };
      st_quantizecoordinates: {
        Args: {
          g: unknown;
          prec_m?: number;
          prec_x: number;
          prec_y?: number;
          prec_z?: number;
        };
        Returns: unknown;
      };
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number };
        Returns: unknown;
      };
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string };
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number };
        Returns: unknown;
      };
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown };
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number };
        Returns: unknown;
      };
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown };
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number };
        Returns: unknown;
      };
      st_squaregrid: {
        Args: { bounds: unknown; size: number };
        Returns: Record<string, unknown>[];
      };
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number };
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number };
        Returns: unknown[];
      };
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown };
        Returns: unknown;
      };
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number };
        Returns: unknown;
      };
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown };
        Returns: unknown;
      };
      st_tileenvelope: {
        Args: {
          bounds?: unknown;
          margin?: number;
          x: number;
          y: number;
          zoom: number;
        };
        Returns: unknown;
      };
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string };
            Returns: unknown;
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number };
            Returns: unknown;
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown };
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown };
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number };
            Returns: unknown;
          };
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number };
        Returns: unknown;
      };
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean };
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown };
      st_wkttosql: { Args: { '': string }; Returns: unknown };
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number };
        Returns: unknown;
      };
      unlockrows: { Args: { '': string }; Returns: number };
      updategeometrysrid: {
        Args: {
          catalogn_name: string;
          column_name: string;
          new_srid_in: number;
          schema_name: string;
          table_name: string;
        };
        Returns: string;
      };
      upsert_match_live_score: {
        Args: { p_kind: string; p_live_state: Json; p_match_id: string };
        Returns: undefined;
      };
    };
    Enums: {
      age_group: 'adult' | 'hs' | '18u' | '16u' | '14u' | 'jr_high';
      event_status: 'draft' | 'published' | 'cancelled' | 'completed';
      event_type: 'open_play' | 'tournament' | 'league';
      format: 'sixes' | 'quads' | 'triples' | 'doubles';
      gender: 'mens' | 'womens' | 'coed';
      group_role: 'owner' | 'admin' | 'member';
      price_unit: 'per_player' | 'per_team';
      registration_mode: 'platform' | 'external';
      skill_level: 'beginner' | 'intermediate' | 'advanced' | 'competitive';
      skill_tier: 'c' | 'b' | 'bb' | 'bb3' | 'a' | 'aa' | 'open';
      surface: 'indoor' | 'grass' | 'sand';
      team_composition: 'solo' | 'team' | 'pair_draw' | 'partners';
      team_registration_mode: 'ad_hoc' | 'roster';
      visibility: 'public' | 'invite_only' | 'friends_of_host' | 'friends_of_attendees';
    };
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null;
        geom: unknown;
      };
      valid_detail: {
        valid: boolean | null;
        reason: string | null;
        location: unknown;
      };
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          owner_id: string | null;
          public: boolean | null;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          owner_id?: string | null;
          public?: boolean | null;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string | null;
        };
        Relationships: [];
      };
      buckets_analytics: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          format: string;
          id: string;
          name: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          format?: string;
          id?: string;
          name?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      buckets_vectors: {
        Row: {
          created_at: string;
          id: string;
          type: Database['storage']['Enums']['buckettype'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          type?: Database['storage']['Enums']['buckettype'];
          updated_at?: string;
        };
        Relationships: [];
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          owner_id: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          user_metadata: Json | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          owner_id?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          user_metadata?: Json | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'objects_bucketId_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads: {
        Row: {
          bucket_id: string;
          created_at: string;
          id: string;
          in_progress_size: number;
          key: string;
          metadata: Json | null;
          owner_id: string | null;
          upload_signature: string;
          user_metadata: Json | null;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          id: string;
          in_progress_size?: number;
          key: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature: string;
          user_metadata?: Json | null;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          id?: string;
          in_progress_size?: number;
          key?: string;
          metadata?: Json | null;
          owner_id?: string | null;
          upload_signature?: string;
          user_metadata?: Json | null;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
        ];
      };
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string;
          created_at: string;
          etag: string;
          id: string;
          key: string;
          owner_id: string | null;
          part_number: number;
          size: number;
          upload_id: string;
          version: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          etag: string;
          id?: string;
          key: string;
          owner_id?: string | null;
          part_number: number;
          size?: number;
          upload_id: string;
          version: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          etag?: string;
          id?: string;
          key?: string;
          owner_id?: string | null;
          part_number?: number;
          size?: number;
          upload_id?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 's3_multipart_uploads_parts_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 's3_multipart_uploads_parts_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 's3_multipart_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      vector_indexes: {
        Row: {
          bucket_id: string;
          created_at: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id: string;
          metadata_configuration: Json | null;
          name: string;
          updated_at: string;
        };
        Insert: {
          bucket_id: string;
          created_at?: string;
          data_type: string;
          dimension: number;
          distance_metric: string;
          id?: string;
          metadata_configuration?: Json | null;
          name: string;
          updated_at?: string;
        };
        Update: {
          bucket_id?: string;
          created_at?: string;
          data_type?: string;
          dimension?: number;
          distance_metric?: string;
          id?: string;
          metadata_configuration?: Json | null;
          name?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vector_indexes_bucket_id_fkey';
            columns: ['bucket_id'];
            isOneToOne: false;
            referencedRelation: 'buckets_vectors';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] };
        Returns: boolean;
      };
      allow_only_operation: {
        Args: { expected_operation: string };
        Returns: boolean;
      };
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string };
        Returns: undefined;
      };
      extension: { Args: { name: string }; Returns: string };
      filename: { Args: { name: string }; Returns: string };
      foldername: { Args: { name: string }; Returns: string[] };
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string };
        Returns: string;
      };
      get_size_by_bucket: {
        Args: never;
        Returns: {
          bucket_id: string;
          size: number;
        }[];
      };
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_key_token?: string;
          next_upload_token?: string;
          prefix_param: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
        }[];
      };
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string;
          delimiter_param: string;
          max_keys?: number;
          next_token?: string;
          prefix_param: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      operation: { Args: never; Returns: string };
      search: {
        Args: {
          bucketname: string;
          levels?: number;
          limits?: number;
          offsets?: number;
          prefix: string;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_by_timestamp: {
        Args: {
          p_bucket_id: string;
          p_level: number;
          p_limit: number;
          p_prefix: string;
          p_sort_column: string;
          p_sort_column_after: string;
          p_sort_order: string;
          p_start_after: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
      search_v2: {
        Args: {
          bucket_name: string;
          levels?: number;
          limits?: number;
          prefix: string;
          sort_column?: string;
          sort_column_after?: string;
          sort_order?: string;
          start_after?: string;
        };
        Returns: {
          created_at: string;
          id: string;
          key: string;
          last_accessed_at: string;
          metadata: Json;
          name: string;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      buckettype: 'STANDARD' | 'ANALYTICS' | 'VECTOR';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      age_group: ['adult', 'hs', '18u', '16u', '14u', 'jr_high'],
      event_status: ['draft', 'published', 'cancelled', 'completed'],
      event_type: ['open_play', 'tournament', 'league'],
      format: ['sixes', 'quads', 'triples', 'doubles'],
      gender: ['mens', 'womens', 'coed'],
      group_role: ['owner', 'admin', 'member'],
      price_unit: ['per_player', 'per_team'],
      registration_mode: ['platform', 'external'],
      skill_level: ['beginner', 'intermediate', 'advanced', 'competitive'],
      skill_tier: ['c', 'b', 'bb', 'bb3', 'a', 'aa', 'open'],
      surface: ['indoor', 'grass', 'sand'],
      team_composition: ['solo', 'team', 'pair_draw', 'partners'],
      team_registration_mode: ['ad_hoc', 'roster'],
      visibility: ['public', 'invite_only', 'friends_of_host', 'friends_of_attendees'],
    },
  },
  storage: {
    Enums: {
      buckettype: ['STANDARD', 'ANALYTICS', 'VECTOR'],
    },
  },
} as const;
