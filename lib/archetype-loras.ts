// lib/archetype-loras.ts
export type ArchetypeLoraConfig = {
  loraFile: string;
  triggerWord: string;
  refinementLoraFile?: string;
  refinementStrength?: number;
};

export const archetypeLoras: Record<string, ArchetypeLoraConfig> = {
  jerome: {
    loraFile: 'jerome_v1_flux.safetensors',
    triggerWord: 'jrmwr',
  },
  jaxon: {
    loraFile: 'jaxon_v2.safetensors',
    triggerWord: 'jxnst',
  },
  roman: {
    loraFile: 'roman_v1.safetensors',
    triggerWord: 'r0man',
  },
  zara: {
    loraFile: 'zara_v1.safetensors',
    triggerWord: 'zrabd',
    refinementLoraFile: 'zara_v2.safetensors',
    refinementStrength: 0.35,
  },
  nia: {
    loraFile: 'nia_v1.safetensors',
    triggerWord: 'niavx',
  },
  soleil: {
    loraFile: 'soleil_v1.safetensors',
    triggerWord: 'solx',
    refinementLoraFile: 'soleil_v2.safetensors',
    refinementStrength: 0.2,
  },
  victoria: {
    loraFile: 'victoria_v1.safetensors',
    triggerWord: 'vctrx',
    refinementLoraFile: 'victoria_v2.safetensors',
    refinementStrength: 0.35,
  },
};

export function getArchetypeLora(archetypeId: string): ArchetypeLoraConfig | null {
  return archetypeLoras[archetypeId] ?? null;
}
