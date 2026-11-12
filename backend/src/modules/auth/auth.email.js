// Shared HTML layout for the one-time code emails. Inline styles only, so mail clients keep the design.
function otpEmailHtml({ heading, intro, otp, outro }) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border:1px solid #cbd5e1;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:#09244a;padding:20px 24px;color:#ffffff;">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.16em;text-transform:uppercase;color:#bfdbfe;">A.SSET</p>
                <p style="margin:4px 0 0;font-size:16px;font-weight:700;">GSO Asset Management</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">${heading}</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:1.6;color:#475569;">${intro}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
                  <tr>
                    <td align="center" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px 12px;">
                      <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1d4ed8;">Your code</p>
                      <p style="margin:8px 0 0;font-size:32px;font-weight:800;letter-spacing:0.32em;color:#0f172a;font-family:'Courier New',Courier,monospace;">${otp}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#475569;">This code expires in <strong>5 minutes</strong> and can only be used once.</p>
                <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#64748b;">${outro}</p>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e2e8f0;padding:14px 24px;font-size:11px;color:#94a3b8;">
                Sent by A.SSET. Please do not share this code with anyone.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

module.exports = { otpEmailHtml };
