# Vapi Calendar Tools

Use the same production Server URL for both tools:

```text
https://ai-assistent-2-delta.vercel.app/api/vapi/end-of-call
```

Vapi sends tool calls to the same webhook endpoint as the call events. The app responds in Vapi's expected format:

```json
{
  "results": [
    {
      "toolCallId": "call_id_from_vapi",
      "result": "Bulgarian result for the assistant"
    }
  ]
}
```

## Tool 1: check_availability

Name:

```text
check_availability
```

Description:

```text
Checks available appointment slots in the company calendar for a specific date. Use this before offering appointment times to the caller.
```

Parameters:

```json
{
  "type": "object",
  "properties": {
    "date": {
      "type": "string",
      "description": "Date to check in YYYY-MM-DD format in Europe/Sofia timezone."
    },
    "durationMinutes": {
      "type": "number",
      "description": "Appointment duration in minutes. Use 60 unless the service requires longer."
    },
    "serviceType": {
      "type": "string",
      "description": "Requested service, for example монтаж, ремонт, профилактика, термопомпа or оферта."
    }
  },
  "required": ["date"]
}
```

Assistant behavior:

```text
When the caller asks for an appointment, first collect the date. Then call check_availability. Offer only times returned by the tool. Do not invent times.
```

## Tool 2: book_appointment

Name:

```text
book_appointment
```

Description:

```text
Books an appointment in the company calendar after the caller chooses one of the available slots.
```

Parameters:

```json
{
  "type": "object",
  "properties": {
    "startsAt": {
      "type": "string",
      "description": "Appointment start date and time as ISO 8601. Use Europe/Sofia local choice converted to ISO."
    },
    "date": {
      "type": "string",
      "description": "Fallback date in YYYY-MM-DD format if startsAt is not available."
    },
    "time": {
      "type": "string",
      "description": "Fallback time in HH:mm format if startsAt is not available."
    },
    "durationMinutes": {
      "type": "number",
      "description": "Appointment duration in minutes. Use 60 unless the service requires longer."
    },
    "customerName": {
      "type": "string",
      "description": "Caller name."
    },
    "customerPhone": {
      "type": "string",
      "description": "Caller phone number."
    },
    "serviceType": {
      "type": "string",
      "description": "Requested service."
    },
    "location": {
      "type": "string",
      "description": "City, district and address if available."
    },
    "notes": {
      "type": "string",
      "description": "Short notes from the call."
    }
  },
  "required": ["customerPhone", "serviceType"]
}
```

Assistant behavior:

```text
Only call book_appointment after check_availability returned slots and the caller chose one slot.
After booking, read the confirmation from the tool. If the tool says the slot is no longer free, call check_availability again and offer another slot.
```

## Current Sync State

Implemented now:

- Assistant can check availability from Supabase `appointments`.
- Assistant can book an appointment into Supabase `appointments`.
- App calendar shows Supabase `appointments`.
- If Google Calendar sync is enabled, availability also checks Google Calendar busy events.
- If Google Calendar sync is enabled, new assistant bookings are created in Google Calendar too.

Next:

- Add Google service account credentials in Vercel.
- Add the Google calendar id in Supabase `calendar_settings`.
- Run `/api/calendar/google/sync` manually or from Vercel Cron to import manually created Google events.
