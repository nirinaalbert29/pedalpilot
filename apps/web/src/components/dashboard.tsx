'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';

type Temperature = 'HOT' | 'WARM' | 'COLD' | null;
type ProspectStatus = 'NEW' | 'QUALIFIED' | 'APPOINTMENT_BOOKED' | 'FOLLOWING_UP' | 'WON' | 'LOST';
type AgentEvent = { id: string; type: string; agent: string; prospectId: string | null; payload: Record<string, unknown>; createdAt: string; persisted?: boolean };
type Appointment = { id: string; type: 'REPAIR' | 'TEST_RIDE' | 'PURCHASE' | 'FITTING'; status: string; startsAt: string; endsAt: string; notes: string | null; productId?: string | null; product?: { id: string; name: string } | null; googleEventId?: string | null; calendarSync?: { status: 'synced' | 'not_configured' | 'failed'; message?: string }; calendarCancelSync?: 'deleted' | 'not_configured' | 'not_synced' | 'failed'; emailSync?: 'sent' | 'not_configured' | 'no_email' | 'failed'; stockReservation?: 'reserved' | 'not_requested' };
type InventoryProduct = { id: string; sku: string; name: string; category: string; priceCents: number; stock: number; reorderLevel: number };
type FollowUp = { id: string; prospectId: string; channel: string; content: string; status: string; attempt: number; scheduledFor: string; sentAt: string | null; error: string | null; prospect: { name: string; email: string | null; phone: string | null } };
type Message = { id: string; role: 'PROSPECT' | 'AGENT' | 'HUMAN' | 'SYSTEM'; content: string; createdAt: string };
type Prospect = {
  id: string; name: string; email: string | null; phone?: string | null; source: string; status: ProspectStatus; score: number | null;
  temperature: Temperature; need: string | null; budgetEur: number | null; urgency: string | null;
  humanTakeover: boolean; lastActivityAt: string; createdAt: string;
  conversations: { id: string; messages: Pick<Message, 'content' | 'role' | 'createdAt'>[] }[];
};
type ProspectDetail = Omit<Prospect, 'conversations'> & { conversations: { id: string; messages: Message[] }[]; events?: AgentEvent[]; reason?: string | null };
type Summary = { prospects: number; hotProspects: number; newThisWeek: number; qualified: number; lowStock: number; recentEvents: AgentEvent[] };
type Filter = 'ALL' | 'NEW' | 'QUALIFIED' | 'HOT';
type StockFilter = 'ALL' | 'LOW' | 'AVAILABLE';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const initialSummary: Summary = { prospects: 0, hotProspects: 0, newThisWeek: 0, qualified: 0, lowStock: 0, recentEvents: [] };

async function authorizedFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error('Jeton incorrect ou absent. Vérifiez DASHBOARD_API_TOKEN dans apps/api/.env.');
    let apiMessage = '';
    try {
      const body = (await response.json()) as { message?: string | string[] };
      apiMessage = Array.isArray(body.message) ? body.message.join(' ') : body.message ?? '';
    } catch { /* Certaines réponses d’erreur ne contiennent pas de JSON. */ }
    throw new Error(apiMessage || `L’API a répondu avec le statut ${response.status}.`);
  }
  return (await response.json()) as T;
}

