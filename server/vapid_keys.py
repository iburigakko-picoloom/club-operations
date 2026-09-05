"""Generate local VAPID keys. Private key stays on your server, never in GitHub or the frontend."""
from pathlib import Path
import base64,os
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization

def main():
 out=Path('data/vapid-private.pem');out.parent.mkdir(parents=True,exist_ok=True)
 if out.exists():raise SystemExit('Existing key found; refusing to overwrite push identity.')
 key=ec.generate_private_key(ec.SECP256R1())
 fd=os.open(out,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
 public=key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)
 print('VAPID_PRIVATE_KEY='+str(out.resolve()))
 print('VAPID_PUBLIC_KEY='+base64.urlsafe_b64encode(public).rstrip(b'=').decode())
 print('VAPID_CONTACT=mailto:YOUR_REAL_EMAIL')
if __name__=='__main__':main()
