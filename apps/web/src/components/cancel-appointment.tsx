'use client';

import { useState } from 'react';
import styles from './cancel-appointment.module.css';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CancelAppointment({ token }: { token: string }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'cancelled' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function cancel() {
    if (!token || status === 'loading') return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch(`${API_URL}/appointments/public/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => ({})) as { status?: string; calendarCancelSync?: string; message?: string | string[] };
      if (!response.ok) {
        const detail = Array.isArray(result.message) ? result.message.join(' ') : result.message;
        throw new Error(detail || 'Ce lien est invalide ou le rendez-vous ne peut plus être annulé.');
      }
      setStatus('cancelled');
      setMessage(result.calendarCancelSync === 'failed'
        ? 'Le rendez-vous est annulé, mais sa suppression dans Google Calendar a échoué. Contactez la boutique.'
        : result.calendarCancelSync === 'not_configured'
          ? 'Le rendez-vous est annulé, mais Google Calendar n’est pas configuré. Vérifiez l’agenda auprès de la boutique.'
        : result.calendarCancelSync === 'deleted'
          ? 'Le rendez-vous et son événement Google Calendar ont été annulés.'
          : 'Le rendez-vous a été annulé.');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Impossible d’annuler ce rendez-vous.');
    }
  }

  return <main className={styles.page}>
    <section className={styles.card}>
      <a href="/" className={styles.brand}><span>P</span> pedalpilot<span className={styles.dot}>.</span></a>
      <p className={styles.eyebrow}>GESTION DU RENDEZ-VOUS</p>
      <h1>{status === 'cancelled' ? 'Rendez-vous annulé' : 'Annuler ce rendez-vous ?'}</h1>
      {status === 'idle' && <>
        <p>Confirmez l’annulation. Si ce rendez-vous a été ajouté à Google Calendar, son événement sera également supprimé et tout article réservé sera remis en stock.</p>
        {!token && <p className={styles.error} role="alert">Le lien ne contient pas de jeton d’annulation valide.</p>}
        <button type="button" onClick={() => void cancel()} disabled={!token}>Confirmer l’annulation</button>
      </>}
      {status === 'loading' && <p>Annulation en cours…</p>}
      {(status === 'cancelled' || status === 'error') && <p className={status === 'error' ? styles.error : styles.result} role="status">{message}</p>}
    </section>
  </main>;
}
