export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  printkit: {
    Tables: {
      admin_audit: {
        Row: {
          action: string;
          admin_id: string;
          created_at: string;
          detail: Json | null;
          id: string;
          target_id: string | null;
        };
        Insert: {
          action: string;
          admin_id: string;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          target_id?: string | null;
        };
        Update: {
          action?: string;
          admin_id?: string;
          created_at?: string;
          detail?: Json | null;
          id?: string;
          target_id?: string | null;
        };
        Relationships: [];
      };
      admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      kit_api_keys: {
        Row: {
          created_at: string;
          kit_slug: string;
          secret_hash: string;
        };
        Insert: {
          created_at?: string;
          kit_slug: string;
          secret_hash: string;
        };
        Update: {
          created_at?: string;
          kit_slug?: string;
          secret_hash?: string;
        };
        Relationships: [];
      };
      print_jobs: {
        Row: {
          created_at: string;
          id: string;
          job_type: string;
          payload: Json;
          printed_at: string | null;
          source_kit: string;
          source_ref: string;
          status: string;
          vendor_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_type?: string;
          payload: Json;
          printed_at?: string | null;
          source_kit: string;
          source_ref: string;
          status?: string;
          vendor_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_type?: string;
          payload?: Json;
          printed_at?: string | null;
          source_kit?: string;
          source_ref?: string;
          status?: string;
          vendor_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: { Args: { p_uid: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
