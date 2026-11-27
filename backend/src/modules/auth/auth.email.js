const { emailLayout, escapeHtml } = require('../../lib/email-layout');

// The one-time code emails: the same shared layout, with the code in a highlighted box.
function otpEmailHtml({ heading, intro, otp, outro }) {
  const body = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px 12px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#1d4ed8;">Your code</p>
          <p style="margin:8px 0 0;font-size:32px;font-weight:800;letter-spacing:0.32em;color:#0f172a;font-family:'Courier New',Courier,monospace;">${otp}</p>
        </td>
      </tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#475569;">This code expires in <strong>5 minutes</strong> and can only be used once.</p>
    <p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(outro)}</p>`;
  return emailLayout({
    title: heading,
    intro,
    body,
    footer: 'Sent by A.SSET. Please do not share this code with anyone.',
  });
}

module.exports = { otpEmailHtml };
