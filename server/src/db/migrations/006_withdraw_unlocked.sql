-- Admin can grant per-member withdrawal permission (demo virtual credit)
ALTER TABLE users ADD COLUMN withdraw_unlocked INTEGER NOT NULL DEFAULT 0;
