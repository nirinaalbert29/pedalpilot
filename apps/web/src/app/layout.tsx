import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PedalPilot — La vente vélo, en mouvement',
  description: 'L’assistant vélo qui connaît votre stock et accompagne chaque cycliste jusqu’au bon modèle.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
