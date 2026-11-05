"""Change only Windows Installer metadata; preserve the accepted cabinet bytes.

Windows only. The output is unsigned and must pass Azure signing and installed
upgrade acceptance before publication. Never modifies the input MSI.
"""
import argparse
import ctypes as c
from ctypes import wintypes as w
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import uuid

ACCEPTED = '7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3'
OLD_NAME = 'Townlight Windows Fix Candidate'
FAMILY = '{0B97EFAE-2A2E-4E88-A81C-3AAD1A52C2CC}'
msi = c.WinDLL('msi')
H = w.UINT
P = c.POINTER
def api(name, args, result=w.UINT):
    fn = getattr(msi, name); fn.argtypes = args; fn.restype = result
    return fn
open_db = api('MsiOpenDatabaseW', [w.LPCWSTR, w.LPCWSTR, P(H)])
open_view = api('MsiDatabaseOpenViewW', [H, w.LPCWSTR, P(H)])
execute = api('MsiViewExecute', [H, H])
fetch = api('MsiViewFetch', [H, P(H)])
fields = api('MsiRecordGetFieldCount', [H])
get_string = api('MsiRecordGetStringW', [H, w.UINT, w.LPWSTR, P(w.DWORD)])
read_stream = api('MsiRecordReadStream', [H, w.UINT, c.c_void_p, P(w.DWORD)])
close = api('MsiCloseHandle', [H])
commit = api('MsiDatabaseCommit', [H])
summary_open = api('MsiGetSummaryInformationW', [H, w.LPCWSTR, w.UINT, P(H)])
summary_set = api('MsiSummaryInfoSetPropertyW', [H, w.UINT, w.UINT, c.c_int, c.c_void_p, w.LPCWSTR])
summary_save = api('MsiSummaryInfoPersist', [H])

def check(code):
    if code: raise RuntimeError(f'Windows Installer error {code}')

def string(record, column):
    size = w.DWORD(0)
    result = get_string(record, column, None, c.byref(size))
    if result not in (0, 234): check(result)
    size.value += 1
    buf = c.create_unicode_buffer(size.value)
    check(get_string(record, column, buf, c.byref(size)))
    return buf.value

def query(db, sql):
    view = H(); check(open_view(db, sql, c.byref(view)))
    rows = []
    try:
        check(execute(view, 0))
        while True:
            record = H(); result = fetch(view, c.byref(record))
            if result == 259: break
            check(result)
            try: rows.append([string(record, i) for i in range(1, fields(record) + 1)])
            finally: close(record)
    finally: close(view)
    return rows

def sql(db, statement):
    view = H(); check(open_view(db, statement, c.byref(view)))
    try: check(execute(view, 0))
    finally: close(view)

def quote(value): return "'" + value.replace("'", "''") + "'"

