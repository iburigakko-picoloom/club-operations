"""Postgres adapter for the existing parameterized SQLite application queries.

Hosted data lives in a private schema, reachable only by the server's database
role. Session pooling is required. An advisory transaction lock preserves the
single-writer semantics used by the existing optimistic version checks.
"""
import os
import re
from contextlib import contextmanager


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def row_factory(cursor):
    names=[column.name for column in cursor.description] if cursor.description else []
    return lambda values: Row(zip(names, values))


class Connection:
    def __init__(self, raw, schema):
        self.raw=raw
        self.schema=schema

    @property
    def in_transaction(self):
        from psycopg.pq import TransactionStatus
        return self.raw.info.transaction_status != TransactionStatus.IDLE

    def execute(self, statement, params=None):
        if statement.strip().upper()=='BEGIN IMMEDIATE':
            self.raw.execute('BEGIN')
            return self.raw.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))', ('club-operations:'+self.schema,))
        # All application statements use positional placeholders. User values
        # remain bound parameters and are never interpolated into SQL.
        statement=statement.replace('?', '%s')
        if statement.lstrip().upper().startswith('INSERT OR IGNORE '):
            statement=re.sub(r'INSERT OR IGNORE', 'INSERT', statement, count=1, flags=re.I)
            statement=statement.rstrip().rstrip(';')+' ON CONFLICT DO NOTHING'
        return self.raw.execute(statement, params)

    def commit(self):self.raw.commit()
    def rollback(self):self.raw.rollback()


@contextmanager
def connect():
    import psycopg
    from psycopg import sql
    schema=os.environ.get('CLUB_PG_SCHEMA','club')
    if not re.fullmatch(r'club(?:_[a-z0-9_]+)?',schema):raise RuntimeError('Invalid CLUB_PG_SCHEMA')
    try:
        raw=psycopg.connect(os.environ['DATABASE_URL'], autocommit=True,
                            connect_timeout=10, prepare_threshold=None, row_factory=row_factory)
    except psycopg.Error:
        raise RuntimeError('Database connection failed. Check the server DATABASE_URL setting.') from None
    try:
        raw.execute(sql.SQL('SET search_path TO {}, pg_catalog').format(sql.Identifier(schema)))
        raw.execute("SET statement_timeout TO '20s'")
        raw.execute("SET lock_timeout TO '15s'")
        yield Connection(raw,schema)
    except BaseException:
        raw.rollback()
        raise
    finally:raw.close()


def check_schema(connection):
    result=connection.execute('SELECT version FROM schema_version WHERE id=1').fetchone()
    if not result or result['version']!=1:
        raise RuntimeError('Database schema is not initialized. Apply the hosted schema before starting.')
