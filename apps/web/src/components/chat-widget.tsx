'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type ChatMessage = { role: 'assistant' | 'user'; content: string };
type ChatReply = { prospectId: string; conversationId: string; reply: string; mode: 'ai' | 'fallback' | 'human' };
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const intro: ChatMessage = { role: 'assistant', content: 'Bonjour ! Je peux vous aider à trouver un vélo adapté à votre pratique. Vous cherchez quel type de vélo ?' };

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([intro]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [prospectId, setProspectId] = useState<string>();
  const [mode, setMode] = useState<ChatReply['mode']>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, sending, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setMessages((current) => [...current, { role: 'user', content: trimmed }]);
    setMessage(''); setError(''); setSending(true);
    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, ...(name.trim() ? { name: name.trim() } : {}), ...(prospectId ? { prospectId } : {}) }),
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
      <form className="chat-form" onSubmit={(event) => void sendMessage(event)}><input ref={inputRef} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={handleInputKeyDown} placeholder="Écrivez votre message…" maxLength={2000} aria-label="Votre message" /><button type="submit" disabled={sending || !message.trim()} aria-label="Envoyer le message">↑</button></form>
      <div className="chat-foot"><span>Propulsé par PedalPilot</span>{mode && <span className="mode-status">{mode === 'ai' ? 'Assistant IA' : mode === 'human' ? 'Conseiller' : 'Mode secours'}</span>}</div>
    </section>}
    <button className={`chat-launcher ${open ? 'is-open' : ''}`} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? 'Fermer le conseiller vélo' : 'Ouvrir le conseiller vélo'}>
      {open ? <span aria-hidden="true">×</span> : <><span className="launcher-icon" aria-hidden="true">✳</span><span className="launcher-label">Parler vélo</span><span className="launcher-ping" /></>}
    </button>
  </>;
}
