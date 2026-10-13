import { GamePage } from './game-page';
import '../catalog.css';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GamePage id={id} />;
}
