-- Provably fair: commit-reveal seed สำหรับเกมที่ผลถูก generate ฝั่ง server
-- commit_hash = sha256(server_seed) — เผยแพร่ก่อนผล, server_seed เผยหลัง reveal ให้ตรวจสอบย้อนหลังได้
ALTER TABLE scratch_cards ADD COLUMN server_seed TEXT;
ALTER TABLE scratch_cards ADD COLUMN commit_hash TEXT;
ALTER TABLE hilo_tickets ADD COLUMN server_seed TEXT;
ALTER TABLE hilo_tickets ADD COLUMN commit_hash TEXT;
