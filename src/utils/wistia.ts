export function extractWistiaId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  
  // 1. Check for media-id="..." or media-id='...'
  const mediaIdMatch = trimmed.match(/media-id=["']([^"']+)["']/i);
  if (mediaIdMatch && mediaIdMatch[1]) {
    return mediaIdMatch[1].trim();
  }

  // 2. Check for embed/...js
  const jsMatch = trimmed.match(/\/embed\/([a-zA-Z0-9]+)\.js/i);
  if (jsMatch && jsMatch[1]) {
    return jsMatch[1].trim();
  }

  // 3. Check for wistia.net/embed/iframe/ID
  if (trimmed.includes('wistia.net/embed/iframe/')) {
    const parts = trimmed.split('wistia.net/embed/iframe/');
    if (parts[1]) return parts[1].split('?')[0].split('"')[0].split("'")[0].trim();
  }

  // 4. Check for wistia.com/medias/ID
  if (trimmed.includes('wistia.com/medias/')) {
    const parts = trimmed.split('wistia.com/medias/');
    if (parts[1]) return parts[1].split('?')[0].split('"')[0].split("'")[0].trim();
  }

  // 5. Check for medias/ID/swatch
  const swatchMatch = trimmed.match(/medias\/([a-zA-Z0-9]+)\/swatch/i);
  if (swatchMatch && swatchMatch[1]) {
    return swatchMatch[1].trim();
  }

  // 6. If it's raw ID or short string
  return trimmed;
}
