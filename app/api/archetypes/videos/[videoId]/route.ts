import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { deleteR2ObjectByUrl } from '@/lib/r2-storage';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();

    // If setting as featured, clear others first
    if (body.is_featured === true) {
      const { data: current } = await supabase
        .from('archetype_videos')
        .select('archetype_id')
        .eq('id', videoId)
        .single();

      if (current?.archetype_id) {
        const { error: clearError } = await supabase
          .from('archetype_videos')
          .update({ is_featured: false })
          .eq('archetype_id', current.archetype_id);
        if (clearError) throw clearError;
      }
    }

    const { data, error } = await supabase
      .from('archetype_videos')
      .update(body)
      .eq('id', videoId)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, video: data });
  } catch (error) {
    console.error('Video patch error:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ videoId: string }> },
) {
  try {
    const { videoId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { data: video } = await supabase
      .from('archetype_videos')
      .select('video_url')
      .eq('id', videoId)
      .single();

    const { error } = await supabase
      .from('archetype_videos')
      .delete()
      .eq('id', videoId);

    if (error) throw error;

    if (video?.video_url) {
      try {
        await deleteR2ObjectByUrl(video.video_url);
      } catch {
        // Already gone or not an R2 URL.
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Video delete error:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
