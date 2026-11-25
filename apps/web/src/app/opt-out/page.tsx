'use client';

import { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function OptOutPage() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'ready' | 'saving' | 'done' | 'error'>('ready');

  useEffect(() => { setToken(new URLSearchParams(window.location.search).get('token') ?? ''); }, []);

  async function unsubscribe() {
    setStatus('saving');
    try {
      const response = await fetch(`${API_URL}/followups/unsubscribe`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      });
      if (!response.ok) throw new Error('invalid token');
      setStatus('done');
    } catch { setStatus('error'); }
  }

  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f6f1', color: '#1c2821', fontFamily: 'Arial, sans-serif' }}>
    <section style={{ width: 'min(480px,100%)', padding: 32, border: '1px solid #e4e8df', borderRadius: 16, background: 'white', boxShadow: '0 16px 50px #20342612' }}>
      <p style={{ color: '#819d38', fontSize: 12, letterSpacing: 2 }}>PEDALPILOT</p>
      <h1 style={{ fontSize: 26 }}>Préférences de suivi</h1>
      {status === 'done' ? <p>Votre consentement aux relances par e-mail et WhatsApp a été retiré. Vous ne recevrez plus de suivi automatique.</p> : <><p>Confirmez-vous l’arrêt des relances PedalPilot par e-mail et WhatsApp liées à votre demande ? Les messages nécessaires à un rendez-vous déjà réservé peuvent encore être envoyés.</p><button disabled={!token || status === 'saving'} onClick={() => void unsubscribe()} style={{ border: 0, borderRadius: 8, padding: '12px 18px', background: '#304a3e', color: 'white', cursor: 'pointer' }}>{status === 'saving' ? 'Enregistrement…' : 'Arrêter les relances'}</button>{status === 'error' && <p role="alert" style={{ color: '#b34f40' }}>Le lien est invalide ou expiré. Contactez la boutique pour modifier vos préférences.</p>}{!token && <p role="alert">Lien incomplet.</p>}</>}
    </section>
  </main>;
}
