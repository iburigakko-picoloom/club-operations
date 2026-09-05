"""Run on the host with its environment: python -m server.check_config.
No secrets are printed and no external calls are made.
"""
import os
from server.identity import line_config_errors

def main():
    if os.environ.get('LINE_LOGIN_ENABLED')!='1':
        print('LINE login is disabled. Set LINE_LOGIN_ENABLED=1 when the channel and HTTPS host are ready.')
        return 1
    errors=line_config_errors()
    if errors:
        for error in errors:print('ERROR: '+error)
        return 1
    print('LINE configuration is valid. Real LINE authentication is still required to verify the connection.')
    return 0

if __name__=='__main__':raise SystemExit(main())
