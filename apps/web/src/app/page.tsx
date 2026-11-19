import { ChatWidget } from '@/components/chat-widget';

const benefits = [
  { number: '01', title: 'Toujours disponible', text: 'Chaque cycliste reçoit une réponse, même quand votre équipe est en atelier.' },
  { number: '02', title: 'Votre stock, en direct', text: 'Les conseils s’appuient sur vos vélos et leurs disponibilités réelles.' },
  { number: '03', title: 'Le bon échange, au bon moment', text: 'Besoins, budget et projet sont résumés pour faciliter la reprise par votre équipe.' },
];

export default function Home() {
  return (
    <main>
      <header className="topbar page-wrap">
        <a className="brand" href="#top" aria-label="PedalPilot, accueil"><span className="brand-mark" aria-hidden="true">P</span><span>pedalpilot<span className="brand-dot">.</span></span></a>
        <nav className="nav-links" aria-label="Navigation principale"><a href="#approche">Notre approche</a><a href="#demo">Voir la démo</a></nav>
        <a className="top-cta" href="#demo">Parler à l’assistant <span aria-hidden="true">↗</span></a>
      </header>

      <section className="hero page-wrap" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-dot" /> L’assistant vélo de votre boutique</p>
          <h1>Chaque cycliste mérite <span>le bon vélo.</span></h1>
          <p className="hero-lede">PedalPilot accueille vos visiteurs, comprend leur pratique et les guide vers les vélos disponibles dans votre boutique.</p>
          <div className="hero-actions"><a className="button button-dark" href="#demo">Essayer l’assistant <span aria-hidden="true">→</span></a><a className="text-link" href="#approche">Découvrir comment ça marche <span aria-hidden="true">↓</span></a></div>
          <div className="hero-note"><span className="avatar-stack" aria-hidden="true"><i>✳</i><i>↗</i><i>●</i></span><span>Du premier « bonjour » au prochain tour de roue.</span></div>
        </div>
        <div className="hero-art" aria-label="Illustration d’un vélo de gravel">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="sun-disc" />
          <div className="art-label label-top"><span>VOTRE BOUTIQUE</span><b>Conseil qui roule.</b></div>
          <svg className="bike-art" viewBox="0 0 620 400" role="img" aria-label="Vélo gravel illustré">
            <defs><linearGradient id="frame" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#f4ff70" /><stop offset="1" stopColor="#a8cb28" /></linearGradient></defs>
            <g fill="none" stroke="#20322c" strokeWidth="8"><circle cx="150" cy="280" r="91" /><circle cx="452" cy="280" r="91" /><path d="M150 280 250 132 323 280H150l90-17 83 17 112-130" stroke="url(#frame)" strokeWidth="15" strokeLinejoin="round" /><path d="m250 132 60 2m-74-13 19 0m68 159-33-92m-57-56-22-22m233 52 39-11m-32 3 43 11" strokeLinecap="round" /><path d="M429 121h31m-170 11 18-23" strokeWidth="11" strokeLinecap="round" /><path d="M127 280h46m279 0h-46" stroke="#89958c" strokeWidth="3" /></g>
            <circle cx="323" cy="280" r="13" fill="#f4ff70" /><path d="M248 132 206 280m204-150 42 150" stroke="#ffffff" strokeOpacity=".48" strokeWidth="2" />
          </svg>
          <div className="art-label label-bottom"><span>EN STOCK</span><b>Prêt pour la route.</b></div>
          <div className="art-caption"><span>01 / 03</span><span>LE BON VÉLO COMMENCE ICI</span></div>
        </div>
      </section>

      <section className="approach" id="approche"><div className="page-wrap approach-inner">
        <div className="section-heading"><p className="eyebrow">Plus qu’un chatbot</p><h2>Un premier échange<br />qui connaît <em>le terrain.</em></h2></div>
        <div className="benefits">{benefits.map((benefit) => <article className="benefit" key={benefit.number}><span className="benefit-number">{benefit.number}</span><h3>{benefit.title}</h3><p>{benefit.text}</p></article>)}</div>
      </div></section>

      <section className="closing page-wrap" id="demo"><div><p className="eyebrow">À vous de rouler</p><h2>Quel vélo vous<br />emmène <em>plus loin&nbsp;?</em></h2></div><p>Écrivez votre pratique ou votre idée de sortie. L’assistant vous répond à partir du stock de démonstration.</p></section>
      <footer className="footer page-wrap"><a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">P</span><span>pedalpilot<span className="brand-dot">.</span></span></a><span>Fait pour les boutiques qui font avancer le vélo.</span><span>© 2026 PedalPilot</span></footer>
      <ChatWidget />
    </main>
  );
}
