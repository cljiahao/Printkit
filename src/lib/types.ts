export type PrintJobType = "label";
export type PrintJobStatus = "queued" | "sent" | "printed" | "failed";

export interface PrintJob {
  id: string;
  vendor_id: string;
  job_type: PrintJobType;
  payload: Record<string, unknown>;
  status: PrintJobStatus;
  source_kit: string;
  source_ref: string;
  created_at: string;
  printed_at: string | null;
}

export interface KitApiKey {
  kit_slug: string;
  secret_hash: string;
  created_at: string;
}

export interface Admin {
  user_id: string;
  created_at: string;
}

export interface AdminAuditEntry {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface Database {
  printkit: {
    Tables: {
      print_jobs: {
        Row: PrintJob;
        Insert: Omit<PrintJob, "id" | "created_at" | "printed_at"> &
          Partial<Pick<PrintJob, "id" | "created_at" | "printed_at">>;
        Update: Partial<PrintJob>;
        Relationships: [];
      };
      kit_api_keys: {
        Row: KitApiKey;
        Insert: Omit<KitApiKey, "created_at"> &
          Partial<Pick<KitApiKey, "created_at">>;
        Update: Partial<KitApiKey>;
        Relationships: [];
      };
      admins: {
        Row: Admin;
        Insert: Omit<Admin, "created_at"> & Partial<Pick<Admin, "created_at">>;
        Update: Partial<Admin>;
        Relationships: [];
      };
      admin_audit: {
        Row: AdminAuditEntry;
        Insert: Omit<AdminAuditEntry, "id" | "created_at"> &
          Partial<Pick<AdminAuditEntry, "id" | "created_at">>;
        Update: Partial<AdminAuditEntry>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_admin: {
        Args: { p_uid: string };
        Returns: boolean;
      };
    };
  };
}
