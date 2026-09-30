-- Allow an in-console staff alert channel for incoming orders.
ALTER TABLE notification_log DROP CONSTRAINT notification_log_channel_check;
ALTER TABLE notification_log ADD CONSTRAINT notification_log_channel_check
  CHECK (channel = ANY (ARRAY['email', 'sms', 'whatsapp', 'in_app', 'order_alert']));
