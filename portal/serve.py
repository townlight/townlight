# SPDX-License-Identifier: AGPL-3.0-only
"""Run the public application behind a same-host TLS/static reverse proxy."""
import argparse
import os


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'portal.settings')
    from django.conf import settings
    if settings.DEBUG:
        parser.error('Set TOWNLIGHT_DEBUG=0 and deployment settings before serving')
    from portal.wsgi import application
    from waitress import serve
    options = {}
    if os.environ.get('TOWNLIGHT_TRUST_TLS_PROXY') == '1':
        options = {'trusted_proxy': '127.0.0.1', 'trusted_proxy_headers': {'x-forwarded-proto'}}
    serve(application, host='127.0.0.1', port=args.port, threads=8, **options)


if __name__ == '__main__':
    main()
