import { extractWistiaId } from './wistia';

export interface ParsedVideo {
  type: 'youtube' | 'wistia' | 'vimeo' | 'direct';
  url: string;
  videoId?: string;
  isIframeEmbed?: boolean;
}

/**
 * Parses any video string (YouTube URL, YouTube Shorts, YouTube Embed, HTML <iframe> tag, Wistia ID/HTML, Vimeo URL)
 * into a normalized player config.
 */
export function parseVideoUrlOrIframe(input: string): ParsedVideo {
  const rawData = (input || '').trim();
  if (!rawData) {
    return { type: 'direct', url: '' };
  }

  // 1. Check if rawData is an HTML iframe tag (or contains <iframe or src=)
  if (rawData.includes('<iframe') || (rawData.includes('<') && rawData.includes('src='))) {
    const srcMatch = rawData.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      const extractedSrc = srcMatch[1].trim();
      const result = parseVideoUrlOrIframe(extractedSrc);
      result.isIframeEmbed = true;
      return result;
    }
  }

  // 2. Wistia check
  if (
    rawData.includes('wistia.com') ||
    rawData.includes('wistia.net') ||
    rawData.includes('wistia-player') ||
    (!rawData.includes('http') && !rawData.includes('/') && rawData.length < 35)
  ) {
    const wistiaId = extractWistiaId(rawData);
    return {
      type: 'wistia',
      url: wistiaId,
      videoId: wistiaId
    };
  }

  // 3. YouTube check
  const isYoutube =
    rawData.includes('youtube.com') ||
    rawData.includes('youtu.be') ||
    rawData.includes('yt.be');

  if (isYoutube) {
    let videoId = '';
    let listParam = '';

    // Extract playlist list parameter if present
    if (rawData.includes('list=')) {
      const listMatch = rawData.match(/[?&]list=([^&"'\s]+)/);
      if (listMatch && listMatch[1]) {
        listParam = `&list=${listMatch[1]}`;
      }
    }

    if (rawData.includes('watch?v=')) {
      const match = rawData.match(/[?&]v=([^&"'\s]+)/);
      if (match && match[1]) videoId = match[1];
    } else if (rawData.includes('youtu.be/')) {
      const match = rawData.match(/youtu\.be\/([^?&"'\s]+)/);
      if (match && match[1]) videoId = match[1];
    } else if (rawData.includes('/embed/')) {
      const match = rawData.match(/\/embed\/([^?&"'\s]+)/);
      if (match && match[1]) videoId = match[1];
    } else if (rawData.includes('/shorts/')) {
      const match = rawData.match(/\/shorts\/([^?&"'\s]+)/);
      if (match && match[1]) videoId = match[1];
    } else if (rawData.includes('/live/')) {
      const match = rawData.match(/\/live\/([^?&"'\s]+)/);
      if (match && match[1]) videoId = match[1];
    }

    if (videoId) {
      const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0${listParam}`;
      return {
        type: 'youtube',
        url: embedUrl,
        videoId
      };
    }

    // Fallback if URL is already embed format or contains params
    if (rawData.startsWith('http')) {
      const embedUrl = rawData.includes('?') ? `${rawData}&autoplay=1` : `${rawData}?autoplay=1`;
      return {
        type: 'youtube',
        url: embedUrl
      };
    }
  }

  // 4. Vimeo check
  if (rawData.includes('vimeo.com')) {
    const match = rawData.match(/vimeo\.com\/(?:video\/)?([0-9]+)/);
    if (match && match[1]) {
      const vId = match[1];
      return {
        type: 'vimeo',
        url: `https://player.vimeo.com/video/${vId}?autoplay=1`,
        videoId: vId
      };
    }
  }

  // 5. Direct URL or fallback
  return {
    type: 'direct',
    url: rawData
  };
}
