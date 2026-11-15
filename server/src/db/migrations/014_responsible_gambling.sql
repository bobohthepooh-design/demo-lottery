-- Responsible gambling: self-exclusion + betting limits + 18+ confirmation
ALTER TABLE users ADD COLUMN self_excluded_until TEXT;
ALTER TABLE users ADD COLUMN daily_limit_satang INTEGER;
ALTER TABLE users ADD COLUMN monthly_limit_satang INTEGER;
ALTER TABLE users ADD COLUMN age_confirmed INTEGER DEFAULT 0;
