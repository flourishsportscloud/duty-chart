"""Unlock the FIS Reports engine (engine.bin, AES-GCM, key from the staff password via PBKDF2-SHA256).
usage: python3 unpack.py <staff password> <out_dir>"""
import sys, os, io, tarfile, hashlib, json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
here = os.path.dirname(os.path.abspath(__file__))
meta = json.load(open(os.path.join(here, 'engine.json')))
key = hashlib.pbkdf2_hmac('sha256', sys.argv[1].encode(), bytes.fromhex(meta['salt']), meta['iter'], 32)
b = open(os.path.join(here, 'engine.bin'), 'rb').read()
raw = AESGCM(key).decrypt(b[:12], b[12:], None)
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as t:
    for m in t.getmembers():
        if not m.isfile() or '/' in m.name or m.name.startswith('.'): sys.exit('unexpected entry ' + m.name)
    os.makedirs(sys.argv[2], exist_ok=True); t.extractall(sys.argv[2], filter='data')
print('engine unpacked to', sys.argv[2])
