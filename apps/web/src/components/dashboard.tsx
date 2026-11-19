'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './dashboard.module.css';

type Temperature = 'HOT' | 'WARM' | 'COLD' | null;
type ProspectStatus = 'NEW' | 'QUALIFIED' | 'APPOINTMENT_BOOKED' | 'FOLLOWING_UP' | 'WON' | 'LOST';
type AgentEvent = { id: string; type: string; agent: string; prospectId: string | null; payload: Record<string, unknown>; createdAt: string; persisted?: boolean };
type Message = { id: string; role: 'PROSPECT' | 'AGENT' | 'HUMAN' | 'SYSTEM'; content: string; createdAt: string };
type Prospect = {
  id: string; name: string; email: string | null; source: string; status: ProspectStatus; score: number | null;
  temperature: Temperature; need: string | null; budgetEur: number | null; urgency: string | null;
  humanTakeover: boolean; lastActivityAt: string; createdAt: string;
  conversations: { id: string; messages: Pick<Message, 'content' | 'role' | 'createdAt'>[] }[];
};
type ProspectDetail = Omit<Prospect, 'conversations'> & { conversations: { id: string; messages: Message[] }[]; events?: AgentEvent[]; reason?: string | null };
type Summary = { prospects: number; hotProspects: number; newThisWeek: number; qualified: number; lowStock: number; recentEvents: AgentEvent[] };
type Filter = 'ALL' | 'NEW' | 'QUALIFIED' | 'HOT';

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
    throw new Error(`L’API a répondu avec le statut ${response.status}.`);
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
    'stock.unavailable': 'Produit indisponible', 'stock.reserved': 'Vélo réservé',
    'followup.sent': 'Relance envoyée', 'followup.cancelled': 'Relance annulée',
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
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

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
      const [nextSummary, nextProspects] = await Promise.all([
        authorizedFetch<Summary>('/dashboard/summary', secret),
        authorizedFetch<Prospect[]>(`/dashboard/prospects${params.size ? `?${params.toString()}` : ''}`, secret),
      ]);
      setSummary(nextSummary);
      setProspects(nextProspects);
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
    return () => { ignore = true; };
  }, [token, selectedId]);

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
          <div className={styles.detailStats}><div><small>Score</small><strong>{detail.score ?? '—'}{detail.score !== null && <small>/100</small>}</strong></div><div><small>Budget estimé</small><strong>{detail.budgetEur !== null ? `${detail.budgetEur.toLocaleString('fr-FR')} €` : '—'}</strong></div><div><small>Urgence</small><strong>{detail.urgency ?? '—'}</strong></div></div>
          <section className={styles.detailSection}><h3>Besoin identifié</h3><p>{detail.need || 'Le besoin sera précisé au fil de la conversation.'}</p>{detail.reason && <small>{detail.reason}</small>}</section>
          <section className={styles.detailSection}><h3>Coordonnées</h3><p>{detail.email || 'Adresse e-mail non fournie'}</p><small>Entrée via {detail.source.replaceAll('_', ' ')} · créé le {formatDate(detail.createdAt, false)}</small></section>
          <section className={styles.conversationSection}><div className={styles.conversationTitle}><h3>Conversation</h3><span>{detail.conversations[0]?.messages.length ?? 0} messages</span></div>
            <div className={styles.messageHistory}>{detail.conversations[0]?.messages.map((message) => <article key={message.id} className={`${styles.historyMessage} ${message.role === 'PROSPECT' ? styles.fromProspect : styles.fromAgent}`}><span>{message.role === 'PROSPECT' ? detail.name : message.role === 'HUMAN' ? 'Conseiller' : 'PedalPilot IA'}</span><p>{message.content}</p><time>{formatDate(message.createdAt)}</time></article>)}{!detail.conversations[0]?.messages.length && <p className={styles.emptyEvents}>Aucun message enregistré.</p>}</div>
          </section>
        </div>}
      </aside>
    </div>}
  </main>;
}
