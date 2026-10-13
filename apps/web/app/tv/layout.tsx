import type { Metadata } from 'next';
import './tv.css';

export const metadata: Metadata = { title: 'TV' };

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
