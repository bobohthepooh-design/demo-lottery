-- 041: เปลี่ยน column defaults จาก now() (transaction_timestamp) เป็น clock_timestamp()
-- เหตุ: tx ที่ค้าง/open นานทำให้ now() เพี้ยน — published_at/created_at เพี้ยนหลายชม.
-- (เช่น ผลหวยลาว 20:30 น. แสดงอัปเดต 09:11 น.) — statement_timestamp ไม่เพี้ยนตามอายุ tx

ALTER TABLE users ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE users ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE user_sessions ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE virtual_wallets ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE system_settings ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE lottery_draws ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE lottery_draws ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE lottery_results ALTER COLUMN published_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE bet_slips ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE bet_items ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE hilo_tickets ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE scratch_cards ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE kiwi_tickets ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE notifications ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE otp_codes ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE push_subscriptions ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE push_subscriptions ALTER COLUMN last_seen_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE chat_threads ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE chat_messages ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE audit_logs ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE security_events ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE schema_migrations ALTER COLUMN applied_at SET DEFAULT clock_timestamp();
ALTER TABLE virtual_transactions ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE password_reset_tokens ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH24:MI:SS'::text);
ALTER TABLE draw_result_sources ALTER COLUMN checked_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH24:MI:SS'::text);
ALTER TABLE payment_requests ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE payment_requests ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE email_verifications ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE approval_requests ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE approval_requests ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE auth_events ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE support_tickets ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH24:MI:SS'::text);
ALTER TABLE support_tickets ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH24:MI:SS'::text);
ALTER TABLE promo_campaigns ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE promo_campaigns ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE incidents ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE incidents ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE journal_entries ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE risk_flags ALTER COLUMN last_seen_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE risk_flags ALTER COLUMN created_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
ALTER TABLE risk_flags ALTER COLUMN updated_at SET DEFAULT to_char((clock_timestamp() AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD HH:MM:SS'::text);
