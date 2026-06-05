// lib/archetype-loras.ts
// Mapping of archetypes to their trained Flux LoRAs.
// Only archetypes with a trained LoRA get routed to the Flux pipeline.
// Add new entries here as more characters get trained.

export type ArchetypeLoraConfig = {
  loraFile: string;
  triggerWord: string;
};

export const archetypeLoras: Record<string, ArchetypeLoraConfig> = {
  jerome: {
    loraFile: 'jerome_v1_flux.safetensors',
    triggerWord: 'jrmwr',
  },
  jaxon: {
    loraFile: 'jaxon_v1.safetensors',
    triggerWord: 'jxnst',
  },
  zara: {
    loraFile: 'zara_v1.safetensors',
    triggerWord: 'zrabd',
  },
};

export function getArchetypeLora(archetypeId: string): ArchetypeLoraConfig | null {
  return archetypeLoras[archetypeId] ?? null;
}