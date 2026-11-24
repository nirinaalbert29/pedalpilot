'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type ChatMessage = { role: 'assistant' | 'user'; content: string };
type ChatReply = { prospectId: string; conversationId: string; reply: string; mode: 'ai' | 'fallback' | 'human' };
type BookingType = 'REPAIR' | 'TEST_RIDE' | 'PURCHASE' | 'FITTING';
type Slot = { startsAt: string; endsAt: string; label: string };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const intro: ChatMessage = { role: 'assistant', content: 'Bonjour ! Je peux vous aider à trouver un vélo adapté à votre pratique. Vous cherchez quel type de vélo ?' };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([intro]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [followUpConsent, setFollowUpConsent] = useState(false);
  const [prospectId, setProspectId] = useState<string>();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);
  const [bookingType, setBookingType] = useState<BookingType>('TEST_RIDE');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingBusy, setBookingBusy] = useState(false);
  const [mode, setMode] = useState<ChatReply['mode']>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  useEffect(() => {
    if (!bookingOpen) return;
    let cancelled = false;
    setLoadingSlots(true);
    fetch(`${API_URL}/appointments/public/slots?type=${bookingType}&days=7`)
      .then(async (response) => {
        const data = await response.json() as { slots?: Slot[]; message?: string };
        if (!response.ok) throw new Error(data.message || 'Impossible de charger les créneaux.');
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Impossible de charger les créneaux.'); })
      .finally(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [bookingOpen, bookingType]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    setMessage(''); setError(''); setSending(true);
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, ...(name.trim() ? { name: name.trim() } : {}), ...(email.trim() ? { email: email.trim() } : {}), emailFollowUpConsent: followUpConsent, ...(prospectId ? { prospectId } : {}) }),
      });
      const data = (await response.json()) as ChatReply | { message?: string };
      if (!response.ok) throw new Error('message' in data && data.message ? data.message : 'Le message n’a pas pu être envoyé.');
      const reply = data as ChatReply;
      setProspectId(reply.prospectId); setMode(reply.mode);
      setMessages((current) => [...current, { role: 'assistant', content: reply.reply }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Connexion impossible. Vérifiez que l’API est démarrée.');
    } finally { setSending(false); }
  }

  async function bookSlot(slot: Slot) {
    if (!prospectId || !email.trim() || bookingBusy) {
      setError('Ajoutez votre adresse e-mail avant de réserver un créneau.');
      return;
    }
    setBookingBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/appointments/public/book`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId, startsAt: slot.startsAt, type: bookingType, email: email.trim() }),
      });
      const data = await response.json() as { message?: string; startsAt?: string; emailSync?: string };
      if (!response.ok) throw new Error(data.message || 'Ce créneau n’a pas pu être réservé.');
      setBookingDone(true); setBookingOpen(false);
      const date = data.startsAt ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(data.startsAt)) : slot.label;
      setMessages((current) => [...current, { role: 'assistant', content: `Votre rendez-vous est confirmé pour le ${date}. ${data.emailSync === 'sent' ? 'Un e-mail récapitulatif vient de vous être envoyé.' : 'La confirmation par e-mail n’a pas pu être envoyée.'}` }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La réservation a échoué.');
    } finally { setBookingBusy(false); }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); }
  }

  return <>
    {open && <section className="chat-panel" aria-label="Conversation avec l’assistant vélo">
      <header className="chat-header"><div className="chat-avatar" aria-hidden="true">P</div><div className="chat-title"><strong>Votre conseiller vélo</strong><span><i /> En ligne · connaît le stock</span></div><button className="chat-close" onClick={() => setOpen(false)} aria-label="Fermer le chat">×</button></header>
      <div className="chat-messages" ref={scrollRef} aria-live="polite"><p className="chat-day">AUJOURD’HUI</p>
        {messages.map((item, index) => <div className={`message-row ${item.role}`} key={`${index}-${item.role}`}>{item.role === 'assistant' && <span className="message-avatar" aria-hidden="true">P</span>}<p className="message-bubble">{item.content}</p></div>)}
        {sending && <div className="message-row assistant"><span className="message-avatar" aria-hidden="true">P</span><p className="message-bubble typing"><i /><i /><i /><span className="sr-only">Réponse en cours</span></p></div>}
        {error && <p className="chat-error" role="alert">{error}</p>}
      </div>
      {!prospectId && <label className="name-field">Votre prénom <span>(facultatif)</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Camille" autoComplete="given-name" /></label>}
      <label className="name-field">Votre e-mail <span>(facultatif)</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="camille@exemple.fr" autoComplete="email" /><small>Associé à votre fiche quand vous envoyez un message.</small></label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '6px 16px 0', fontSize: 9, lineHeight: 1.4, color: '#767e76' }}><input type="checkbox" style={{ marginTop: 1 }} checked={followUpConsent} onChange={(event) => setFollowUpConsent(event.target.checked)} />J’accepte de recevoir par e-mail un suivi de ma demande. Je peux arrêter à tout moment.</label>
      {prospectId && !bookingDone && <button style={{ margin: '7px 14px 0', border: '1px solid #dfe6d7', borderRadius: 8, padding: '8px 10px', background: '#f6f8f2', color: '#304a3e', fontSize: 11, cursor: 'pointer' }} type="button" onClick={() => { setBookingOpen((value) => !value); setError(''); }}>{bookingOpen ? 'Masquer les créneaux' : 'Prendre rendez-vous'}</button>}
      {bookingOpen && <div style={{ margin: '7px 14px 0', padding: 10, borderRadius: 9, background: '#f6f8f2', fontSize: 11 }}><label>Motif<select style={{ display: 'block', width: '100%', marginTop: 5, padding: 7, border: '1px solid #dfe6d7', borderRadius: 6, background: 'white' }} value={bookingType} onChange={(event) => setBookingType(event.target.value as BookingType)}><option value="TEST_RIDE">Essai vélo · 45 min</option><option value="PURCHASE">Conseil achat · 30 min</option><option value="REPAIR">Atelier · 1 h</option><option value="FITTING">Étude posturale · 1 h</option></select></label>{loadingSlots ? <small>Recherche des disponibilités…</small> : slots.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 112, overflow: 'auto', marginTop: 8 }}>{slots.map((slot) => <button style={{ border: '1px solid #dfe6d7', borderRadius: 6, background: 'white', padding: '6px 7px', fontSize: 10, cursor: 'pointer' }} key={slot.startsAt} type="button" disabled={bookingBusy || !email.trim()} onClick={() => void bookSlot(slot)}>{slot.label}</button>)}</div> : <small>Aucun créneau libre cette semaine. Essayez une autre date plus tard.</small>}{!email.trim() && <small style={{ display: 'block', marginTop: 6 }}>Renseignez votre e-mail pour recevoir la confirmation.</small>}</div>}
      <form className="chat-form" onSubmit={(event) => void sendMessage(event)}><input ref={inputRef} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="Écrivez votre message…" maxLength={2000} aria-label="Votre message" /><button type="submit" disabled={sending || !message.trim()} aria-label="Envoyer le message">↑</button></form>
      <div className="chat-foot"><span>Propulsé par PedalPilot</span>{mode && <span className="mode-status">{mode === 'ai' ? 'Assistant IA' : mode === 'human' ? 'Conseiller' : 'Mode secours'}</span>}</div>
    </section>}
    <button className={`chat-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Fermer le conseiller vélo' : 'Ouvrir le conseiller vélo'}>
      {open ? <span aria-hidden="true">×</span> : <><span className="launcher-icon" aria-hidden="true">✳</span><span className="launcher-label">Parler vélo</span><span className="launcher-ping" /></>}
    </button>
  </>;
}
