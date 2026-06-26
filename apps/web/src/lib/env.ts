export function requireServerEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getSupabaseUrl(): string {
  return requireServerEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    requireServerEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  );
}

export function getSupabaseSecretKey(): string {
  return process.env.SUPABASE_SECRET_KEY ?? requireServerEnv("SUPABASE_SERVICE_ROLE_KEY");
}
