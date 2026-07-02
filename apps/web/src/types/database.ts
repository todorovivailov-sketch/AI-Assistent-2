export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type PublicTable<Row, Insert = Row, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      organizations: PublicTable<
        {
          id: string;
          name: string;
          slug: string;
          industry: string;
          timezone: string;
          status: string;
          owner_name: string | null;
          owner_phone: string | null;
          billing_email: string | null;
          notes: string | null;
          missed_call_sms_enabled: boolean;
          missed_call_sms_template: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          slug: string;
          industry?: string;
          timezone?: string;
          status?: string;
          owner_name?: string | null;
          owner_phone?: string | null;
          billing_email?: string | null;
          notes?: string | null;
          missed_call_sms_enabled?: boolean;
          missed_call_sms_template?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      assistants: PublicTable<
        {
          id: string;
          organization_id: string;
          vapi_assistant_id: string;
          name: string;
          default_language: string;
          model: string | null;
          voice_provider: string | null;
          voice_id: string | null;
          first_message: string | null;
          system_prompt: string | null;
          base_prompt: string | null;
          guardrails: string | null;
          vapi_query_tool_id: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          vapi_assistant_id: string;
          name: string;
          default_language?: string;
          model?: string | null;
          voice_provider?: string | null;
          voice_id?: string | null;
          first_message?: string | null;
          system_prompt?: string | null;
          base_prompt?: string | null;
          guardrails?: string | null;
          vapi_query_tool_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      phone_numbers: PublicTable<
        {
          id: string;
          organization_id: string;
          assistant_id: string | null;
          provider: string;
          e164: string;
          display_number: string | null;
          sip_uri: string | null;
          vapi_phone_number_id: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          assistant_id?: string | null;
          provider?: string;
          e164: string;
          display_number?: string | null;
          sip_uri?: string | null;
          vapi_phone_number_id?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      calendar_settings: PublicTable<
        {
          id: string;
          organization_id: string;
          provider: string;
          calendar_id: string | null;
          timezone: string;
          booking_enabled: boolean;
          slot_minutes: number;
          buffer_minutes: number;
          min_notice_minutes: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          provider?: string;
          calendar_id?: string | null;
          timezone?: string;
          booking_enabled?: boolean;
          slot_minutes?: number;
          buffer_minutes?: number;
          min_notice_minutes?: number;
          created_at?: string;
          updated_at?: string;
        }
      >;
      business_hours: PublicTable<
        {
          id: string;
          organization_id: string;
          weekday: number;
          opens_at: string | null;
          closes_at: string | null;
          is_closed: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          weekday: number;
          opens_at?: string | null;
          closes_at?: string | null;
          is_closed?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      services: PublicTable<
        {
          id: string;
          organization_id: string;
          name: string;
          description: string | null;
          duration_minutes: number;
          price_min: number | null;
          price_max: number | null;
          currency: string;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          description?: string | null;
          duration_minutes?: number;
          price_min?: number | null;
          price_max?: number | null;
          currency?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      service_areas: PublicTable<
        {
          id: string;
          organization_id: string;
          city: string;
          region: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          city: string;
          region?: string | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      documents: PublicTable<
        {
          id: string;
          organization_id: string;
          name: string;
          kind: string;
          vapi_file_id: string | null;
          bytes: number | null;
          mimetype: string | null;
          status: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          kind?: string;
          vapi_file_id?: string | null;
          bytes?: number | null;
          mimetype?: string | null;
          status?: string;
          created_at?: string;
        }
      >;
      calls: PublicTable<
        {
          id: string;
          organization_id: string;
          phone_number_id: string | null;
          assistant_id: string | null;
          vapi_call_id: string;
          caller_number: string | null;
          direction: string;
          status: string;
          disposition: string | null;
          ended_reason: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          cost_amount: number | null;
          cost_currency: string;
          recording_url: string | null;
          transcript: string | null;
          summary: string | null;
          structured_data: Json;
          raw_payload: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          phone_number_id?: string | null;
          assistant_id?: string | null;
          vapi_call_id: string;
          caller_number?: string | null;
          direction?: string;
          status?: string;
          disposition?: string | null;
          ended_reason?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          cost_amount?: number | null;
          cost_currency?: string;
          recording_url?: string | null;
          transcript?: string | null;
          summary?: string | null;
          structured_data?: Json;
          raw_payload?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      leads: PublicTable<
        {
          id: string;
          organization_id: string;
          call_id: string | null;
          status: string;
          name: string | null;
          phone: string | null;
          email: string | null;
          city: string | null;
          address: string | null;
          service_type: string | null;
          urgency: string | null;
          source: string;
          preferred_time_text: string | null;
          ai_summary: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          call_id?: string | null;
          status?: string;
          name?: string | null;
          phone?: string | null;
          email?: string | null;
          city?: string | null;
          address?: string | null;
          service_type?: string | null;
          urgency?: string | null;
          source?: string;
          preferred_time_text?: string | null;
          ai_summary?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      appointments: PublicTable<
        {
          id: string;
          organization_id: string;
          lead_id: string | null;
          call_id: string | null;
          status: string;
          title: string;
          starts_at: string | null;
          ends_at: string | null;
          timezone: string;
          location: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          service_type: string | null;
          notes: string | null;
          google_calendar_event_id: string | null;
          vapi_call_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          call_id?: string | null;
          status?: string;
          title: string;
          starts_at?: string | null;
          ends_at?: string | null;
          timezone?: string;
          location?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          service_type?: string | null;
          notes?: string | null;
          google_calendar_event_id?: string | null;
          vapi_call_id?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      orders: PublicTable<
        {
          id: string;
          organization_id: string;
          lead_id: string | null;
          appointment_id: string | null;
          status: string;
          title: string;
          description: string | null;
          amount: number | null;
          currency: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          lead_id?: string | null;
          appointment_id?: string | null;
          status?: string;
          title: string;
          description?: string | null;
          amount?: number | null;
          currency?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      webhook_events: PublicTable<
        {
          id: string;
          organization_id: string | null;
          provider: string;
          event_type: string;
          external_event_id: string | null;
          payload: Json;
          received_at: string;
        },
        {
          id?: string;
          organization_id?: string | null;
          provider: string;
          event_type: string;
          external_event_id?: string | null;
          payload?: Json;
          received_at?: string;
        }
      >;
      notification_log: PublicTable<
        {
          id: string;
          organization_id: string;
          channel: string;
          kind: string;
          appointment_id: string | null;
          dedupe_key: string;
          destination: string;
          status: string;
          error: string | null;
          sent_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          channel: string;
          kind: string;
          appointment_id?: string | null;
          dedupe_key: string;
          destination: string;
          status?: string;
          error?: string | null;
          sent_at?: string | null;
          created_at?: string;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
