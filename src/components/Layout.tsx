import React from "react";
import LanguageSwitcher from "./LanguageSwitcher";


export default function Layout({ children }: { children: React.ReactNode }) {
return (
<div className="min-h-screen bg-gradient-to-b from-white to-zinc-50 text-zinc-900">
<header className="sticky top-0 z-40 backdrop-blur bg-white/70 border-b">
<div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
<a href="/" className="font-semibold tracking-wide hover:opacity-80 transition-opacity">
NovaCiv
</a>
<nav className="flex items-center gap-4 text-sm">
<a href="/#manifest" className="opacity-80 hover:opacity-100">Манифест</a>
<a href="/#charter" className="opacity-80 hover:opacity-100">Устав</a>
<a href="/join" className="opacity-80 hover:opacity-100">Присоединиться</a>
<LanguageSwitcher />
</nav>
</div>
</header>


<main className="mx-auto max-w-5xl px-4 py-10">
<div className="bg-white rounded-2xl shadow-sm ring-1 ring-zinc-900/5 p-6 md:p-8 fade-in">
{children}
</div>
</main>


<footer className="border-t bg-white/70">
<div className="mx-auto max-w-5xl px-4 py-6 text-sm opacity-70">
© NovaCiv. Свобода, ненасилие, прямая демократия, наука.
</div>
</footer>
</div>
);
}
