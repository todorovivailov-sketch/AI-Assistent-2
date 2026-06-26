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
Checks whether the caller's preferred appointment time is available in the company calendar. Use this after collecting both date and time.
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
    "time": {
      "type": "string",
      "description": "Preferred appointment time in HH:mm 24-hour format in Europe/Sofia timezone, for example 15:00."
    },
    "durationMinutes": {
      "type": "number",
      "description": "Appointment duration in minutes. Use 60 unless the service requires longer."
    },
    "serviceType": {
      "type": "string",
      "description": "Requested service or reason for the appointment, as free text from the caller."
    }
  },
  "required": ["date", "time"]
}
```

Assistant behavior:

```text
When the caller asks for an appointment, first collect the date and preferred time. Then call check_availability for that exact time. If the caller gives only a date, ask what time is convenient before calling the tool. Do not invent times.
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
Only call book_appointment after check_availability confirms the caller's preferred time is free and the caller agrees to book it.
After booking, read the confirmation from the tool. If the tool says the slot is no longer free, ask the caller for another preferred time before calling check_availability again.
```

## Current Sync State

Implemented now:

- Assistant can check availability from Supabase `appointments`.
- Assistant can book an appointment into Supabase `appointments`.
- App calendar shows Supabase `appointments`.
- If Google Calendar sync is enabled, availability also checks Google Calendar busy events.
- If Google Calendar sync is enabled, new assistant bookings are created in Google Calendar too.

## Troubleshooting

If the assistant says "checking" during a real call but no time is returned, check
`webhook_events` for a `tool-calls` event.

- If there is no `tool-calls` event, the Vapi assistant does not have these tools
  attached or the tool server URL is not configured for the assistant.
- If there is a `tool-calls` event and the response fails, debug the backend route
  `/api/vapi/end-of-call`.
- A normal backend check should return in about 2 seconds.

Next:

- Add Google service account credentials in Vercel.
- Add the Google calendar id in Supabase `calendar_settings`.
- Run `/api/calendar/google/sync` manually or from Vercel Cron to import manually created Google events.
