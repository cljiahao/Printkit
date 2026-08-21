export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TxStatus = "pending" | "claimed" | "confirmed";

// Shape of merqo.vendor_profile.social_links (shared across every kit — see
// merqo-vendor-profile.ts). Not a paykit table column, so it has no
// Insert/Update variant here.
export type SocialLinks = {
  website?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
};
export type VendorPlan = "free" | "pro";
export type VerificationMethod = "manual" | "auto";

export type PaymentConfigKind = "paynow" | "pointer";

export type VendorPaymentConfig = {
  vendor_id: string;
  kind: PaymentConfigKind;
  uen: string | null;
  mobile: string | null;
  payee_name: string | null;
  label: string | null;
  url: string | null;
  qr_image_url: string | null;
  verification_method: VerificationMethod;
  plan: VendorPlan;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  vendor_id: string;
  kit_slug: string;
  order_ref: string;
  amount_cents: number;
  status: TxStatus;
  qr_payload: string;
  claimed_at: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type BookingStatus =
  "pending_deposit" | "deposit_paid" | "fully_paid" | "cancelled";

export type Booking = {
  id: string;
  vendor_id: string;
  customer_name: string;
  customer_phone: string | null;
  event_date: string;
  total_amount_cents: number;
  deposit_amount_cents: number;
  balance_amount_cents: number;
  balance_due_date: string;
  status: BookingStatus;
  deposit_transaction_id: string | null;
  balance_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Refund = {
  id: string;
  transaction_id: string;
  refunded_amount_cents: number;
  reason: string | null;
  created_by: string;
  created_at: string;
};

export type Feedback = {
  id: number;
  vendor_id: string;
  nps: number;
  message: string | null;
  created_at: string;
};

export type VendorPrefs = {
  vendor_id: string;
  tour_seen_at: string | null;
};

export type Admin = {
  user_id: string;
  created_at: string;
};

export type AdminAudit = {
  id: string;
  admin_id: string;
  action: string;
  target_id: string | null;
  detail: Json;
  created_at: string;
};

export type Pricing = {
  id: number;
  monthly_cents: number;
  currency: string;
  updated_at: string;
};

export interface Database {
  paykit: {
    Tables: {
      vendor_payment_config: {
        Row: VendorPaymentConfig;
        Insert: {
          vendor_id: string;
          kind?: PaymentConfigKind;
          uen?: string | null;
          mobile?: string | null;
          payee_name?: string | null;
          label?: string | null;
          url?: string | null;
          qr_image_url?: string | null;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          kind?: PaymentConfigKind;
          uen?: string | null;
          mobile?: string | null;
          payee_name?: string | null;
          label?: string | null;
          url?: string | null;
          qr_image_url?: string | null;
          verification_method?: VerificationMethod;
          plan?: VendorPlan;
          updated_at?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: {
          id?: string;
          vendor_id: string;
          kit_slug: string;
          order_ref: string;
          amount_cents: number;
          status?: TxStatus;
          qr_payload: string;
          claimed_at?: string | null;
          confirmed_at?: string | null;
          created_at?: string;
        };
        Update: {
          status?: TxStatus;
          claimed_at?: string | null;
          confirmed_at?: string | null;
        };
        Relationships: [];
      };
      bookings: {
        Row: Booking;
        Insert: {
          id?: string;
          vendor_id: string;
          customer_name: string;
          customer_phone?: string | null;
          event_date: string;
          total_amount_cents: number;
          deposit_amount_cents: number;
          balance_amount_cents: number;
          balance_due_date: string;
          status?: BookingStatus;
          deposit_transaction_id?: string | null;
          balance_transaction_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          customer_name?: string;
          customer_phone?: string | null;
          event_date?: string;
          total_amount_cents?: number;
          deposit_amount_cents?: number;
          balance_amount_cents?: number;
          balance_due_date?: string;
          status?: BookingStatus;
          deposit_transaction_id?: string | null;
          balance_transaction_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      refunds: {
        Row: Refund;
        Insert: {
          id?: string;
          transaction_id: string;
          refunded_amount_cents: number;
          reason?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          reason?: string | null;
        };
        Relationships: [];
      };
      kit_api_keys: {
        Row: { kit_slug: string; secret_hash: string; created_at: string };
        Insert: { kit_slug: string; secret_hash: string; created_at?: string };
        Update: { secret_hash?: string };
        Relationships: [];
      };
      feedback: {
        Row: Feedback;
        Insert: {
          id?: number;
          vendor_id: string;
          nps: number;
          message?: string | null;
          created_at?: string;
        };
        Update: {
          nps?: number;
          message?: string | null;
        };
        Relationships: [];
      };
      vendor_prefs: {
        Row: VendorPrefs;
        Insert: {
          vendor_id: string;
          tour_seen_at?: string | null;
        };
        Update: {
          tour_seen_at?: string | null;
        };
        Relationships: [];
      };
      admins: {
        Row: Admin;
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
        };
        Relationships: [];
      };
      admin_audit: {
        Row: AdminAudit;
        Insert: {
          id?: string;
          admin_id: string;
          action: string;
          target_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          detail?: Json;
        };
        Relationships: [];
      };
      pricing: {
        Row: Pricing;
        Insert: {
          id?: number;
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Update: {
          monthly_cents?: number;
          currency?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      tx_count_this_month: {
        Args: { p_vendor: string };
        Returns: number;
      };
      is_admin: {
        Args: { p_uid: string };
        Returns: boolean;
      };
    };
  };
}
