ALTER TABLE webhook_events
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(255);

UPDATE webhook_events
SET idempotency_key = id::text
WHERE idempotency_key IS NULL;

ALTER TABLE webhook_events
  ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_endpoint_idempotency_uidx
  ON webhook_events(endpoint_id, idempotency_key);

ALTER TABLE webhook_deliveries
  ADD COLUMN IF NOT EXISTS status varchar(50) NOT NULL DEFAULT 'pending';
