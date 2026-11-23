-- 036: journal_entries ตาม virtual_transactions เมื่อ tx ถูกลบ (member.delete executor)
ALTER TABLE journal_entries DROP CONSTRAINT IF EXISTS journal_entries_transaction_id_fkey;
ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES virtual_transactions(id) ON DELETE CASCADE;
