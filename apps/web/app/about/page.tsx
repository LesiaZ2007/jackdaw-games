import type { Metadata } from 'next';
import { About } from './about';
import '../games/catalog.css';

export const metadata: Metadata = {
  title: 'About',
  description: 'Who made the pieces in Jackdaw Games, and where the games come from.',
};

export default function AboutPage() {
  return <About />;
}
