import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { deleteR2ObjectByUrl } from '@/lib/r2-storage';

async function removeCompanionStorageImage(supabase: Awaited<ReturnType<typeof createClient>>, imageUrl: string) {
  try {
    const deletedFromR2 = await deleteR2ObjectByUrl(imageUrl);
    if (deletedFromR2) return;

    const url = new URL(imageUrl);
    const pathParts = url.pathname.split('/companions/');
    if (pathParts.length > 1) {
      await supabase.storage.from('companions').remove([decodeURIComponent(pathParts[1])]);
    }
  } catch {
    // Not a companions storage URL, or it was already removed.
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ archetypeId: string }> },
) {
  try {
    const { archetypeId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: currentImage, error: currentError } = await supabase
      .from('archetype_images')
      .select('*')
      .eq('archetype_id', archetypeId)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!currentImage?.image_url) {
      return NextResponse.json({ success: true, next_image_url: null });
    }

    const { data: galleryRows, error: galleryLookupError } = await supabase
      .from('archetype_gallery')
      .select('*')
      .eq('archetype_id', archetypeId)
      .eq('image_url', currentImage.image_url)
      .order('is_main', { ascending: false })
      .order('sort_order', { ascending: true })
      .limit(1);

    if (galleryLookupError) throw galleryLookupError;
    const galleryImage = galleryRows?.[0];

    if (galleryImage) {
      const { error: galleryDeleteError } = await supabase
        .from('archetype_gallery')
        .delete()
        .eq('id', galleryImage.id);

      if (galleryDeleteError) throw galleryDeleteError;
    }

    const shouldPromoteNext = !galleryImage || galleryImage.is_main;
    let nextImageUrl: string | null = null;

    if (shouldPromoteNext) {
      const { data: nextRows, error: nextError } = await supabase
        .from('archetype_gallery')
        .select('*')
        .eq('archetype_id', archetypeId)
        .order('sort_order', { ascending: true })
        .limit(1);

      if (nextError) throw nextError;
      const nextImage = nextRows?.[0];

      if (nextImage) {
        await supabase
          .from('archetype_gallery')
          .update({ is_main: true })
          .eq('id', nextImage.id);

        const { error: upsertError } = await supabase
          .from('archetype_images')
          .upsert({
            archetype_id: archetypeId,
            image_url: nextImage.image_url,
            prompt_used: nextImage.prompt_used ?? currentImage.prompt_used ?? null,
            seed: nextImage.seed ?? null,
            style: nextImage.style ?? currentImage.style ?? 'portrait',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'archetype_id' });

        if (upsertError) throw upsertError;
        nextImageUrl = nextImage.image_url;
      } else {
        const { error: imageDeleteError } = await supabase
          .from('archetype_images')
          .delete()
          .eq('archetype_id', archetypeId);

        if (imageDeleteError) throw imageDeleteError;
      }
    } else {
      const { error: imageDeleteError } = await supabase
        .from('archetype_images')
        .delete()
        .eq('archetype_id', archetypeId);

      if (imageDeleteError) throw imageDeleteError;
    }

    await removeCompanionStorageImage(supabase, currentImage.image_url);

    return NextResponse.json({ success: true, next_image_url: nextImageUrl });
  } catch (error) {
    console.error('Archetype image delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
