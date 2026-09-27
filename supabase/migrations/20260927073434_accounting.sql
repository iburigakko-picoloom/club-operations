BEGIN;

CREATE TABLE IF NOT EXISTS club.accounting_collections (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, id),
  FOREIGN KEY (group_id) REFERENCES club.groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS club.accounting_collection_members (
  group_id TEXT NOT NULL,
  collection_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  snapshot_status TEXT CHECK (snapshot_status IS NULL OR snapshot_status IN ('present', 'absent')),
  amount INTEGER CHECK (amount IS NULL OR amount BETWEEN 0 AND 1000000000),
  status TEXT NOT NULL CHECK (status IN ('unpaid', 'paid', 'undetermined')),
  paid_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, collection_id, member_id),
  FOREIGN KEY (group_id, collection_id)
    REFERENCES club.accounting_collections(group_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'undetermined' AND amount IS NULL AND paid_at IS NULL)
    OR (status <> 'undetermined' AND amount IS NOT NULL)
  ),
  CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid' AND paid_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS club.accounting_transactions (
  id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  title TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount BETWEEN 1 AND 1000000000),
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  memo TEXT NOT NULL DEFAULT '',
  event_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_id, id),
  FOREIGN KEY (group_id) REFERENCES club.groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS accounting_collections_due_idx
  ON club.accounting_collections(group_id, due_date);
CREATE INDEX IF NOT EXISTS accounting_collection_members_status_idx
  ON club.accounting_collection_members(group_id, collection_id, status);
CREATE INDEX IF NOT EXISTS accounting_transactions_date_idx
  ON club.accounting_transactions(group_id, date DESC);

ALTER TABLE club.accounting_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.accounting_collection_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE club.accounting_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY server_only ON club.accounting_collections
  TO club_runtime USING (true) WITH CHECK (true);
CREATE POLICY server_only ON club.accounting_collection_members
  TO club_runtime USING (true) WITH CHECK (true);
CREATE POLICY server_only ON club.accounting_transactions
  TO club_runtime USING (true) WITH CHECK (true);

REVOKE ALL ON club.accounting_collections FROM PUBLIC;
REVOKE ALL ON club.accounting_collection_members FROM PUBLIC;
REVOKE ALL ON club.accounting_transactions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON club.accounting_collections TO club_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON club.accounting_collection_members TO club_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON club.accounting_transactions TO club_runtime;

COMMIT;
