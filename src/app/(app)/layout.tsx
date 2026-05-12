import Link from "next/link";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { OnlineStatusBar } from "@/components/OnlineStatusBar";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/sites", label: "조사지점" },
  { href: "/events", label: "야장 목록" },
  { href: "/events/new", label: "+ 새 야장" },
  { href: "/queue", label: "동기화 큐" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { displayName, role } = await getCurrentUserAndRole();

  return (
    <div className="min-h-screen flex flex-col">
      <OnlineStatusBar />
      <header className="bg-brand-700 text-white">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between gap-3">
          <Link href="/sites" className="text-lg font-bold">Woodbank</Link>
          <div className="flex items-center gap-3">
            <Link href="/profile" className="text-xs opacity-90 text-right hover:underline">
              {displayName}
              <div className="uppercase tracking-wide opacity-70">{role}</div>
            </Link>
            <LogoutButton />
          </div>
        </div>
        <nav className="mx-auto max-w-5xl px-2 pb-2 flex gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className="px-3 py-1.5 rounded hover:bg-brand-500/40">
              {n.label}
            </Link>
          ))}
          {role === "admin" && (
            <Link href="/admin" className="px-3 py-1.5 rounded hover:bg-brand-500/40">관리자</Link>
          )}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="text-center text-xs text-stone-400 py-4">
        Woodbank — 목재 재감 구축 연구그룹
      </footer>
    </div>
  );
}
