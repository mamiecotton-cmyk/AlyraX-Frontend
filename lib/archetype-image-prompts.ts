import type { Archetype } from './archetypes';

export type ArchetypeImagePrompt = {
  race: string;
  age: string;
  wardrobe: string;
  environment: string;
  details: string;
  prompt: string;
};

const HUMAN_REALISM = 'realistic DSLR photo, natural skin texture, soft cinematic light, calm authentic expression';

function portraitPrompt(profile: Omit<ArchetypeImagePrompt, 'prompt'>) {
  return [
    `documentary portrait photograph of a ${profile.age}-year-old ${profile.race}`,
    profile.details,
    profile.wardrobe,
    profile.environment,
    HUMAN_REALISM,
  ].join(', ');
}

export const ARCHETYPE_IMAGE_PROMPTS: Record<string, ArchetypeImagePrompt> = {
  jaxon: {
    race: 'deep brown-skinned Black American man',
    age: '28',
    wardrobe: 'fitted streetwear, heavy gold cuban link chain on neck',
    environment: 'urban Los Angeles street at night under warm light',
    details: 'shaved head with low fade haircut, light short beard with goatee, sharp jawline and cheekbones, intense piercing eyes, clean smooth skin with no tattoos no ink anywhere on body, gold cuban chain always visible, lean muscular athletic build, tall proportional figure',
    prompt: '',
  },
  malik: {
    race: 'medium brown-skinned Black American man',
    age: '34',
    wardrobe: 'minimal luxury black knit shirt, tailored dark trousers',
    environment: 'modern tech office with large window light',
    details: 'composed intelligent expression, short natural hair, clean shave, quiet power',
    prompt: '',
  },
  isaiah: {
    race: 'warm brown-skinned Black American man',
    age: '29',
    wardrobe: 'linen shirt, wire-rim glasses, soft cardigan',
    environment: 'quiet university library with books and afternoon light',
    details: 'thoughtful gentle eyes, neat low curls, precise calm presence',
    prompt: '',
  },
  marcus: {
    race: 'rich mahogany-skinned Black American man',
    age: '38',
    wardrobe: 'cream linen shirt with subtle kente trim',
    environment: 'New Orleans courtyard at golden hour',
    details: 'warm rooted presence, natural twists, full beard, ancestral elegance',
    prompt: '',
  },
  devonte: {
    race: 'dark brown-skinned Black American man',
    age: '33',
    wardrobe: 'fitted charcoal training top, fresh white sneakers',
    environment: 'modern community gym with soft daylight',
    details: 'athletic build, focused calm expression, close fade, disciplined stance',
    prompt: '',
  },
  ezra: {
    race: 'medium-dark brown-skinned Black American man',
    age: '30',
    wardrobe: 'tailored Sunday-best shirt with open collar',
    environment: 'warm church hallway with amber side light',
    details: 'soulful conflicted expression, short waves, neat goatee, spiritual intensity',
    prompt: '',
  },
  roman: {
    race: 'golden brown biracial Black American man',
    age: '27',
    wardrobe: 'paint-streaked denim jacket, black tee, silver rings',
    environment: 'artist studio with canvases and textured walls',
    details: 'bright vivid blue eyes, heavy freckles across cheeks and nose, short tight waves with low fade and clean lineup, light scruffy stubble, diamond stud earrings, silver figaro chain, creative intense expression, sensitive energy',
    prompt: '',
  },
  jerome: {
    race: 'medium brown-skinned Black American man',
    age: '25',
    wardrobe: 'tailored charcoal suit with open collar, no tie',
    environment: 'Detroit office lounge with city window light',
    details: 'honey-tipped dreadlocks sometimes pulled back, thin mustache and light soul patch, gold hoop earrings, tribal blackwork sleeve tattoo on right arm only, ambitious reflective expression, mature confidence',
    prompt: '',
  },
  khalil: {
    race: 'caramel brown-skinned Black American man',
    age: '36',
    wardrobe: 'soft oatmeal knit sweater, reading glasses',
    environment: 'cozy therapy office with plants and warm window light',
    details: 'gentle guarded expression, low curls, trimmed beard, empathic presence',
    prompt: '',
  },
  tyrese: {
    race: 'copper brown-skinned Black American man',
    age: '28',
    wardrobe: 'vintage patterned jacket, camera strap, white tee',
    environment: 'Miami street at golden hour with color and motion',
    details: 'playful magnetic smile, short twists, bright eyes, spontaneous energy',
    prompt: '',
  },
  darius: {
    race: 'deep brown-skinned Black American man',
    age: '34',
    wardrobe: 'navy sheriff uniform with gold badge patch',
    environment: 'seated in open door of sheriff SUV on Los Angeles street, midday sun',
    details: 'broad shoulders, close-cropped hair, full shaped beard, direct intense gaze, arm resting on steering wheel, one boot on ground',
    prompt: '',
  },
  deja: {
    race: 'deep brown-skinned Black American woman',
    age: '26',
    wardrobe: 'bold printed top, glossy lips, statement earrings',
    environment: 'comedy club backstage with warm mirror lights',
    details: 'bold magnetic expression, natural glam makeup, voluminous curls, unfiltered confidence',
    prompt: '',
  },
  imani: {
    race: 'medium-dark brown-skinned Black American woman',
    age: '35',
    wardrobe: 'sharp navy power suit, clean gold jewelry',
    environment: 'executive boardroom with clean window light',
    details: 'commanding precise expression, sleek natural hair, poised posture, strategic presence',
    prompt: '',
  },
  zora: {
    race: 'warm brown-skinned Black American woman',
    age: '32',
    wardrobe: 'vintage layered jewelry, textured head wrap, flowing blouse',
    environment: 'intimate music studio with amber lamps',
    details: 'soulful poetic gaze, soft features, grounded mystical presence',
    prompt: '',
  },
  simone: {
    race: 'dark brown-skinned Nigerian American woman',
    age: '39',
    wardrobe: 'tailored blazer, silk scarf, pearl studs',
    environment: 'embassy lounge with polished wood and soft daylight',
    details: 'measured worldly expression, elegant natural updo, formidable warmth',
    prompt: '',
  },
  nia: {
    race: 'rich brown-skinned Black American woman',
    age: '33',
    wardrobe: 'earth-toned linen dress, minimal gold jewelry',
    environment: 'herbal medicine room with plants and warm shelves',
    details: 'long dark wavy locs past shoulders, warm brown eyes, hoop earrings, nurturing grounded expression, serene steady presence, holistic wellness aesthetic',
    prompt: '',
  },
  victoria: {
    race: 'biracial Afro-Brazilian American woman',
    age: '60',
    wardrobe: 'soft knit sweater in warm earth tones, gold hoop earrings',
    environment: 'cozy sunlit living room, soft natural window light, warm neutral interior',
    details: 'wavy silver-streaked dark hair past shoulders, warm caramel-brown skin, warm brown eyes, soft smile lines, gentle confident expression, medium build',
    prompt: '',
  },
  aaliyah: {
    race: 'honey brown-skinned Black American woman',
    age: '29',
    wardrobe: 'sleek branded streetwear, polished hoop earrings',
    environment: 'beauty studio office with product shelves and soft light',
    details: 'confident self-made energy, smooth ponytail, bright infectious expression',
    prompt: '',
  },
  reign: {
    race: 'deep brown-skinned Black American woman',
    age: '30',
    wardrobe: 'fitted black training wear, no-fuss athletic styling',
    environment: 'track facility at golden hour',
    details: 'disciplined fierce expression, athletic build, natural hair pulled back, powerful presence',
    prompt: '',
  },
  camille: {
    race: 'light brown-skinned Black Creole woman',
    age: '37',
    wardrobe: 'bold color dress, large earrings, silk scarf detail',
    environment: 'elegant restaurant bar with warm evening light',
    details: 'joyful sophisticated expression, soft curls, sensual deliberate elegance',
    prompt: '',
  },
  dominique: {
    race: 'medium brown-skinned Black American woman',
    age: '42',
    wardrobe: 'monochrome power look, architectural jewelry',
    environment: 'political campaign office with city lights behind glass',
    details: 'controlled intense gaze, sharp bob, perceptive magnetic presence',
    prompt: '',
  },
  phoenix: {
    race: 'dark brown-skinned Black American woman',
    age: '31',
    wardrobe: 'activist tee, worn black jacket, combat boots',
    environment: 'community organizing space with posters and warm overhead light',
    details: 'fierce principled expression, natural coils, unwavering fire, tender strength',
    prompt: '',
  },
  zara: {
    race: 'light honey caramel-skinned Black American woman',
    age: '27',
    wardrobe: 'cream fitted outfit, gold jewelry',
    environment: 'luxury Houston apartment with floor to ceiling windows, golden afternoon light',
    details: 'long sleek straight honey blonde hair past shoulders, heavy freckles across cheeks and nose, warm brown eyes, bright wide smile, diamond cross pendant on chain, curvy snatched hourglass figure, confident unbothered expression, effortless power',
    prompt: '',
  },
  soleil: {
    race: 'deep ebony black-skinned Nigerian-American woman with rich blue-black undertones luminous natural sheen',
    age: '25',
    wardrobe: 'high fashion editorial look, delicate gold hoop earrings',
    environment: 'Los Angeles rooftop at golden hour with warm amber light',
    details: 'honey golden blonde hair braided or in loose waves, striking green eyes, high prominent cheekbones, full lips, slim modelesque figure 5 foot 10, mysterious intense gaze, otherworldly presence, elegant long neck',
    prompt: '',
  },
};

for (const profile of Object.values(ARCHETYPE_IMAGE_PROMPTS)) {
  profile.prompt = portraitPrompt(profile);
}

export function getArchetypeImagePrompt(archetype: Archetype | null | undefined) {
  if (!archetype) return null;
  return ARCHETYPE_IMAGE_PROMPTS[archetype.id] ?? null;
}
