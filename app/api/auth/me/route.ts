import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const user = data?.user ?? null

    if (!user) return NextResponse.json({ user: null, is_admin: false })

    // Determine admin status from user metadata or environment list
    const metaIsAdmin = Boolean((user.user_metadata as any)?.is_admin)
    const envAdmins = (process.env.ADMIN_USER_IDS || process.env.ADMIN_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const isEnvAdmin = envAdmins.length > 0 && user.id && envAdmins.includes(user.id)

    const is_admin = metaIsAdmin || isEnvAdmin

    return NextResponse.json({ user: { id: user.id, email: user.email, user_metadata: user.user_metadata }, is_admin })
  } catch (err) {
    console.error('auth/me error', err)
    return NextResponse.json({ user: null, is_admin: false }, { status: 500 })
  }
}
