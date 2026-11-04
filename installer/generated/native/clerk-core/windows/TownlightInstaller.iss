; Townlight Windows installer wrapper manifest.
; Townlight OSS public-use starter installer package: build with Inno Setup after reviewing the generated package payload.

#define AppName "Townlight"
#define AppVersion "0.1.0"
#define AppPublisher "Townlight"
#define PackageSource "..\..\packages\clerk-core\windows"

[Setup]
AppId={{93D44C49-0CF0-44FB-B041-0EF20C43FA32}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Townlight
DefaultGroupName=Townlight
OutputBaseFilename=Townlight-clerk-core-Setup-0.1.0
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "{#PackageSource}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Townlight Installer"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\start-townlight-installer.ps1"" -Readiness"
