"""Accounting helpers. Member, event, and attendance data stay in group state."""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException


def fail(detail, code=400):
    raise HTTPException(code, detail)


def can_edit(state, user_id, owner_id):
    return user_id == owner_id or user_id in state.get('roles', {}).get('会計', [])


def validate_id(value, label='ID'):
    if not isinstance(value, str) or not value or len(value) > 100:
        fail(f'{label}を確認してください')
    return value


def validate_text(value, label, limit, required=False):
    if not isinstance(value, str) or len(value) > limit or (required and not value.strip()):
        fail(f'{label}を確認してください')
    return value.strip()


def validate_amount(value, nullable=False):
    if nullable and value is None:
        return None
    if type(value) is not int or value < 0 or value > 1_000_000_000:
        fail('金額を確認してください')
    return value


def validate_date(value, optional=False):
    if optional and value in (None, ''):
        return None
    if not isinstance(value, str):
        fail('日付を確認してください')
    try:
        date.fromisoformat(value)
    except ValueError:
        fail('日付を確認してください')
    if len(value) != 10 or date.fromisoformat(value).isoformat() != value:
        fail('日付を確認してください')
    return value


def snapshot_status(state, event_id, person):
    if not event_id:
        return None
    key = f"{event_id}|{person['id']}"
    present = state.get('attendance', {}).get(key)
    if type(present) is not bool:
        override = person.get('defaultOverride')
        present = override if type(override) is bool else person.get('seniority') == 'below'
    return 'present' if present else 'absent'


def build_collection_members(state, payload):
    people = {p.get('id'): p for p in state.get('people', [])}
    event_id = payload.get('eventId') or None
    if event_id and not any(e.get('id') == event_id for e in state.get('events', [])):
        fail('関連予定が見つかりません')
    ids = payload.get('memberIds')
    if not isinstance(ids, list) or len(ids) > 1000 or any(not isinstance(mid, str) for mid in ids) or len(set(ids)) != len(ids):
        fail('徴収対象を確認してください')
    if any(mid not in people for mid in ids):
        fail('部員が見つかりません')
    unresolved = payload.get('unresolvedMemberIds', [])
    if not isinstance(unresolved, list) or any(not isinstance(mid, str) for mid in unresolved) or len(set(unresolved)) != len(unresolved) or any(mid not in ids for mid in unresolved):
        fail('未確定の対象を確認してください')
    overrides = payload.get('amountOverrides', {})
    if not isinstance(overrides, dict) or any(mid not in ids for mid in overrides):
        fail('個別金額を確認してください')
    present_amount = validate_amount(payload.get('presentAmount', payload.get('defaultAmount', 0)))
    absent_amount = validate_amount(payload.get('absentAmount', present_amount))
    default_amount = validate_amount(payload.get('defaultAmount', present_amount))
    result = []
    for mid in ids:
        source = snapshot_status(state, event_id, people[mid])
        if mid in unresolved:
            result.append({'memberId': mid, 'snapshotStatus': source, 'amount': None, 'status': 'undetermined', 'note': ''})
        else:
            base = present_amount if source == 'present' else absent_amount if event_id else default_amount
            result.append({'memberId': mid, 'snapshotStatus': source, 'amount': validate_amount(overrides.get(mid, base)), 'status': 'unpaid', 'note': ''})
    return event_id, result


def transaction_fields(state, payload, old=None):
    allowed={'kind','title','amount','date','category','memo','eventId'}
    if any(key not in allowed for key in payload):
        fail('変更できない項目です')
    kind=payload.get('kind',old['kind'] if old else None)
    if kind not in ('income','expense'):
        fail('収支区分を確認してください')
    title=validate_text(payload.get('title',old['title'] if old else None),'名称',120,True)
    amount=validate_amount(payload.get('amount',old['amount'] if old else None))
    if amount<1:
        fail('金額は1円以上で入力してください')
    tx_date=validate_date(payload.get('date',old['date'] if old else None))
    category=validate_text(payload.get('category',old['category'] if old else ''),'分類',80)
    memo=validate_text(payload.get('memo',old['memo'] if old else ''),'メモ',2000)
    event_id=payload.get('eventId',old['event_id'] if old else None) or None
    if event_id and not any(e.get('id')==event_id for e in state.get('events', [])):
        fail('関連予定が見つかりません')
    return {'kind':kind,'title':title,'amount':amount,'date':tx_date,'category':category,'memo':memo,'eventId':event_id}


