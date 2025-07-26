/**
 * Content Type Detection Utility
 * 
 * Detects content type based on URL patterns for RSS feed articles.
 * Supports YouTube, Podcast, Product Hunt, and generic article detection.
 */

/**
 * Detects the content type of a URL
 * @param {string} url - The URL to analyze
 * @returns {string} Content type: 'youtube', 'podcast', 'producthunt', or 'article'
 */
function detectContentType(url) {
  if (!url) return 'article';
  
  // YouTube detection - various URL formats
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  
  // Podcast detection - common podcast platforms
  if (url.includes('podcast') || 
      url.includes('anchor.fm') || 
      url.includes('spotify.com') ||
      url.includes('apple.com/podcasts') ||
      url.includes('soundcloud.com') ||
      url.includes('overcast.fm')) {
    return 'podcast';
  }
  
  // Product Hunt detection
  if (url.includes('producthunt.com') || url.includes('Product Hunt')) {
    return 'producthunt';
  }
  
  // Default to article for web content
  return 'article';
}

/**
 * Gets a human-readable label for content type
 * @param {string} contentType - The content type returned by detectContentType
 * @returns {string} Human-readable label
 */
function getContentTypeLabel(contentType) {
  const labels = {
    'youtube': 'YouTube動画',
    'podcast': 'Podcast',
    'producthunt': 'Product Hunt',
    'article': 'Web記事'
  };
  
  return labels[contentType] || labels['article'];
}

/**
 * Checks if a content type supports AI summarization
 * @param {string} contentType - The content type
 * @returns {boolean} True if summarization is supported
 */
function supportsSummarization(contentType) {
  return ['youtube', 'podcast', 'article'].includes(contentType);
}

/**
 * Gets the icon/emoji for a content type
 * @param {string} contentType - The content type
 * @returns {string} Emoji icon
 */
function getContentTypeIcon(contentType) {
  const icons = {
    'youtube': '📺',
    'podcast': '🎧',
    'producthunt': '🚀',
    'article': '📄'
  };
  
  return icons[contentType] || icons['article'];
}

module.exports = {
  detectContentType,
  getContentTypeLabel,
  supportsSummarization,
  getContentTypeIcon
};