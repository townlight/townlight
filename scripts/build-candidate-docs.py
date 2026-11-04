"""Render current manuals from owning Markdown sources using Pandoc.

This prepares documentation only. It makes no signing, installed-acceptance or
publication claim and never edits historical releases or receipts.
"""
from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = {
    'suite': ('townlight', 'Townlight Suite'),
    'core': ('core', 'Townlight Core'),
    'records': ('sunshine', 'Townlight Records'),
    'meetings': ('meetings', 'Townlight Meetings'),
    'code': ('ordinances', 'Townlight Code'),
    'zoning': ('zone', 'Townlight Zoning'),
    'planning': ('plan', 'Townlight Planning'),
    'permitting': ('permit', 'Townlight Permitting'),
    'inspections': ('inspect', 'Townlight Inspections'),
    'access': ('access', 'Townlight Access'),
    'notice': ('notice', 'Townlight Notice'),
    'station': ('station/beta-1', 'Townlight Station'),
}


def run(arguments, **kwargs):
    result = subprocess.run(arguments, capture_output=True, **kwargs)
    if result.returncode:
        raise RuntimeError(f"Documentation command failed ({result.returncode}): {arguments[0]}\n"
                           + result.stdout.decode('utf-8', errors='replace')
                           + result.stderr.decode('utf-8', errors='replace'))


def render(source, destination, title, css, prefix):
    # Pandoc generates the body and TOC from the same Markdown; all script and
    # stylesheet inputs are local and the resulting HTML works offline.
    fragment = subprocess.check_output([
        'pandoc', str(source), '-f', 'markdown+raw_html', '-t', 'html5',
        '--toc', '--toc-depth=2', '--standalone', '-M', 'pagetitle=' + title,
    ]).decode('utf-8').replace('\r\n', '\n')
    body = re.search(r'<body[^>]*>(.*)</body>', fragment, re.S).group(1)
    # Owning Markdown links address docs/beta-1 from the repository root;
    # these generated pages live in the site's manuals directory instead.
    body = body.replace('href="docs/beta-1/', 'href="../')
    if prefix == '..' and source.parent.name == 'beta-1':
        body = body.replace('href="docs/history/', 'href="../history/station/')
    document = f'''<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} | Townlight candidate</title><style>{css}</style></head>
<body><a class="skip" href="#main">Skip to content</a>
<header><a class="brand" href="{prefix}/index.html">Townlight</a>
<nav aria-label="Main"><a href="{prefix}/manuals/suite.html">Suite manual</a>
<a href="{prefix}/versions.html">Versions and candidate status</a>
<a href="{prefix}/terms.html">Terms and license</a></nav></header>
<main id="main" class="reading wrap"><p class="edition">Naming, Access and Notice source candidate · 2 November 2026</p>
<p>Prepared documentation. Build, signing, installed acceptance and publication remain pending.</p>
{body}</main><footer>Townlight · AGPL-3.0-only · Candidate evidence applies only to its identified artifacts.</footer></body></html>'''
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(document, encoding='utf-8', newline='\n')


