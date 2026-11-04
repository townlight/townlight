; Townlight Windows installer wrapper manifest.
; Townlight city-core unsigned beta installer package: build with Inno Setup after reviewing the generated package payload.

#define AppName "Townlight"
#define AppVersion "0.1.2"
#define AppPublisher "Townlight"
#define PackageSource "..\..\packages\city-core\windows"

[Setup]
AppId={{5D8D0E49-99F6-4AFB-88DD-7BE93162A554}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\Townlight
DefaultGroupName=Townlight
OutputBaseFilename=Townlight-city-core-Setup-0.1.2
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest

[Files]
Source: "{#PackageSource}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Townlight Installer"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\start-townlight-installer.ps1"" -Readiness"
