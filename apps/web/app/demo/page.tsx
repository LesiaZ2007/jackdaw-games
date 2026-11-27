import type { Metadata } from 'next';
import { DemoRoom } from './demo-room';

export const metadata: Metadata = {
  title: 'Try UNO · Demo',
  description: 'Play a local round of UNO against three bird bots in your browser.',
};

export default function DemoPage() {
  return <DemoRoom />;
}
