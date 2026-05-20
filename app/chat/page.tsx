import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export default async function ChatIndexPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Find most recent conversation
  const { data: recentConv } = await supabase
    .from('conversations')
    .select('archetype_id')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentConv?.archetype_id) {
    redirect(`/chat/${recentConv.archetype_id}`);
  }

  // No conversations yet — redirect to archive to pick someone
  redirect('/archive');
}