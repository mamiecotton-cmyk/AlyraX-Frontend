export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-900">
        <h1 className="text-xl font-serif">Alyra X</h1>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-xs text-gray-500 hover:text-white transition"
          >
            Sign out
          </button>
        </form>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 p-6">
        <div className="text-center space-y-2">
          <p className="text-gray-500 text-sm">Welcome back</p>
          <p className="text-lg">{user.email}</p>
        </div>

        <a
          href="/call"
          className="px-10 py-4 bg-white text-black font-bold rounded-full hover:bg-gray-200 transition text-sm"
        >
          Start a Call
        </a>
      </div>
    </main>
  );
}
