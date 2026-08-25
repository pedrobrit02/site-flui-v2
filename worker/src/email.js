// Envio de e-mail "no-reply" via Resend (https://resend.com), avisando a
// pessoa que fez a solicitação sobre a decisão (deferido/indeferido).
// Requer o secret RESEND_API_KEY configurado no Worker
// (npx wrangler@3 secret put RESEND_API_KEY) e um remetente configurado em
// RESEND_FROM (ex: "FLUI <no-reply@seudominio.com>" — o domínio precisa
// estar verificado no Resend, ou use o remetente de teste deles enquanto
// não configura o domínio próprio).

export async function enviarEmailDecisao(env, { destinatario, nome, tipo, status, motivo }) {
  if (!env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY não configurado — e-mail não enviado.");
    return { ok: false, error: "RESEND_API_KEY ausente" };
  }

  const tipoTexto = tipo === "emprestimo" ? "solicitação de empréstimo" : "solicitação de uso de equipamentos";
  const statusTexto = status === "deferido" ? "deferida" : "indeferida";
  const corTitulo = status === "deferido" ? "#1a9c5c" : "#c0392b";

  const assunto = `FLUI — sua ${tipoTexto} foi ${statusTexto}`;
  const motivoHtml = motivo
    ? `<p style="margin:16px 0 0;color:#333;"><strong>Observação da equipe:</strong> ${escapeHtml(motivo)}</p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0c0c10;">
      <h2 style="color:${corTitulo};margin:0 0 12px;">Sua ${tipoTexto} foi ${statusTexto}</h2>
      <p style="margin:0 0 8px;">Olá, ${escapeHtml(nome)}.</p>
      <p style="margin:0 0 8px;">A equipe do FLUI analisou sua ${tipoTexto} e ela foi <strong>${statusTexto}</strong>.</p>
      ${motivoHtml}
      <p style="margin:20px 0 0;color:#5a5a6a;font-size:0.9em;">
        Esta é uma mensagem automática — não é possível responder a este e-mail.
        Em caso de dúvidas, procure a equipe do FLUI presencialmente ou pelos canais oficiais.
      </p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "FLUI <onboarding@resend.dev>",
      to: [destinatario],
      subject: assunto,
      html,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Falha ao enviar e-mail via Resend:", res.status, text);
    return { ok: false, error: `Resend HTTP ${res.status}` };
  }
  return { ok: true };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
