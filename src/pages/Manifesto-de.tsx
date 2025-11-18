import React from "react";

export default function ManifestoDe() {
  return (
    <main className="min-h-screen bg-white text-zinc-800">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">

        {/* Top bar */}
        <header className="flex items-center justify-between">
          <button
            onClick={() => (window.location.href = "/")}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 active:bg-zinc-100 transition"
          >
            ← Back to home
          </button>

          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/80 bg-zinc-50/80 px-4 py-1 text-[11px] font-medium text-zinc-600 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Manifest • Deutsch</span>
          </div>
        </header>

        {/* Title */}
        <section className="space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold text-zinc-900">
            NovaCiv Manifest
          </h1>
          <p className="text-sm text-zinc-500">
            Warum wir eine neue digitale Zivilisation brauchen und warum Verstand
            wichtiger ist als Materie.
          </p>
        </section>

        {/* Main text */}
        <section className="nova-text text-[15px] leading-relaxed mt-6 whitespace-pre-wrap text-justify space-y-3">
   
        </section>

        {/* Footer */}
        <footer className="pt-6 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-zinc-500">
          <div>
            Wenn dich das anspricht, sieh dir auch die Charta und die Seite „Beitreten“ an.
          </div>
          <div className="flex gap-3">
            <a href="/Charter-de" className="underline hover:text-zinc-800">
              Charter (DE)
            </a>
            <a href="/join" className="underline hover:text-zinc-800">
              NovaCiv beitreten
            </a>
          </div>
        </footer>

      </div>
    </main>
  );
}
