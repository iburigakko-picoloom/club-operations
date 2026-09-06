"""Consistent SQLite backup, including data still in WAL. Do not copy only *.sqlite3."""
import argparse,sqlite3,os
from pathlib import Path
from .app import DB_PATH

def main():
 if os.environ.get('DATABASE_URL'):raise SystemExit('Hosted Postgres: use pg_dump with your server DATABASE_URL; SQLite backup does not apply.')
 p=argparse.ArgumentParser();p.add_argument('destination',type=Path);a=p.parse_args()
 if not DB_PATH.exists():raise SystemExit('Database not found')
 if a.destination.exists():raise SystemExit('Destination already exists; choose a new filename')
 a.destination.parent.mkdir(parents=True,exist_ok=True)
 src=sqlite3.connect(f'file:{DB_PATH}?mode=ro',uri=True);dst=sqlite3.connect(a.destination)
 try:src.backup(dst)
 finally:dst.close();src.close()
 print(a.destination)
if __name__=='__main__':main()
