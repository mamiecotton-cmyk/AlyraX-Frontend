import Vapi from '@vapi-ai/web';

// This initializes the AlyraX connection
const key = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
export const vapi = typeof window !== 'undefined' && key && key !== 'your-key-goes-here'
  ? new Vapi(key)
  : null;