function formatDate(value: string, withTime = true) {
  return new Intl.DateTimeFormat('fr-FR', withTime
    ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

function statusLabel(status: ProspectStatus) {
  return ({ NEW: 'Nouveau', QUALIFIED: 'Qualifié', APPOINTMENT_BOOKED: 'Rendez-vous', FOLLOWING_UP: 'À relancer', WON: 'Gagné', LOST: 'Perdu' })[status];
}

function temperatureLabel(temperature: Temperature) {
  return temperature === 'HOT' ? 'Chaud' : temperature === 'WARM' ? 'Tiède' : temperature === 'COLD' ? 'Froid' : 'En attente';
}

function eventTitle(event: AgentEvent) {
  const labels: Record<string, string> = {
    'prospect.created': 'Nouveau prospect', 'prospect.qualified': 'Prospect qualifié',
    'conversation.message': 'Message reçu', 'conversation.human_takeover': 'Reprise par un conseiller',
    'conversation.human_released': 'Assistant réactivé', 'appointment.booked': 'Rendez-vous réservé',
    'appointment.cancelled': 'Rendez-vous annulé', 'stock.low': 'Stock bas',
    'appointment.proposed': 'Créneau proposé', 'appointment.completed': 'Rendez-vous terminé',
    'stock.unavailable': 'Produit indisponible', 'stock.reserved': 'Vélo réservé',
    'followup.sent': 'Relance envoyée', 'followup.cancelled': 'Relance annulée',
    'followup.scheduled': 'Relance programmée', 'followup.failed': 'Échec de relance', 'stock.moved': 'Mouvement de stock',
  };
  return labels[event.type] ?? event.type.replaceAll('.', ' ');
}

export function Dashboard() {
  const [tokenInput, setTokenInput] = useState('');
  const [token, setToken] = useState('');
  const [summary, setSummary] = useState(initialSummary);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<ProspectDetail | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [stockQuantities, setStockQuantities] = useState<Record<string, number>>({});
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('ALL');
  const [appointmentAt, setAppointmentAt] = useState('');
  const [appointmentType, setAppointmentType] = useState<Appointment['type']>('TEST_RIDE');
  const [appointmentProductId, setAppointmentProductId] = useState('');
  const [appointmentNotes, setAppointmentNotes] = useState('');
  const [savingAppointment, setSavingAppointment] = useState(false);
  const [appointmentFeedback, setAppointmentFeedback] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const lowStockCount = useMemo(() => products.filter((product) => product.stock <= product.reorderLevel).length, [products]);
  const visibleProducts = useMemo(() => {
    const query = stockSearch.trim().toLocaleLowerCase('fr-FR');
    return products
      .filter((product) => {
        const isLow = product.stock <= product.reorderLevel;
        const matchesFilter = stockFilter === 'ALL' || (stockFilter === 'LOW' ? isLow : product.stock > 0);
        const searchable = (product.name + ' ' + product.sku + ' ' + product.category).toLocaleLowerCase('fr-FR');
        return matchesFilter && (!query || searchable.includes(query));
      })
      .sort((left, right) => {
        const urgency = Number(right.stock <= right.reorderLevel) - Number(left.stock <= left.reorderLevel);
        return urgency || left.name.localeCompare(right.name, 'fr-FR');
      });
  }, [products, stockFilter, stockSearch]);

  const signIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = tokenInput.trim();
    if (!value) return;
    setError('');
    setToken(value);
  };

  const refresh = useCallback(async (secret: string, query = search, activeFilter = filter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (activeFilter === 'HOT') params.set('temperature', 'HOT');
      else if (activeFilter !== 'ALL') params.set('status', activeFilter);
      const [nextSummary, nextProspects, nextProducts] = await Promise.all([
        authorizedFetch<Summary>('/dashboard/summary', secret),
        authorizedFetch<Prospect[]>(`/dashboard/prospects${params.size ? `?${params.toString()}` : ''}`, secret),
        authorizedFetch<InventoryProduct[]>('/dashboard/products', secret),
      ]);
      setSummary(nextSummary);
      setProspects(nextProspects);
      setProducts(nextProducts);
      setError('');
      if (selectedId && !nextProspects.some((prospect) => prospect.id === selectedId)) setSelectedId('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les données du tableau de bord.');
      if (caught instanceof Error && caught.message.startsWith('Jeton incorrect')) setToken('');
    } finally {
      setLoading(false);
    }
  }, [filter, search, selectedId]);

  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const controller = new AbortController();

    async function listenToEvents() {
      while (!controller.signal.aborted) {
        try {
          const response = await fetch(`${API_URL}/events/stream`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: controller.signal,
          });
          if (response.status === 401) throw new Error('Jeton incorrect ou absent. Vérifiez DASHBOARD_API_TOKEN dans apps/api/.env.');
          if (!response.ok || !response.body) throw new Error('Connexion au flux événements impossible.');
          setLive(true);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split(/\r?\n\r?\n/);
            buffer = blocks.pop() ?? '';
            for (const block of blocks) {
              const lines = block.split(/\r?\n/);
              if (!lines.some((line) => line === 'event: agent-event')) continue;
              const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
              if (!data) continue;
              try {
                const nextEvent = JSON.parse(data) as AgentEvent;
                setSummary((current) => ({ ...current, recentEvents: [nextEvent, ...current.recentEvents.filter((item) => item.id !== nextEvent.id)].slice(0, 10) }));
                void refresh(token);
                if (selectedId) {
                  void authorizedFetch<ProspectDetail>(`/dashboard/prospects/${selectedId}`, token)
                    .then(setDetail)
                    .catch(() => undefined);
                }
              } catch { /* Un événement mal formé ne coupe pas le flux. */ }
            }
          }
          setLive(false);
        } catch (caught) {
          setLive(false);
          if (controller.signal.aborted) return;
          if (caught instanceof Error && caught.message.startsWith('Jeton incorrect')) {
            setError(caught.message);
            setToken('');
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1800));
        }
      }
    }

    void listenToEvents();
    return () => { controller.abort(); setLive(false); };
  }, [token, refresh]);

  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => { void refresh(token, search, filter); }, 250);
    return () => clearTimeout(timer);
  }, [token, search, filter, refresh]);

  useEffect(() => {
    if (!token || !selectedId) { setDetail(null); return; }
    let ignore = false;
    void authorizedFetch<ProspectDetail>(`/dashboard/prospects/${selectedId}`, token)
      .then((value) => { if (!ignore) setDetail(value); })
      .catch((caught: unknown) => { if (!ignore) setError(caught instanceof Error ? caught.message : 'Chargement de la conversation impossible.'); });
    void authorizedFetch<Appointment[]>(`/appointments?prospectId=${encodeURIComponent(selectedId)}`, token)
      .then((value) => { if (!ignore) setAppointments(value); })
      .catch((caught: unknown) => { if (!ignore) setAppointmentFeedback(caught instanceof Error ? caught.message : 'Chargement des rendez-vous impossible.'); });
    void authorizedFetch<FollowUp[]>(`/dashboard/followups?prospectId=${encodeURIComponent(selectedId)}`, token)
      .then((value) => { if (!ignore) setFollowups(value); })
      .catch(() => undefined);
    return () => { ignore = true; };
  }, [token, selectedId]);

  async function proposeAppointment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !appointmentAt || savingAppointment) return;
    const startsAt = new Date(appointmentAt);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      setAppointmentFeedback('Choisissez une date et une heure futures.');
      return;
    }
    setSavingAppointment(true);
    setAppointmentFeedback('');
    try {
      const appointment = await authorizedFetch<Appointment>(`/appointments`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: detail.id, startsAt: startsAt.toISOString(), type: appointmentType, notes: appointmentNotes, ...(appointmentProductId ? { productId: appointmentProductId } : {}) }),
      });
      const selectedProduct = products.find((product) => product.id === appointmentProductId);
      setAppointments((current) => [...current, { ...appointment, product: selectedProduct ? { id: selectedProduct.id, name: selectedProduct.name } : null }].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
      if (appointmentProductId) setProducts((current) => current.map((product) => product.id === appointmentProductId ? { ...product, stock: Math.max(0, product.stock - 1) } : product));
      const calendarMessage = appointment.calendarSync?.status === 'synced'
        ? 'Synchronisé avec Google Calendar.'
        : appointment.calendarSync?.status === 'failed'
          ? 'Échec de synchronisation Google Calendar.'
          : 'Enregistré localement (Google Calendar non configuré).';
      const stockMessage = appointmentProductId ? ' Article réservé.' : '';
      const emailMessage = appointment.emailSync === 'sent'
        ? ' E-mail récapitulatif envoyé.'
        : appointment.emailSync === 'no_email'
          ? ' Aucun e-mail envoyé : adresse du prospect absente.'
          : appointment.emailSync === 'failed'
            ? ' Échec de l’envoi e-mail.'
            : ' E-mail non configuré.';
      setAppointmentFeedback(`${calendarMessage}${stockMessage}${emailMessage}`);
      setAppointmentAt('');
      setAppointmentNotes('');
      setAppointmentProductId('');
      void refresh(token);
    } catch (caught) {
      setAppointmentFeedback(caught instanceof Error ? caught.message : 'Impossible d’enregistrer ce créneau.');
    } finally {
      setSavingAppointment(false);
    }
  }

  async function changeAppointmentStatus(id: string, action: 'cancel' | 'complete') {
    try {
      const currentAppointment = appointments.find((item) => item.id === id);
      const updated = await authorizedFetch<Appointment>(`/appointments/${encodeURIComponent(id)}/${action}`, token, { method: 'POST' });
      setAppointments((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item));
      setAppointmentFeedback(action === 'cancel'
        ? `Rendez-vous annulé ; stock libéré.${currentAppointment?.googleEventId && updated.calendarCancelSync === 'deleted' ? ' Événement Google supprimé.' : currentAppointment?.googleEventId && updated.calendarCancelSync === 'failed' ? ' Échec de suppression de l’événement Google.' : currentAppointment?.googleEventId && updated.calendarCancelSync === 'not_configured' ? ' Google Calendar n’est pas configuré : supprimez aussi l’événement dans Google Calendar.' : ''}`
        : 'Rendez-vous terminé ; la réservation a été consommée.');
      void refresh(token);
    } catch (caught) {
      setAppointmentFeedback(caught instanceof Error ? caught.message : 'Mise à jour du rendez-vous impossible.');
    }
  }

  async function syncAppointment(id: string) {
    setAppointmentFeedback('');
    try {
      const result = await authorizedFetch<{ status: 'synced' | 'not_configured'; appointment: Appointment | null }>(
        `/appointments/${encodeURIComponent(id)}/sync`, token, { method: 'POST' },
      );
      if (result.status === 'not_configured' || !result.appointment) {
        setAppointmentFeedback('Google Calendar n’est pas encore configuré dans apps/api/.env.');
        return;
      }
      setAppointments((current) => current.map((item) => item.id === id ? result.appointment! : item));
      setAppointmentFeedback('Créneau synchronisé avec Google Calendar. Aucun invité ni notification n’a été envoyé.');
    } catch (caught) {
      setAppointmentFeedback(caught instanceof Error ? caught.message : 'Synchronisation Google Calendar impossible.');
    }
  }

  async function recordStockMovement(product: InventoryProduct, reason: 'RESTOCK' | 'SALE') {
    const quantity = stockQuantities[product.id] ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) { setError('Indiquez une quantité entière supérieure à zéro.'); return; }
    try {
      const updated = await authorizedFetch<InventoryProduct>(`/dashboard/products/${encodeURIComponent(product.id)}/movements`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, quantity }),
      });
      setProducts((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setError('');
      void refresh(token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Mouvement de stock impossible.'); }
  }

  async function adjustStockCount(product: InventoryProduct) {
    const counted = stockQuantities[product.id] ?? 1;
    if (!Number.isInteger(counted) || counted < 0) { setError('Indiquez un stock compté égal ou supérieur à zéro.'); return; }
    const delta = counted - product.stock;
    if (!delta) { setError('Le stock compté correspond déjà à la quantité enregistrée.'); return; }
    try {
      const updated = await authorizedFetch<InventoryProduct>(`/dashboard/products/${encodeURIComponent(product.id)}/movements`, token, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'ADJUSTMENT', delta }),
      });
      setProducts((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
      setError(''); void refresh(token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Ajustement de stock impossible.'); }
  }

  async function setTakeover(enabled: boolean) {
    if (!detail) return;
    try {
      await authorizedFetch(`/dashboard/prospects/${encodeURIComponent(detail.id)}/${enabled ? 'takeover' : 'release'}`, token, { method: 'POST' });
      setDetail((current) => current ? { ...current, humanTakeover: enabled } : current);
      await authorizedFetch<FollowUp[]>(`/dashboard/followups?prospectId=${encodeURIComponent(detail.id)}`, token).then(setFollowups);
      void refresh(token);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Mise à jour du suivi humain impossible.'); }
  }

  async function retryFollowup(id: string) {
    try {
      await authorizedFetch(`/dashboard/followups/${encodeURIComponent(id)}/retry`, token, { method: 'POST' });
      const updated = await authorizedFetch<FollowUp[]>(`/dashboard/followups?prospectId=${encodeURIComponent(selectedId)}`, token);
      setFollowups(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Nouvelle tentative impossible.'); }
  }

  const hotShare = useMemo(() => summary.prospects ? Math.round((summary.hotProspects / summary.prospects) * 100) : 0, [summary.hotProspects, summary.prospects]);

  if (!token) return <main className={styles.loginPage}>
    <div className={styles.loginCard}>
      <a className={styles.brand} href="/" aria-label="Retour à la landing"><span className={styles.brandMark}>P</span><span>pedalpilot<span className={styles.brandDot}>.</span></span></a>
      <div className={styles.loginIcon}>↗</div>
      <p className={styles.overline}>ESPACE ÉQUIPE</p>
      <h1>Le cockpit de votre boutique.</h1>
      <p className={styles.loginCopy}>Suivez les échanges, les nouveaux prospects et l’activité de vos agents en temps réel.</p>
      <form onSubmit={signIn} className={styles.loginForm}>
        <label htmlFor="dashboard-token">Jeton d’accès du tableau de bord</label>
        <input id="dashboard-token" type="password" autoComplete="off" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} placeholder="Collez DASHBOARD_API_TOKEN" required />
        {error && <p className={styles.errorBox} role="alert">{error}</p>}
        <button type="submit">Ouvrir le tableau de bord <span>→</span></button>
      </form>
      <p className={styles.loginHint}>Le jeton est gardé uniquement en mémoire le temps de cette session.</p>
    </div>
    <span className={styles.loginFoot}>PEDALPILOT · SUPERVISION</span>
  </main>;

  return <main className={styles.dashboardPage}>
    <aside className={styles.sidebar}>
      <a className={styles.brand} href="/" aria-label="PedalPilot, accueil"><span className={styles.brandMark}>P</span><span>pedalpilot<span className={styles.brandDot}>.</span></span></a>
      <p className={styles.sideLabel}>ESPACE BOUTIQUE</p>
      <a className={`${styles.navItem} ${styles.navActive}`} href="#prospects"><span>◫</span>Vue d’ensemble</a>
      <a className={styles.navItem} href="#prospects"><span>◎</span>Prospects <b>{summary.prospects}</b></a>
      <div className={styles.sideCard}><span className={styles.sideCardIcon}>✳</span><strong>PedalPilot IA</strong><span className={styles.agentOnline}><i /> Agents opérationnels</span><small>Qualification · Stock</small></div>
      <div className={styles.sidebarBottom}><div className={styles.accountAvatar}>PP</div><div><strong>Équipe boutique</strong><small>Supervision</small></div><button onClick={() => { setToken(''); setTokenInput(''); setSelectedId(''); }} aria-label="Verrouiller le tableau">↪</button></div>
    </aside>

    <section className={styles.workspace}>
      <header className={styles.topbar}>
        <div><span className={styles.breadcrumb}>Espace boutique</span><span className={styles.breadcrumbSlash}>/</span><strong>Vue d’ensemble</strong></div>
        <div className={styles.topActions}><span className={`${styles.liveBadge} ${live ? styles.liveOn : ''}`}><i />{live ? 'En direct' : 'Reconnexion…'}</span><button className={styles.refreshButton} onClick={() => void refresh(token)} disabled={loading}><span className={loading ? styles.spinning : ''}>↻</span> Actualiser</button><button className={styles.mobileLock} onClick={() => setToken('')} aria-label="Verrouiller le tableau">↪</button></div>
      </header>

      <div className={styles.content}>
        <div className={styles.welcomeRow}><div><p className={styles.overline}>VUE HEBDOMADAIRE</p><h1>Bonjour, l’équipe <span>👋</span></h1><p className={styles.subheading}>Voici ce qui se passe dans votre boutique aujourd’hui.</p></div><div className={styles.dateChip}><span>◷</span> Activité des 7 derniers jours</div></div>

        <div className={styles.metrics}>
          <article className={styles.metricCard}><div className={styles.metricTop}><span>Prospects suivis</span><span className={styles.metricIcon}>◎</span></div><strong>{summary.prospects}</strong><small><i className={styles.positive}>↗</i> {summary.newThisWeek} nouveau{summary.newThisWeek === 1 ? '' : 'x'} cette semaine</small></article>
          <article className={styles.metricCard}><div className={styles.metricTop}><span>À fort potentiel</span><span className={`${styles.metricIcon} ${styles.warmIcon}`}>✳</span></div><strong>{summary.hotProspects}</strong><small>{hotShare}% des prospects sont chauds</small></article>
          <article className={styles.metricCard}><div className={styles.metricTop}><span>Qualifiés par l’agent</span><span className={`${styles.metricIcon} ${styles.greenIcon}`}>✓</span></div><strong>{summary.qualified}</strong><small>Besoin et budget identifiés</small></article>
          <article className={styles.metricCard}><div className={styles.metricTop}><span>Alertes stock</span><span className={`${styles.metricIcon} ${styles.stockIcon}`}>▤</span></div><strong>{summary.lowStock}</strong><small>{summary.lowStock ? 'Produits au seuil de réapprovisionnement' : 'Aucun produit sous le seuil'}</small></article>
        </div>

        {error && <div className={styles.errorBanner} role="alert"><span>!</span>{error}<button onClick={() => setError('')} aria-label="Fermer">×</button></div>}

        <section className={[styles.prospectPanel, styles.stockPanel].join(' ')} aria-label="Gestion du stock">
          <div className={styles.panelHeading}><div><h2>Stock boutique</h2><p>Réapprovisionnements et ventes mis à jour dans l’historique</p></div><span className={styles.resultsCount}>{visibleProducts.length} / {products.length} articles</span></div>
          <div className={styles.stockTools}>
            <label className={[styles.searchBox, styles.stockSearch].join(' ')}><span aria-hidden="true">⌕</span><input value={stockSearch} onChange={(event) => setStockSearch(event.target.value)} placeholder="Rechercher un produit ou une référence…" aria-label="Rechercher dans le stock" /></label>
            <div className={styles.stockFilters} aria-label="Filtrer les produits">
              {([['ALL', 'Tous', products.length], ['LOW', 'Stock bas', lowStockCount], ['AVAILABLE', 'Disponibles', products.filter((product) => product.stock > 0).length]] as [StockFilter, string, number][]).map(([value, label, count]) => <button key={value} type="button" aria-pressed={stockFilter === value} className={[styles.stockFilter, stockFilter === value ? styles.stockFilterActive : ''].filter(Boolean).join(' ')} onClick={() => setStockFilter(value)}>{label}<span>{count}</span></button>)}
            </div>
          </div>
          <div className={styles.stockGrid}>
            {visibleProducts.map((product) => {
              const isLow = product.stock <= product.reorderLevel;
              return <article key={product.id} className={styles.stockCard}>
                <div className={styles.stockCardHeading}>
                  <div className={styles.stockProductInfo}><strong title={product.name}>{product.name}</strong><small>{product.sku} · {product.category}</small></div>
                  <div className={[styles.stockOnHand, isLow ? styles.stockOnHandLow : ''].filter(Boolean).join(' ')}><strong>{product.stock}</strong><span>en stock</span></div>
                </div>
                <div className={styles.stockCardMeta}><span className={[styles.stockStatus, isLow ? styles.stockStatusLow : styles.stockStatusAvailable].join(' ')}>{isLow ? 'À réapprovisionner' : 'Disponible'}</span><span className={styles.stockThreshold}>Seuil · {product.reorderLevel}</span></div>
                <div className={styles.stockActions}>
                  <label className={styles.stockQuantity}><span>Qté / comptage</span><input aria-label={'Quantité ou stock compté pour ' + product.name} type="number" min={0} max={1000} step={1} value={stockQuantities[product.id] ?? 1} onChange={(event) => setStockQuantities((current) => ({ ...current, [product.id]: Number(event.target.value) }))} /></label>
                  <button type="button" className={[styles.stockAction, styles.stockRestock].join(' ')} disabled={(stockQuantities[product.id] ?? 1) < 1} onClick={() => void recordStockMovement(product, 'RESTOCK')}>Réapprovisionner</button>
                  <button type="button" className={styles.stockAction} disabled={(stockQuantities[product.id] ?? 1) < 1 || product.stock < (stockQuantities[product.id] ?? 1)} onClick={() => void recordStockMovement(product, 'SALE')}>Enregistrer une vente</button>
                  <button type="button" className={styles.stockAction} title="La quantité saisie devient le stock réellement compté" onClick={() => void adjustStockCount(product)}>Ajuster le comptage</button>
                </div>
              </article>;
            })}
            {!visibleProducts.length && <div className={styles.stockEmpty}><strong>Aucun produit trouvé</strong><span>Modifiez la recherche ou le filtre sélectionné.</span></div>}
          </div>
        </section>
        <div className={styles.mainGrid}>
          <section className={styles.prospectPanel} id="prospects">
            <div className={styles.panelHeading}><div><h2>Prospects</h2><p>Les contacts récemment actifs</p></div><span className={styles.resultsCount}>{prospects.length} résultat{prospects.length === 1 ? '' : 's'}</span></div>
            <div className={styles.listTools}>
              <label className={styles.searchBox}><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom, un besoin…" /></label>
              <div className={styles.filters} aria-label="Filtrer les prospects">
                {([['ALL', 'Tous'], ['NEW', 'Nouveaux'], ['QUALIFIED', 'Qualifiés'], ['HOT', 'Chauds']] as [Filter, string][]).map(([value, label]) => <button key={value} className={filter === value ? styles.filterSelected : ''} onClick={() => setFilter(value)}>{label}</button>)}
              </div>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}><thead><tr><th>PROSPECT</th><th>BESOIN</th><th>QUALIFICATION</th><th>DERNIÈRE ACTIVITÉ</th><th /></tr></thead>
                <tbody>{prospects.map((prospect) => {
                  const preview = prospect.conversations[0]?.messages[0]?.content;
                  return <tr key={prospect.id} onClick={() => setSelectedId(prospect.id)} className={selectedId === prospect.id ? styles.selectedRow : ''} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') setSelectedId(prospect.id); }}>
                    <td><div className={styles.personCell}><span className={styles.personAvatar}>{prospect.name.trim().slice(0, 1).toUpperCase() || '?'}</span><span><strong>{prospect.name}</strong><small>{prospect.email || prospect.source.replaceAll('_', ' ')}</small></span></div></td>
                    <td><span className={styles.needText}>{prospect.need || preview || 'En cours de découverte'}</span>{prospect.budgetEur !== null && <small className={styles.budget}>Budget · {prospect.budgetEur.toLocaleString('fr-FR')} €</small>}</td>
                    <td><span className={`${styles.temperature} ${prospect.temperature === 'HOT' ? styles.hot : prospect.temperature === 'WARM' ? styles.warm : prospect.temperature === 'COLD' ? styles.cold : ''}`}><i />{temperatureLabel(prospect.temperature)}</span><small className={styles.statusText}>{prospect.score === null ? statusLabel(prospect.status) : `Score ${prospect.score}/100`}</small></td>
                    <td className={styles.dateCell}>{formatDate(prospect.lastActivityAt)}</td><td className={styles.rowArrow}>↗</td>
                  </tr>;
                })}</tbody>
              </table>
              {!prospects.length && <div className={styles.emptyState}><span>◎</span><strong>{search || filter !== 'ALL' ? 'Aucun résultat' : 'Pas encore de prospect'}</strong><p>{search || filter !== 'ALL' ? 'Modifiez votre recherche ou votre filtre.' : 'Les conversations du chat apparaîtront ici.'}</p></div>}
            </div>
            <div className={styles.tableFoot}>Affichage limité aux 100 prospects les plus récemment actifs <span>Mis à jour en direct</span></div>
          </section>

          <aside className={styles.activityPanel}>
            <div className={styles.panelHeading}><div><h2>Activité des agents</h2><p>Les derniers événements du système</p></div><span className={styles.activityPulse}><i /></span></div>
            <div className={styles.timeline}>{summary.recentEvents.map((event, index) => <article className={styles.eventItem} key={event.id}><span className={`${styles.eventIcon} ${event.type.includes('qualified') ? styles.eventQualified : event.type.includes('stock') ? styles.eventStock : ''}`}>{event.type.includes('qualified') ? '✓' : event.type.includes('stock') ? '▤' : '↗'}</span><div className={styles.eventBody}><strong>{eventTitle(event)}</strong><p>{typeof event.payload.name === 'string' ? event.payload.name : event.agent.toLowerCase()}</p><time>{formatDate(event.createdAt)}</time></div>{index < summary.recentEvents.length - 1 && <span className={styles.eventLine} />}</article>)}
              {!summary.recentEvents.length && <div className={styles.emptyEvents}>Les événements récents apparaîtront ici.</div>}
            </div>
            <a className={styles.allActivity} href="/dashboard#prospects">Afficher les prospects <span>→</span></a>
          </aside>
        </div>
      </div>
    </section>

    {selectedId && <div className={styles.detailBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(''); }}>
      <aside className={styles.detailPanel} aria-label="Détail du prospect">
        <header className={styles.detailHeader}><div><p className={styles.overline}>FICHE PROSPECT</p><h2>{detail?.name ?? 'Chargement…'}</h2></div><button onClick={() => setSelectedId('')} aria-label="Fermer le détail">×</button></header>
        {detail && <div className={styles.detailContent}>
          <div className={styles.detailBadges}><span className={`${styles.temperature} ${detail.temperature === 'HOT' ? styles.hot : detail.temperature === 'WARM' ? styles.warm : styles.cold}`}><i />{temperatureLabel(detail.temperature)}</span><span className={styles.statusBadge}>{statusLabel(detail.status)}</span>{detail.humanTakeover && <span className={styles.humanBadge}>Conseiller aux commandes</span>}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}><button type="button" onClick={() => void setTakeover(!detail.humanTakeover)} style={{ border: 0, borderRadius: 7, padding: '8px 10px', background: detail.humanTakeover ? '#edf3dc' : '#304a3e', color: detail.humanTakeover ? '#304a3e' : 'white', cursor: 'pointer' }}>{detail.humanTakeover ? 'Réactiver les agents' : 'Prendre la main'}</button><small style={{ color: '#778178' }}>{detail.humanTakeover ? 'Relances et réponses IA suspendues.' : 'Les réponses et relances IA sont actives.'}</small></div>
          <div className={styles.detailStats}><div><small>Score</small><strong>{detail.score ?? '—'}{detail.score !== null && <small>/100</small>}</strong></div><div><small>Budget estimé</small><strong>{detail.budgetEur !== null ? `${detail.budgetEur.toLocaleString('fr-FR')} €` : '—'}</strong></div><div><small>Urgence</small><strong>{detail.urgency ?? '—'}</strong></div></div>
          <section className={styles.detailSection}><h3>Besoin identifié</h3><p>{detail.need || 'Le besoin sera précisé au fil de la conversation.'}</p>{detail.reason && <small>{detail.reason}</small>}</section>
          <section className={styles.detailSection}><h3>Coordonnées</h3><p>{detail.email || 'Adresse e-mail non fournie'}{detail.phone && <><br />{detail.phone}</>}</p><small>Entrée via {detail.source.replaceAll('_', ' ')} · créé le {formatDate(detail.createdAt, false)}</small></section>
          <section className={styles.appointmentSection}>
            <div className={styles.conversationTitle}><h3>Rendez-vous</h3><span>Propositions locales</span></div>
            {appointments.map((appointment) => <div className={styles.appointmentItem} key={appointment.id}><span>◷</span><div><strong>{({ TEST_RIDE: 'Essai vélo', PURCHASE: 'Conseil achat', REPAIR: 'Atelier', FITTING: 'Étude posturale' })[appointment.type]}</strong><small>{formatDate(appointment.startsAt)} · {appointment.status === 'PROPOSED' ? 'À confirmer' : appointment.status}</small>{appointment.product && <small>Réservé : {appointment.product.name}</small>}{appointment.googleEventId && appointment.status !== 'CANCELLED' ? <small>Synchronisé avec Google Calendar</small> : appointment.status !== 'CANCELLED' && <button className={styles.syncCalendarButton} type="button" onClick={() => void syncAppointment(appointment.id)}>Synchroniser avec Google Calendar</button>}{['PROPOSED', 'CONFIRMED'].includes(appointment.status) && <div className={styles.appointmentActions}>{new Date(appointment.endsAt) <= new Date() && <button type="button" onClick={() => void changeAppointmentStatus(appointment.id, 'complete')}>Terminer</button>}<button type="button" onClick={() => void changeAppointmentStatus(appointment.id, 'cancel')}>Annuler</button></div>}{appointment.status === 'CANCELLED' && appointment.googleEventId && appointment.calendarCancelSync !== 'deleted' && <button className={styles.syncCalendarButton} type="button" onClick={() => void changeAppointmentStatus(appointment.id, 'cancel')}>Réessayer la suppression dans Google Calendar</button>}</div></div>)}
            {!appointments.length && <p className={styles.noAppointments}>Aucun créneau proposé.</p>}
            <form className={styles.appointmentForm} onSubmit={(event) => void proposeAppointment(event)}>
              <label>Type de rendez-vous<select value={appointmentType} onChange={(event) => setAppointmentType(event.target.value as Appointment['type'])}><option value="TEST_RIDE">Essai vélo · 45 min</option><option value="PURCHASE">Conseil achat · 30 min</option><option value="REPAIR">Atelier · 1 h</option><option value="FITTING">Étude posturale · 1 h</option></select></label>
              <label>Article à réserver <span>(facultatif)</span><select value={appointmentProductId} onChange={(event) => setAppointmentProductId(event.target.value)}><option value="">Aucune réservation</option>{products.map((product) => <option key={product.id} value={product.id} disabled={product.stock < 1}>{product.name} · {product.stock} disponible{product.stock === 1 ? '' : 's'}</option>)}</select></label>
              <label>Date et heure<input type="datetime-local" required value={appointmentAt} onChange={(event) => setAppointmentAt(event.target.value)} min={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16)} /></label>
              <label>Note <span>(facultative)</span><input value={appointmentNotes} onChange={(event) => setAppointmentNotes(event.target.value)} maxLength={500} placeholder="Ex. taille du vélo à préparer" /></label>
              {appointmentFeedback && <p className={/^(Créneau enregistré|Créneau synchronisé|Synchronisé|Enregistré|Rendez-vous|Article|L’article)/.test(appointmentFeedback) ? styles.appointmentSuccess : styles.appointmentError} role="status">{appointmentFeedback}</p>}
              <button type="submit" disabled={!appointmentAt || savingAppointment}>{savingAppointment ? 'Enregistrement…' : 'Proposer ce créneau'} <span>→</span></button>
            </form>
          </section>
          <section className={styles.detailSection}><h3>Suivi automatisé</h3>{followups.length ? followups.map((item) => <article key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid #edf0e9' }}><strong style={{ fontSize: 11 }}>Relance {item.attempt} · {item.channel === 'WHATSAPP' ? 'WhatsApp' : 'e-mail'} · {item.status === 'SCHEDULED' ? 'programmée' : item.status === 'PROCESSING' ? 'en cours' : item.status === 'SENT' ? 'envoyée' : item.status === 'FAILED' ? 'en échec' : 'annulée'}</strong><small style={{ display: 'block', color: '#818981', marginTop: 3 }}>{item.status === 'SENT' && item.sentAt ? `Envoyée le ${formatDate(item.sentAt)}` : `Prévue le ${formatDate(item.scheduledFor)}`}{item.error ? ` · ${item.error}` : ''}</small>{item.content && <p>{item.content}</p>}{item.status === 'FAILED' && <button type="button" onClick={() => void retryFollowup(item.id)}>Réessayer</button>}</article>) : <p>Aucune relance prévue. Elle ne sera créée qu’après le consentement explicite du prospect.</p>}</section>
          <section className={styles.conversationSection}><div className={styles.conversationTitle}><h3>Conversation</h3><span>{detail.conversations[0]?.messages.length ?? 0} messages</span></div>
            <div className={styles.messageHistory}>{detail.conversations[0]?.messages.map((message) => <article key={message.id} className={`${styles.historyMessage} ${message.role === 'PROSPECT' ? styles.fromProspect : styles.fromAgent}`}><span>{message.role === 'PROSPECT' ? detail.name : message.role === 'HUMAN' ? 'Conseiller' : 'PedalPilot IA'}</span><p>{message.content}</p><time>{formatDate(message.createdAt)}</time></article>)}{!detail.conversations[0]?.messages.length && <p className={styles.emptyEvents}>Aucun message enregistré.</p>}</div>
          </section>
        </div>}
      </aside>
    </div>}
  </main>;
}