def refresh_landing(path, identity):
    """Keep the existing current landing design while removing stale claims."""
    if not path.is_file():
        return
    text = path.read_text(encoding='utf-8')
    # Correct the two observed baseline encoding errors in current landing copy.
    # Do not transcode whole files or touch historical pages.
    text = text.replace('â†’', '→').replace('Â·', '·')
    if '<base href="./beta-1/">' in text:
        # A bare #main would resolve against beta-1/, navigating away from
        # the owning docs/index.html rather than skipping within this page.
        text = text.replace('<a class="skip" href="#main">',
                            '<a class="skip" href="../index.html#main">', 1)
    banner = '<aside aria-label="Candidate status" style="padding:1rem"><strong>Prepared naming, Access and Notice candidate.</strong> Build, signing, installed acceptance and publication remain pending. Earlier releases retain their own identities and evidence.</aside>'
    text = re.sub(r'<aside\b[^>]*>.*?</aside>', lambda _match: banner, text, count=1, flags=re.S)
    text = re.sub(r'(<div class="facts"><span>).*?(</span>)',
                  lambda match: match[1] + html.escape(identity) + match[2], text, count=1, flags=re.S)
    text = text.replace('Selected staff workflows passed.', 'Candidate installed acceptance remains pending.')
    text = text.replace('The signed private candidate passed normal first-run and selected synthetic workflows in a fresh Windows Sandbox profile.',
                        'Earlier releases have their own first-run and synthetic Windows Sandbox evidence. This changed source candidate requires a new signed installer and installed acceptance.')
    text = text.replace('Begin with the manual and the signed candidate linked above.',
                        'Begin with the current manual; obtain this candidate only after its exact installer and acceptance are identified.')
    text = text.replace('Begin with the manual and the identified private candidate from the beta coordinator.',
                        'Begin with the current manual; obtain this candidate only after its exact installer and acceptance are identified.')
    text = text.replace('Notice and Access are supporting components, rather than additional products in this nine-product beta.',
                        'Access and Notice provide the bounded staff workflows described in their current manuals; installed acceptance remains pending.')
    path.write_text(text, encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, default=ROOT.parent / 'townlight.github.io')
    parser.add_argument('--products', nargs='+', choices=PRODUCTS, default=list(PRODUCTS))
    parser.add_argument('--docx', action='store_true')
    parser.add_argument('--pdf', action='store_true', help='Convert generated Word files using an isolated LibreOffice profile')
    parser.add_argument('--versions', action='store_true', help='Render the current candidate table from suite-state.json')
    parser.add_argument('--sync-owner', action='store_true', help='Refresh existing current manual copies in owning repositories')
    parser.add_argument('--landing', action='store_true', help='Refresh existing owning current landing status and identities')
    args = parser.parse_args()
    # Retain the suite's existing visual design without executing an older
    # documentation builder or reading its historical evidence as current.
    stylesheet = args.site_root / 'assets/site.css'
    css = stylesheet.read_text(encoding='utf-8')
    state = json.loads((ROOT / 'config/suite-state.json').read_text(encoding='utf-8'))
    documents = []
    for slug in args.products:
        repo, title = PRODUCTS[slug]
        source = ROOT.parent / repo / 'USER-MANUAL.md'
        render(source, args.site_root / 'manuals' / f'{slug}.html', title + ' Manual', css, '..')
        if args.docx or args.pdf:
            destination = args.site_root / 'docx' / f'Townlight-{slug.title()}-Manual-Beta-1.docx'
            destination.parent.mkdir(parents=True, exist_ok=True)
            # Owning manuals supply their own headings/linked contents. Avoid
            # an unevaluated Word TOC field and duplicate title on PDF export.
            run(['pandoc', str(source), '--standalone', '-o', str(destination)])
            documents.append(destination.resolve())
        print(f'Rendered {slug} from {source}')
        if args.landing:
            identity = 'Suite candidate 1.7.0.1; installed acceptance pending'
            if slug != 'suite':
                module = state['modules'][slug]
                identity = module['legacy']['package_names'][0] + ' ' + module['versions']['installer']
            owner = ROOT.parent / repo
            for path in (owner / 'docs/index.html', owner / 'docs/beta-1/index.html',
                         args.site_root / ('index.html' if slug == 'suite' else f'products/{slug}/index.html')):
                refresh_landing(path, identity)
    if args.pdf:
        executable = shutil.which('soffice.com')
        if not executable:
            installed = Path('C:/Program Files/LibreOffice/program/soffice.com')
            if installed.is_file():
                executable = str(installed)
        if not executable:
            raise RuntimeError('LibreOffice soffice.com is required for PDF conversion')
        output = (args.site_root / 'pdf').resolve()
        output.mkdir(parents=True, exist_ok=True)
        # Never share or terminate the staff member's running Office session.
        with tempfile.TemporaryDirectory(prefix='townlight-docs-') as profile:
            staged = Path(profile) / 'rendered'
            staged.mkdir()
            run([executable, '-env:UserInstallation=' + Path(profile).as_uri(),
                 '--headless', '--convert-to',
                 'pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"}}',
                 '--outdir', str(staged), *map(str, documents)])
            for document in documents:
                pdf = staged / (document.stem + '.pdf')
                if not pdf.is_file() or not pdf.stat().st_size:
                    raise RuntimeError(f'PDF conversion did not produce {pdf}')
                target = output / pdf.name
                # LibreOffice may mark generated PDFs read-only on Windows.
                # Only replace this explicitly selected current output file.
                if target.exists():
                    target.chmod(stat.S_IREAD | stat.S_IWRITE)
                shutil.copyfile(pdf, target)
                pdf.chmod(stat.S_IREAD | stat.S_IWRITE)
    if args.versions:
        lines = ['# Component versions', '',
                 'This is the prepared naming, Access and Notice candidate. It has not yet passed signed Windows installed acceptance or been published.', '',
                 '| Product | Distribution | Candidate version |',
                 '|---|---|---|']
        for key in state['module_order']:
            module = state['modules'][key]
            distribution = module['legacy']['package_names'][0]
            version = module['versions']['installer']
            lines.append(f"| {module['public_name']} | `{distribution}` | {version} |")
        lines += [f"| Runtime | `townlight-runtime` | {state['desktop_release']['runtime_version']} |", '',
                  'Desktop source version: `' + state['desktop_release']['version'] + '`. Intended MSI version: `1.7.0.1`. Candidate MSI, signature, hashes and installed acceptance remain pending.', '',
                  'Historical releases retain their original package identities, version numbers and evidence. These candidate names do not rename historical artifacts.', '',
                  'Station remains the existing Beta 1 Python service. Its separate Rust development line and standalone CivicCast are outside this migration.']
        source = ROOT / 'docs/current-versions.md'
        source.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        render(source, args.site_root / 'versions.html', 'Component versions', css, '.')
    if args.sync_owner:
        for slug in args.products:
            repo, _title = PRODUCTS[slug]
            owner = ROOT.parent / repo
            source = owner / 'USER-MANUAL.md'
            readme_text = owner / 'README.txt'
            if readme_text.exists():
                run(['pandoc', str(owner / 'README.md'), '-t', 'plain', '--wrap=none', '-o', str(readme_text)])
            text_copy = owner / 'USER-MANUAL.txt'
            if text_copy.exists():
                run(['pandoc', str(source), '-t', 'plain', '--wrap=none', '-o', str(text_copy)])
            for extension in ('docx', 'pdf'):
                generated = args.site_root / extension / f'Townlight-{slug.title()}-Manual-Beta-1.{extension}'
                target = owner / f'USER-MANUAL.{extension}'
                if target.exists():
                    shutil.copyfile(generated, target)
            beta = owner / 'docs/beta-1'
            if beta.is_dir():
                for relative in (f'manuals/{slug}.html',
                                 f'docx/Townlight-{slug.title()}-Manual-Beta-1.docx',
                                 f'pdf/Townlight-{slug.title()}-Manual-Beta-1.pdf',
                                 'versions.html'):
                    generated = args.site_root / relative
                    target = beta / relative
                    if generated.is_file() and (target.exists() or relative == 'versions.html'):
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copyfile(generated, target)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
