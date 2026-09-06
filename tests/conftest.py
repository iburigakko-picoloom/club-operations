"""Optional PostgreSQL run of the same API tests, in a dedicated QA schema only."""
import os
import pytest


@pytest.fixture(autouse=True)
def hosted_database(monkeypatch):
    url=os.environ.get('CLUB_TEST_DATABASE_URL')
    if not url:
        monkeypatch.delenv('DATABASE_URL',raising=False)
        return
    from server.database import connect
    monkeypatch.setenv('DATABASE_URL',url)
    monkeypatch.setenv('CLUB_PG_SCHEMA','club_qa')
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        for table in ['users','sessions','groups','memberships','invites','audit','subscriptions','jobs','identities','login_flows','login_limits']:
            c.execute('DELETE FROM '+table)
        c.commit()