def payment_summary(collections, transactions):
    received = sum(row['amount'] or 0 for c in collections for row in c['members'] if row['status'] == 'paid')
    outstanding = sum(row['amount'] or 0 for c in collections for row in c['members'] if row['status'] == 'unpaid')
    uncertain = sum(1 for c in collections for row in c['members'] if row['status'] == 'undetermined')
    other_income = sum(t['amount'] for t in transactions if t['kind'] == 'income')
    expenses = sum(t['amount'] for t in transactions if t['kind'] == 'expense')
    return {
        'income': other_income + received,
        'collectionIncome': received,
        'otherIncome': other_income,
        'expense': expenses,
        'balance': other_income + received - expenses,
        'outstanding': outstanding,
        'undeterminedCount': uncertain,
    }


def read_accounting(c, group_id, state):
    collections=[]
    people={p.get('id'):p for p in state.get('people', [])}
    events={e.get('id'):e for e in state.get('events', [])}
    for raw in c.execute('SELECT * FROM accounting_collections WHERE group_id=? ORDER BY created_at DESC,id DESC',(group_id,)).fetchall():
        row=dict(raw)
        members=[]
        for member_raw in c.execute('SELECT * FROM accounting_collection_members WHERE group_id=? AND collection_id=? ORDER BY created_at,member_id',(group_id,row['id'])).fetchall():
            member=dict(member_raw);person=people.get(member['member_id'])
            members.append({
                'memberId':member['member_id'], 'snapshotStatus':member['snapshot_status'],
                'amount':member['amount'], 'status':member['status'], 'paidAt':member['paid_at'],
                'note':member['note'], 'createdAt':member['created_at'], 'updatedAt':member['updated_at'],
                'memberName':person.get('name','') if person else '', 'grade':person.get('grade') if person else None,
                'active':person.get('active',True) if person else False,
            })
        collections.append({
            'id':row['id'], 'title':row['title'], 'note':row['note'], 'dueDate':row['due_date'],
            'eventId':row['event_id'], 'eventTitle':events.get(row['event_id'],{}).get('title',''),
            'status':row['status'], 'createdBy':row['created_by'], 'createdAt':row['created_at'],
            'updatedAt':row['updated_at'], 'members':members,
        })
    transactions=[]
    for raw in c.execute('SELECT * FROM accounting_transactions WHERE group_id=? ORDER BY date DESC,created_at DESC,id DESC',(group_id,)).fetchall():
        row=dict(raw)
        transactions.append({
            'id':row['id'], 'kind':row['kind'], 'title':row['title'], 'amount':row['amount'],
            'date':row['date'], 'category':row['category'], 'memo':row['memo'], 'eventId':row['event_id'],
            'eventTitle':events.get(row['event_id'],{}).get('title',''), 'createdBy':row['created_by'],
            'createdAt':row['created_at'], 'updatedAt':row['updated_at'],
        })
    summary=payment_summary(collections,transactions)
    history=[]
    for tx in transactions:
        history.append({'id':tx['id'],'source':'transaction','kind':tx['kind'],'date':tx['date'],'title':tx['title'],'category':tx['category'],'amount':tx['amount'],'eventId':tx['eventId']})
    for collection in collections:
        for member in collection['members']:
            if member['status']=='paid' and member['paidAt']:
                history.append({'id':collection['id']+':'+member['memberId'],'source':'collection','kind':'income','date':member['paidAt'][:10],'title':collection['title']+' · '+(member['memberName'] or '部員'),'category':'徴収','amount':member['amount'] or 0,'collectionId':collection['id'],'eventId':collection['eventId']})
    history.sort(key=lambda item:(item['date'],item['id']),reverse=True)
    return {'collections':collections,'transactions':transactions,'history':history,'summary':summary}


def build_history(collections, transactions):
    history = []
    for tx in transactions:
        history.append({
            'id': tx['id'], 'source': 'transaction', 'kind': tx['kind'],
            'date': tx['date'], 'title': tx['title'], 'category': tx['category'],
            'amount': tx['amount'], 'eventId': tx.get('eventId'),
        })
    for collection in collections:
        for row in collection['members']:
            if row['status'] != 'paid' or not row.get('paidAt'):
                continue
            history.append({
                'id': f"{collection['id']}:{row['memberId']}", 'source': 'collection', 'kind': 'income',
                'date': row['paidAt'][:10], 'title': f"{collection['title']} · {row['memberName']}",
                'category': '徴収', 'amount': row['amount'] or 0, 'collectionId': collection['id'],
                'eventId': collection.get('eventId'),
            })
    return sorted(history, key=lambda item: (item['date'], item['id']), reverse=True)
