import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  try {
    const { imageId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();

    // If setting as main, clear others first
    if (body.is_main === true) {
      const { data: current } = await supabase
        .from('archetype_gallery')
        .select('archetype_id')
        .eq('id', imageId)
        .single();

      if (current?.archetype_id) {
        await supabase
          .from('archetype_gallery')
          .update({ is_main: false })
          .eq('archetype_id', current.archetype_id);

        // Update archetype_images table too
        if (body.image_url) {
          await supabase
            .from('archetype_images')
            .upsert({
              archetype_id: current.archetype_id,
              image_url: body.image_url,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'archetype_id' });
        }
      }
    }

    const { error } = await supabase
      .from('archetype_gallery')
      .update(body)
      .eq('id', imageId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Gallery patch error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ imageId: string }> },
) {
  try {
    const { imageId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    // Get the image before deleting
    const { data: img } = await supabase
      .from('archetype_gallery')
      .select('*')
      .eq('id', imageId)
      .single();

    if (!img) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Delete from gallery table
    const { error } = await supabase
      .from('archetype_gallery')
      .delete()
      .eq('id', imageId);

    if (error) throw error;

    // If was main, promote next image
    if (img.is_main) {
      const { data: next } = await supabase
        .from('archetype_gallery')
        .select('*')
        .eq('archetype_id', img.archetype_id)
        .order('sort_order', { ascending: true })
        .limit(1);

      if (next?.[0]) {
        await supabase
          .from('archetype_gallery')
          .update({ is_main: true })
          .eq('id', next[0].id);

        await supabase
          .from('archetype_images')
          .upsert({
            archetype_id: img.archetype_id,
            image_url: next[0].image_url,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'archetype_id' });
      } else {
        await supabase
          .from('archetype_images')
          .delete()
          .eq('archetype_id', img.archetype_id);
      }
    }

    // Try to delete from Supabase Storage if it's a storage URL
    try {
      const url = new URL(img.image_url);
      const pathParts = url.pathname.split('/companions/');
      if (pathParts.length > 1) {
        await supabase.storage.from('companions').remove([pathParts[1]]);
      }
    } catch {
      // Not a storage URL or already gone — ignore
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Gallery delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
