from pathlib import Path
import subprocess,tempfile
import re
base=Path(__file__).resolve().parents[2];site=base/'docs/beta-1';assets=base/'scripts/docs/portal-assets';guide=base/'docs/portal/guide.md';html=site/'manuals/portal.html'
subprocess.run(['pandoc',str(guide),'-s','--toc','--toc-depth=2','--template',str(assets/'template.html'),'-M','title=Townlight Portal Guide','-M','description=Townlight public meeting portal guide','-o',str(html)],check=True)
t=html.read_text(encoding='utf8').replace('href="../beta-1/terms.html"','href="../terms.html"').replace('src="../beta-1/assets/portal-architecture.svg"','src="../assets/portal-architecture.svg"')
t=t.replace('href="verification.md"','href="../reference/portal-verification.html"')
t=t.replace('src="../beta-1/assets/','src="../assets/')
t=t.replace('Documentation edition 30 October 2026<br>Existing component versions retained<br>Signed suite installer 1.6.0.1<br>Private beta documentation companion','Local integration candidate · 2 November 2026<br>Existing signed installer and historical acceptance predate this integration').replace('<h1\nid="townlight-portal-guide">Townlight Portal guide</h1>','<h2 id="townlight-portal-guide">Townlight Portal guide</h2>')
t=t.replace('<p>Townlight Beta 1 · local integration candidate</p>','<p>Townlight Beta 1 · local integration candidate</p><p><a href="../pdf/Townlight-Portal-Guide-Beta-1.pdf">Printable PDF</a> · <a href="../docx/Townlight-Portal-Guide-Beta-1.docx">Editable Word</a></p>');html.write_text(t,encoding='utf8')
verification=base/'docs/portal/verification.md'; verification_html=site/'reference/portal-verification.html'
subprocess.run(['pandoc',str(verification),'-s','--toc','--toc-depth=2','--template',str(assets/'template.html'),'-M','title=Townlight Portal Verification','-M','description=Portal candidate verification','-o',str(verification_html)],check=True)
v=verification_html.read_text(encoding='utf8').replace('href="guide.md"','href="../manuals/portal.html"')
v=v.replace('href="receipts/resident-website-acceptance.json"','href="portal-resident-website-acceptance.json"')
v=v.replace('Documentation edition 30 October 2026<br>Existing component versions retained<br>Signed suite installer 1.6.0.1<br>Private beta documentation companion','Local integration candidate · 2 November 2026<br>Existing signed installer predates this integration')
v=v.replace('<h1\nid="portal-verification-and-isolated-acceptance">Portal verification and isolated acceptance</h1>','<h2 id="portal-verification-and-isolated-acceptance">Portal verification and isolated acceptance</h2>')
v=re.sub(r'<h1\s+id="portal-verification-and-isolated-acceptance">(.*?)</h1>',r'<h2 id="portal-verification-and-isolated-acceptance">\1</h2>',v,flags=re.S)
verification_html.write_text(v,encoding='utf8')
import shutil
receipt=base/'docs/portal/receipts/resident-website-acceptance.json'
if receipt.is_file(): shutil.copyfile(receipt,site/'reference/portal-resident-website-acceptance.json')
source=guide.read_text(encoding='utf8').replace('../beta-1/assets/portal-architecture.svg',(site/'assets/word/portal-architecture.png').resolve().as_posix()).replace('../beta-1/assets/',(site/'assets').resolve().as_posix()+'/').replace('](verification.md)','](https://github.com/townlight/townlight/blob/main/docs/portal/verification.md)')
with tempfile.NamedTemporaryFile(mode='w',suffix='.md',encoding='utf8',delete=False) as f:f.write(source);temp=Path(f.name)
try:subprocess.run(['pandoc',str(temp),'-f','markdown','-t','docx','--toc','--reference-doc',str(assets/'word-reference.docx'),'-M','title=Townlight Portal Guide','-M','subtitle=Townlight Beta 1','-o',str(site/'docx/Townlight-Portal-Guide-Beta-1.docx')],check=True)
finally:temp.unlink()
