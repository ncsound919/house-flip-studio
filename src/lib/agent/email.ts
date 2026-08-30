// Email helper — Resend-backed, with graceful no-key fallback.
//
// HONESTY: the agent never claims an email was sent unless it really was.
// If RESEND_API_KEY is unset, the helper returns sent:false and the runner
// records the message as a "draft ready" action so the operator can send
// it manually. The same applies on transport failure.

export interface SendEmailResult {
  sent: boolean;
  reason?: string; // when sent:false
  id?: string; // provider id when sent:true
}

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
}

const DEFAULT_FROM = "NC House Flip Studio <onboarding@resend.dev>";

export async function sendEmail(msg: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY not set — message kept as draft" };
  }
  const from = msg.from ?? process.env.AGENT_FROM_EMAIL ?? DEFAULT_FROM;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      }),
    });
    if (!res.ok) {
      let detail = `Resend returned ${res.status}`;
      try {
        const data = await res.json();
        if (data?.message) detail = `Resend: ${data.message}`;
      } catch {
        // ignore parse errors
      }
      return { sent: false, reason: detail };
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: data?.id };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "Network error" };
  }
}
