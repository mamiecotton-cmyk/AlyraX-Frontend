import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase-server';

export async function POST(req: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const origin = req.nextUrl.origin;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: 200,
            product_data: {
              name: 'Custom persona regeneration',
              description: 'Generate a new AlyraX companion profile image',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        user_id: user.id,
        product: 'persona_regeneration',
      },
      success_url: `${origin}/onboarding?persona_regen=paid&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/onboarding?persona_regen=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Persona regeneration checkout error:', error);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
