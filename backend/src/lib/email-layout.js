// Shared look for every A.SSET email. Inline styles and tables only, so Gmail and Outlook keep the design.
// title, intro, footer, detailPanel rows and noticeBox text are plain text and are escaped here.
// body is HTML, so escape any value you put in it with escapeHtml.

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function emailLayout({ title, intro = '', body = '', footer = 'This is an automated message from A.SSET.' }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#09244a;padding:22px 28px;color:#ffffff;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#bfdbfe;">A.SSET</p>
                <p style="margin:4px 0 0;font-size:16px;font-weight:700;color:#ffffff;">GSO Asset Management</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <h1 style="margin:0;font-size:20px;line-height:1.3;font-weight:800;color:#0f172a;word-break:break-word;">${escapeHtml(title)}</h1>
                ${intro ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(intro)}</p>` : ''}
                <div style="margin-top:22px;">${body}</div>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e2e8f0;padding:14px 28px;font-size:11px;line-height:1.6;color:#94a3b8;">${escapeHtml(footer)}</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// Label and value rows in a light panel, e.g. reference, venue, or item details.
function detailPanel(rows) {
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">${rows.map(([label, value], index) => `
    <tr>
      <td style="padding:12px 16px;${index ? 'border-top:1px solid #e2e8f0;' : ''}">
        <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">${escapeHtml(label)}</p>
        <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${escapeHtml(value)}</p>
      </td>
    </tr>`).join('')}
  </table>`;
}

// Amber call-out for warnings the reader must not miss.
function noticeBox(text) {
  return `<div style="margin-top:18px;padding:12px 14px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:13px;font-weight:700;line-height:1.5;white-space:pre-line;">${escapeHtml(text)}</div>`;
}

module.exports = { escapeHtml, emailLayout, detailPanel, noticeBox };
