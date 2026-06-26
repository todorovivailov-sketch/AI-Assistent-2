import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseSecretKey, getSupabaseUrl } from "@/lib/env";
import type { Database } from "@/types/database";

let serviceClient: SupabaseClient<Database> | null = null;

export function getSupabaseServiceClient() {
  if (!serviceClient) {
    serviceClient = createClient<Database>(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return serviceClient;
}
