# Windows 1.7.2.1 installer metadata release

This changes the Windows Installer product name to **Townlight**, installer version
1.7.2.1, package/product codes, visible shortcut and folder names, and upgrade version
bounds. The UpgradeCode is unchanged. It preserves the exact embedded cabinet from
signed Windows 1.7.1.1; no application or runtime code is rebuilt or changed.
The application source remains `919f2492cf43a83e693db71fe1371001e529cf40`.
The original 1.7.1.1 MSI, tag and release assets remain intact.

The reproducible metadata recipe is `scripts/release/relabel_windows_msi.py` and its
input/identity contract is `config/windows-msi-1.7.2.1.json`. The recipe verifies the
accepted MSI hash and signature, modifies a copy, removes only that copy's outer MSI
signature, changes installer metadata, and requires identical cabinet hashes after
commit. Its JSON receipt lists every change. The new outer MSI must then be signed
through the existing Azure Scott Converse signing workflow and independently verified.
All existing embedded executable signatures are preserved.

Scott explicitly authorized the metadata-only merge exception on November 5, 2026.
The full application/runtime build and suite CI are not acceptance for this metadata
change. Required acceptance is the signed MSI's name/version, fresh installation,
upgrade from 1.7.1.1 with retained user data, and uninstall. Other functional acceptance
is reused from 1.7.1.1 and must be identified as reused, not rerun.

The separate installer tag is `townlight-windows-v1.7.2.1`. The public release must
identify both the application source and the merged metadata-recipe source. Keep
Windows 1.7.1.1 available. No Linux or Mac artifact is part of this release.
