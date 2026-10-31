"""Pack and lock the engine folder into engine.bin. usage: python3 pack.py <engine_dir> <staff password>"""
import sys, os, io, tarfile, hashlib, json, secrets, glob
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
here = os.path.dirname(os.path.abspath(__file__))
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz') as t:
    for f in sorted(glob.glob(os.path.join(sys.argv[1], '*.py')) + [os.path.join(sys.argv[1], 'sources.json')]):
        t.add(f, arcname=os.path.basename(f))
salt = secrets.token_bytes(16); it = 600000
key = hashlib.pbkdf2_hmac('sha256', sys.argv[2].encode(), salt, it, 32)
n = secrets.token_bytes(12)
open(os.path.join(here, 'engine.bin'), 'wb').write(n + AESGCM(key).encrypt(n, buf.getvalue(), None))
json.dump({'salt': salt.hex(), 'iter': it}, open(os.path.join(here, 'engine.json'), 'w'))
print('packed', len(buf.getvalue()), 'bytes')
