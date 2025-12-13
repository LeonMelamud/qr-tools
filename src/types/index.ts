export interface Session {
  id: string;
  created_at: string;
  is_active: boolean;
}

export interface Participant {
  id: string;
  name: string;
  last_name: string;
  display_name: string;
  session_id?: string;
  email?: string;
  won?: boolean;
}

export interface QrRef {
  id: string;
  name: string;
  slug: string;
  target_url: string;
  description?: string;
  category?: string;
  scan_count: number;
  last_scanned_at?: string;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface QrScan {
  id: string;
  qr_ref_id: string;
  slug: string;
  user_agent?: string;
  device_type?: string;
  os?: string;
  browser?: string;
  ip_address?: string;
  country?: string;
  country_code?: string;
  city?: string;
  region?: string;
  referrer?: string;
  language?: string;
  scanned_at: string;
}

