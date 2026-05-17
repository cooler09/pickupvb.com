-- Composite index for event_attendees filtered by (event_id, payment_status).
-- Event detail builds a payment-status map per event; today only event_id is
-- indexed, forcing a sequential scan over an event's attendee rows. See
-- docs/audits/performance.md P2 #5.
create index if not exists event_attendees_event_payment_idx
    on event_attendees (event_id, payment_status);