def cabinet_hash(db):
    media = query(db, 'SELECT `Cabinet` FROM `Media`')
    hashes = {}
    for (name,) in media:
        if not name.startswith('#'): raise RuntimeError('Expected embedded cabinet')
        view = H(); check(open_view(db, 'SELECT `Data` FROM `_Streams` WHERE `Name` = ' + quote(name[1:]), c.byref(view)))
        record = H()
        try:
            check(execute(view, 0)); check(fetch(view, c.byref(record)))
            sha = hashlib.sha256(); buf = c.create_string_buffer(4 * 1024 * 1024); total = 0
            while True:
                size = w.DWORD(len(buf)); check(read_stream(record, 1, buf, c.byref(size)))
                if not size.value: break
                sha.update(buf.raw[:size.value]); total += size.value
            hashes[name] = dict(sha256=sha.hexdigest(), bytes=total)
        finally: close(record); close(view)
    return hashes

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--input', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--signtool', type=Path, required=True)
    a = p.parse_args()
    assert not a.output.exists(), 'Output exists; inspect before repeating'
    with a.input.open('rb') as f: assert hashlib.file_digest(f, 'sha256').hexdigest() == ACCEPTED
    subprocess.run([str(a.signtool), 'verify', '/pa', '/v', str(a.input)], check=True)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(a.input, a.output)
    db = H(); check(open_db(str(a.output.resolve()), c.cast(c.c_void_p(1), w.LPCWSTR), c.byref(db)))
    changes = []
    try:
        props = dict(query(db, 'SELECT `Property`, `Value` FROM `Property`'))
        assert props['ProductName'] == OLD_NAME and props['ProductVersion'] == '1.7.1.1'
        assert props['UpgradeCode'] == FAMILY
        cabinets = cabinet_hash(db)
        # MSI Authenticode lives in structured-storage streams. signtool's
        # remove command supports PE files, not MSI. Remove only the old outer
        # package signature from this new copy; embedded signatures stay intact.
        for (stream,) in query(db, 'SELECT `Name` FROM `_Streams`'):
            if stream in ('\x05DigitalSignature', '\x05MsiDigitalSignatureEx'):
                sql(db, 'DELETE FROM `_Streams` WHERE `Name` = ' + quote(stream))
        new_product = '{' + str(uuid.uuid4()).upper() + '}'
        for name, value in [('ProductName', 'Townlight'), ('ProductVersion', '1.7.2.1'), ('ProductCode', new_product)]:
            sql(db, f'UPDATE `Property` SET `Value` = {quote(value)} WHERE `Property` = {quote(name)}')
            changes.append(dict(table='Property', key=name, before=props[name], after=value))
        for table, key, columns in [('Directory','Directory',['DefaultDir']), ('Shortcut','Shortcut',['Name','Description']), ('Registry','Registry',['Key']), ('RegLocator','Signature_',['Key']), ('Feature','Feature',['Title','Description'])]:
            for column in columns:
                for ident, value in query(db, f'SELECT `{key}`, `{column}` FROM `{table}`'):
                    if OLD_NAME not in value: continue
                    replacement = value.replace(OLD_NAME, 'Townlight')
                    sql(db, f'UPDATE `{table}` SET `{column}` = {quote(replacement)} WHERE `{key}` = {quote(ident)}')
                    changes.append(dict(table=table, key=ident, column=column, before=value, after=replacement))
        # Version bounds are part of Upgrade's composite primary key, so MSI
        # requires replacing a row rather than UPDATE of either bound.
        upgrade_columns = ('UpgradeCode','VersionMin','VersionMax','Language','Attributes','Remove','ActionProperty')
        for row in query(db, 'SELECT * FROM `Upgrade`'):
            replacement = list(row)
            for i in (1, 2):
                if replacement[i] == '1.7.1.1': replacement[i] = '1.7.2.1'
            if replacement == row: continue
            sql(db, 'DELETE FROM `Upgrade` WHERE `UpgradeCode` = ' + quote(row[0]) + ' AND `ActionProperty` = ' + quote(row[6]))
            values = [str(int(v)) if i == 4 else quote(v) if v else 'NULL' for i, v in enumerate(replacement)]
            sql(db, 'INSERT INTO `Upgrade` (' + ','.join('`'+x+'`' for x in upgrade_columns) + ') VALUES (' + ','.join(values) + ')')
            changes.append(dict(table='Upgrade', before=row, after=replacement))
        summary = H(); check(summary_open(db, None, 3, c.byref(summary)))
        try:
            for prop, value in [(2,'Townlight'), (3,'Townlight Windows public beta 1.7.2.1'), (9,'{' + str(uuid.uuid4()).upper() + '}')]:
                check(summary_set(summary, prop, 30, 0, None, value))
            check(summary_save(summary))
        finally: close(summary)
        check(commit(db))
        assert cabinet_hash(db) == cabinets, 'Packaged application/runtime cabinet changed'
        final = dict(query(db, 'SELECT `Property`, `Value` FROM `Property`'))
        assert final['ProductName'] == 'Townlight' and final['ProductVersion'] == '1.7.2.1'
        assert final['UpgradeCode'] == FAMILY and final['ProductCode'] != props['ProductCode']
    finally: close(db)
    with a.output.open('rb') as f: sha = hashlib.file_digest(f, 'sha256').hexdigest()
    receipt = dict(schema_version=1, input_msi_sha256=ACCEPTED, application_source_commit='919f2492cf43a83e693db71fe1371001e529cf40', output_sha256=sha, output_bytes=a.output.stat().st_size, product_name='Townlight', product_version='1.7.2.1', product_code=new_product, upgrade_code=FAMILY, preserved_cabinets=cabinets, changes=changes, unsigned=True)
    a.output.with_suffix('.metadata.json').write_text(json.dumps(receipt, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__': main()
