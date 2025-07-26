/**
 * Unit tests for content-type utility module
 */

const { 
  detectContentType, 
  getContentTypeLabel, 
  supportsSummarization, 
  getContentTypeIcon 
} = require('../../backend/utils/content-type');

describe('Content Type Utility', () => {
  
  describe('detectContentType', () => {
    test('should return "article" for null/undefined URLs', () => {
      expect(detectContentType(null)).toBe('article');
      expect(detectContentType(undefined)).toBe('article');
      expect(detectContentType('')).toBe('article');
    });

    test('should detect YouTube URLs correctly', () => {
      const youtubeUrls = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtu.be/dQw4w9WgXcQ',
        'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://youtube.com/shorts/abc123'
      ];
      
      youtubeUrls.forEach(url => {
        expect(detectContentType(url)).toBe('youtube');
      });
    });

    test('should detect podcast URLs correctly', () => {
      const podcastUrls = [
        'https://anchor.fm/s/f1a556bc/podcast/rss',
        'https://open.spotify.com/show/123',
        'https://podcasts.apple.com/us/podcast/123',
        'https://soundcloud.com/user/podcast-episode',
        'https://overcast.fm/+abc123',
        'https://example.com/podcast/episode1'
      ];
      
      podcastUrls.forEach(url => {
        expect(detectContentType(url)).toBe('podcast');
      });
    });

    test('should detect Product Hunt URLs correctly', () => {
      const productHuntUrls = [
        'https://producthunt.com/posts/app-name',
        'https://www.producthunt.com/upcoming/app',
        'https://example.com/about-Product Hunt'
      ];
      
      productHuntUrls.forEach(url => {
        expect(detectContentType(url)).toBe('producthunt');
      });
    });

    test('should default to "article" for other URLs', () => {
      const articleUrls = [
        'https://techcrunch.com/article/news',
        'https://news.ycombinator.com/item?id=123',
        'https://example.com/blog/post',
        'https://medium.com/@user/article'
      ];
      
      articleUrls.forEach(url => {
        expect(detectContentType(url)).toBe('article');
      });
    });
  });

  describe('getContentTypeLabel', () => {
    test('should return correct Japanese labels', () => {
      expect(getContentTypeLabel('youtube')).toBe('YouTube動画');
      expect(getContentTypeLabel('podcast')).toBe('Podcast');
      expect(getContentTypeLabel('producthunt')).toBe('Product Hunt');
      expect(getContentTypeLabel('article')).toBe('Web記事');
    });

    test('should default to "Web記事" for unknown types', () => {
      expect(getContentTypeLabel('unknown')).toBe('Web記事');
      expect(getContentTypeLabel('')).toBe('Web記事');
      expect(getContentTypeLabel(null)).toBe('Web記事');
    });
  });

  describe('supportsSummarization', () => {
    test('should return true for supported content types', () => {
      expect(supportsSummarization('youtube')).toBe(true);
      expect(supportsSummarization('podcast')).toBe(true);
      expect(supportsSummarization('article')).toBe(true);
    });

    test('should return false for unsupported content types', () => {
      expect(supportsSummarization('producthunt')).toBe(false);
      expect(supportsSummarization('unknown')).toBe(false);
    });
  });

  describe('getContentTypeIcon', () => {
    test('should return correct emoji icons', () => {
      expect(getContentTypeIcon('youtube')).toBe('📺');
      expect(getContentTypeIcon('podcast')).toBe('🎧');
      expect(getContentTypeIcon('producthunt')).toBe('🚀');
      expect(getContentTypeIcon('article')).toBe('📄');
    });

    test('should default to article icon for unknown types', () => {
      expect(getContentTypeIcon('unknown')).toBe('📄');
      expect(getContentTypeIcon('')).toBe('📄');
      expect(getContentTypeIcon(null)).toBe('📄');
    });
  });
});