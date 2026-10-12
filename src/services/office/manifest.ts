/**
 * Membuat manifest add-in (XML) untuk alamat hosting yang sedang dipakai.
 * Dengan begitu pengguna tidak perlu mengedit manifest secara manual:
 * buka situs di browser biasa → klik "Unduh manifest.xml" → upload ke Excel.
 */

/** Alamat folder aplikasi, mis. "https://budi.github.io/report-audit/". */
export function appBaseUrl(href: string): string {
  return new URL("./", href).href;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildManifest(baseUrl: string): string {
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") {
    throw new Error("Add-in Office wajib di-host dengan HTTPS.");
  }
  const base = escapeXml(url.href.endsWith("/") ? url.href : `${url.href}/`);
  const origin = escapeXml(url.origin);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Manifest add-in Report Audit (uji coba), dibuat otomatis untuk ${base} -->
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
           xsi:type="TaskPaneApp">
  <Id>cc281bfb-ad5f-4b9e-b5dc-66d681962b3b</Id>
  <Version>0.0.1.0</Version>
  <ProviderName>Report Audit (pribadi)</ProviderName>
  <DefaultLocale>id-ID</DefaultLocale>
  <DisplayName DefaultValue="Report Audit"/>
  <Description DefaultValue="Uji coba: buka PDF laporan keuangan secara lokal, klik angka, dan cari angka yang sama di halaman lain."/>
  <IconUrl DefaultValue="${base}assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="${base}assets/icon-64.png"/>
  <SupportUrl DefaultValue="${base}index.html"/>
  <AppDomains>
    <AppDomain>${origin}</AppDomain>
  </AppDomains>
  <Hosts>
    <Host Name="Workbook"/>
  </Hosts>
  <Requirements>
    <Sets DefaultMinVersion="1.1">
      <Set Name="ExcelApi" MinVersion="1.7"/>
    </Sets>
  </Requirements>
  <DefaultSettings>
    <SourceLocation DefaultValue="${base}index.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Workbook">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl"/>
          </GetStarted>
          <FunctionFile resid="Commands.Url"/>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="ReportAudit.Group1">
                <Label resid="Group.Label"/>
                <Icon>
                  <bt:Image size="16" resid="Icon.16x16"/>
                  <bt:Image size="32" resid="Icon.32x32"/>
                  <bt:Image size="80" resid="Icon.80x80"/>
                </Icon>
                <Control xsi:type="Button" id="ReportAudit.OpenPane">
                  <Label resid="Button.Label"/>
                  <Supertip>
                    <Title resid="Button.Label"/>
                    <Description resid="Button.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16x16"/>
                    <bt:Image size="32" resid="Icon.32x32"/>
                    <bt:Image size="80" resid="Icon.80x80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>ReportAuditPane</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16x16" DefaultValue="${base}assets/icon-16.png"/>
        <bt:Image id="Icon.32x32" DefaultValue="${base}assets/icon-32.png"/>
        <bt:Image id="Icon.80x80" DefaultValue="${base}assets/icon-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Commands.Url" DefaultValue="${base}commands.html"/>
        <bt:Url id="Taskpane.Url" DefaultValue="${base}index.html"/>
        <bt:Url id="GetStarted.LearnMoreUrl" DefaultValue="${base}index.html"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GetStarted.Title" DefaultValue="Report Audit siap dipakai"/>
        <bt:String id="Group.Label" DefaultValue="Report Audit"/>
        <bt:String id="Button.Label" DefaultValue="Report Audit"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GetStarted.Description" DefaultValue="Klik tombol Report Audit di tab Home untuk membuka panel."/>
        <bt:String id="Button.Tooltip" DefaultValue="Buka panel Report Audit untuk membaca PDF laporan keuangan secara lokal."/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
`;
}

/** Picu unduhan file manifest.xml di browser. */
export function downloadManifest(href: string): void {
  const xml = buildManifest(appBaseUrl(href));
  const blob = new Blob([xml], { type: "application/xml" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "manifest.xml";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
