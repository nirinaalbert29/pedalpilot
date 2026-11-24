import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type MailResult = 'sent' | 'not_configured';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

const appointmentLabels: Record<string, string> = {
  TEST_RIDE: 'Essai vélo',
  PURCHASE: 'Conseil achat',
  REPAIR: 'Atelier',
  FITTING: 'Étude posturale',
};

@Injectable()
export class N8nMailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.config.get('N8N_WEBHOOK_URL') &&
      this.config.get('N8N_WEBHOOK_SECRET'),
    );
  }

  async sendAppointmentSummary(input: {
    to: string;
    firstName: string;
    type: string;
    startsAt: Date;
    cancelToken: string;
  }): Promise<MailResult> {
    const webhookUrl = this.config.get<string>('N8N_WEBHOOK_URL')?.trim();
    const webhookSecret = this.config.get<string>('N8N_WEBHOOK_SECRET')?.trim();
    if (!webhookUrl || !webhookSecret) return 'not_configured';

    const url = new URL(webhookUrl);
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) {
      throw new Error('Le webhook n8n doit utiliser HTTPS.');
    }

    const timeZone = this.config.get<string>('BUSINESS_TIME_ZONE') || 'Europe/Paris';
    const dateLabel = new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(input.startsAt);
    const typeLabel = appointmentLabels[input.type] || 'Rendez-vous';
    const origin = ((this.config.get<string>('WEB_ORIGIN') || 'http://localhost:3000').split(',')[0] || 'http://localhost:3000').trim().replace(/\/+$/, '');
    const cancellationUrl = `${origin}/?cancelAppointment=${encodeURIComponent(input.cancelToken)}`;
    const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f8f3;font-family:Arial,sans-serif;color:#1f3027"><main style="max-width:560px;margin:32px auto;padding:28px;background:#fff;border:1px solid #e5eadf;border-radius:14px"><p style="color:#7a973d;font-size:12px;font-weight:bold;letter-spacing:1px">PEDALPILOT</p><h1 style="font-size:24px">Bonjour ${escapeHtml(input.firstName)},</h1><p>Votre rendez-vous est enregistré :</p><p style="padding:16px;background:#f3f6ed;border-radius:10px"><strong>${escapeHtml(typeLabel)}</strong><br>${escapeHtml(dateLabel)}</p><p>Pour annuler ce rendez-vous, utilisez le bouton ci-dessous.</p><p><a href="${escapeHtml(cancellationUrl)}" style="display:inline-block;padding:12px 18px;background:#294335;color:#fff;text-decoration:none;border-radius:8px">Annuler le rendez-vous</a></p><p style="color:#89938a;font-size:12px">Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail.</p></main></body></html>`;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${webhookSecret}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        event: 'appointment.confirmation',
        to: input.to,
        subject: `Votre rendez-vous PedalPilot — ${typeLabel}`,
        html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Webhook n8n en erreur (HTTP ${response.status}).`);
    }
    return 'sent';
  }
}
