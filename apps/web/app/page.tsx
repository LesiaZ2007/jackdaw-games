import { EchoCheck } from './echo-check';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <h1 className="font-serif text-5xl tracking-tight">Jackdaw Games</h1>
      <p className="text-[var(--ink-2)]">
        The real home page arrives once the mockups are approved.
      </p>
      <EchoCheck />
    </main>
  );
}
