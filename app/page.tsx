import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase-server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Check if onboarding complete
  const { data: companion } = await supabase
    .from('companions')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!companion) {
    redirect('/onboarding');
  }

  redirect('/dashboard');
}
