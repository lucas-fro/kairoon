import { Resend } from 'resend'
import { env } from '../env'
import { KAIROON_LOGO_PNG_BASE64 } from './emailLogo'
import { AppError } from './errors'

/**
 * E-mail transacional via Resend. Se RESEND_API_KEY não estiver definida, os
 * envios viram no-op (apenas logados) — a app continua funcionando em dev sem
 * configurar e-mail. Em produção, defina a chave e um RESEND_FROM de domínio
 * verificado no Resend (o remetente de teste onboarding@resend.dev só entrega
 * para o e-mail dono da conta Resend).
 */
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null

/** Base pública da app (primeira origem do CORS) para links nos e-mails. */
const APP_URL = env.CORS_ORIGIN.split(',')[0].trim()

const BRAND = {
  navy: '#1E2F5E',
  blue: '#6EA8FE',
  bg: '#F6F8FC',
  ink: '#0F172A',
  inkSoft: '#475569',
  line: '#E8EDF5',
}

// Logo anexado inline em todo e-mail (o cabeçalho o referencia via cid:). PNG
// porque SVG não renderiza na maioria dos clientes de e-mail.
const LOGO_CID = 'kairoon-logo'
const LOGO_ATTACHMENT = {
  filename: 'kairoon-logo.png',
  content: Buffer.from(KAIROON_LOGO_PNG_BASE64, 'base64'),
  contentType: 'image/png',
  contentId: LOGO_CID,
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

interface SendArgs {
  to: string
  subject: string
  html: string
  text: string
}

async function sendEmail({ to, subject, html, text }: SendArgs): Promise<void> {
  if (!resend) {
    console.warn(`[mailer] RESEND_API_KEY ausente — e-mail "${subject}" para ${to} NÃO enviado.`)
    return
  }
  const { error } = await resend.emails.send({
    from: env.RESEND_FROM,
    to,
    subject,
    html,
    text,
    attachments: [LOGO_ATTACHMENT],
  })
  if (error) {
    throw new AppError(`Não foi possível enviar o e-mail: ${error.message}`, 502)
  }
}

/** Casca comum: cabeçalho com a marca + corpo, tudo com estilo inline (e-mail). */
function layout(bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:${BRAND.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND.navy};padding:20px 32px;text-align:center;">
                <img src="cid:${LOGO_CID}" alt="" width="19" height="28" style="display:inline-block;vertical-align:middle;border:0;" />
                <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.2px;">Kairoon</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:20px 0 0;color:#64748B;font-size:12px;font-weight:600;">Kairoon: Gestão Inteligente Para Empresas</p>
          <p style="margin:4px 0 0;color:#94A3B8;font-size:12px;">
            <a href="https://instagram.com/kairoonbr" style="color:#94A3B8;text-decoration:none;">@kairoonbr</a>
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export async function sendWelcomeEmail(to: string, name: string, establishmentName?: string | null) {
  // No cadastro em etapas o negócio ainda não foi nomeado — evita citar o
  // placeholder ("Meu negócio") e manda uma saudação genérica.
  const htmlAccountLine = establishmentName
    ? `Sua conta da <strong style="color:${BRAND.ink};">${establishmentName}</strong> foi criada com sucesso.`
    : 'Sua conta foi criada com sucesso.'
  const textAccountLine = establishmentName
    ? `Sua conta da ${establishmentName} foi criada com sucesso.`
    : 'Sua conta foi criada com sucesso.'
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${BRAND.navy};">Bem-vindo(a), ${firstName(name)}!</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">
      ${htmlAccountLine}
      Agora é só configurar seus serviços, horários e começar a receber agendamentos.
    </p>
    <div style="text-align:center;">
      <a href="${APP_URL}/login" style="display:inline-block;background:${BRAND.navy};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
        Acessar o painel
      </a>
    </div>
  `)
  await sendEmail({
    to,
    subject: `Bem-vindo(a) ao Kairoon, ${firstName(name)}!`,
    html,
    text: `Bem-vindo(a), ${firstName(name)}! ${textAccountLine} Acesse o painel em ${APP_URL}/login`,
  })
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDatePt(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface PaymentReceiptArgs {
  to: string
  name: string
  planName: string
  billingCycle: 'monthly' | 'yearly'
  amountCents: number
  paidAt: Date | null
  nextChargeDate: Date | null
  invoiceUrl: string | null
}

/** Comprovante enviado quando uma cobrança da assinatura é confirmada. */
export async function sendPaymentReceiptEmail(args: PaymentReceiptArgs) {
  const { to, name, planName, billingCycle, amountCents, paidAt, nextChargeDate, invoiceUrl } = args
  const cycleLabel = billingCycle === 'yearly' ? 'Anual' : 'Mensal'
  const paidLabel = formatDatePt(paidAt ?? new Date())
  const amountLabel = formatBRL(amountCents)

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 0;font-size:14px;color:${BRAND.inkSoft};">${label}</td>
      <td style="padding:8px 0;font-size:14px;font-weight:600;color:${BRAND.ink};text-align:right;">${value}</td>
    </tr>`

  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${BRAND.navy};">Pagamento confirmado</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">
      Olá, ${firstName(name)}. Recebemos o pagamento da sua assinatura do plano
      <strong style="color:${BRAND.ink};">${planName}</strong>. Obrigado por assinar o Kairoon!
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};border:1px solid ${BRAND.line};border-radius:12px;padding:8px 16px;margin-bottom:20px;">
      ${row('Plano', planName)}
      ${row('Cobrança', cycleLabel)}
      ${row('Valor pago', amountLabel)}
      ${row('Data', paidLabel)}
      ${nextChargeDate ? row('Próxima cobrança', formatDatePt(nextChargeDate)) : ''}
    </table>
    ${
      invoiceUrl
        ? `<div style="text-align:center;margin-bottom:20px;">
            <a href="${invoiceUrl}" style="display:inline-block;background:${BRAND.navy};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:8px;">
              Ver comprovante completo
            </a>
          </div>`
        : ''
    }
    <p style="margin:0;font-size:13px;line-height:1.6;color:#94A3B8;">
      Você pode gerenciar ou cancelar sua assinatura a qualquer momento em
      <a href="${APP_URL}/app" style="color:${BRAND.blue};text-decoration:none;font-weight:600;">Configurações &rsaquo; Planos</a>.
    </p>
  `)

  const textLines = [
    `Pagamento confirmado. Olá, ${firstName(name)}.`,
    `Plano: ${planName} (${cycleLabel})`,
    `Valor pago: ${amountLabel}`,
    `Data: ${paidLabel}`,
    nextChargeDate ? `Próxima cobrança: ${formatDatePt(nextChargeDate)}` : '',
    invoiceUrl ? `Comprovante completo: ${invoiceUrl}` : '',
  ].filter(Boolean)

  await sendEmail({
    to,
    subject: `Comprovante de pagamento: plano ${planName}`,
    html,
    text: textLines.join('\n'),
  })
}

export async function sendPasswordResetEmail(to: string, name: string, code: string) {
  // Sem chave: registra o código no log para não travar o dev local.
  if (!resend) {
    console.warn(`[mailer] RESEND_API_KEY ausente — código de redefinição para ${to}: ${code}`)
    return
  }
  const html = layout(`
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:${BRAND.navy};">Redefinição de senha</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${BRAND.inkSoft};">
      Olá, ${firstName(name)}. Use o código abaixo para redefinir sua senha. Ele é válido por
      <strong style="color:${BRAND.ink};">5 minutos</strong>.
    </p>
    <div style="text-align:center;background:${BRAND.bg};border:1px solid ${BRAND.line};border-radius:12px;padding:20px;margin-bottom:20px;">
      <span style="font-size:34px;font-weight:700;letter-spacing:8px;color:${BRAND.navy};">${code}</span>
    </div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#94A3B8;">
      Se você não solicitou esta alteração, ignore este e-mail: sua senha continua a mesma.
    </p>
  `)
  await sendEmail({
    to,
    subject: 'Seu código para redefinir a senha',
    html,
    text: `Seu código para redefinir a senha é ${code}. Válido por 5 minutos. Se você não solicitou, ignore este e-mail.`,
  })
}
