const express = require('express');
const router = express.Router();
const db = require('../models/database');
const Parser = require('rss-parser');
const parser = new Parser();

router.get('/', (req, res) => {
  db.all('SELECT * FROM feeds WHERE is_active = 1 ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

router.post('/', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    const feed = await parser.parseURL(url);
    
    db.run(
      'INSERT INTO feeds (url, title, description, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [url, feed.title || '', feed.description || ''],
      function(err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            return res.status(409).json({ error: 'Feed already exists' });
          }
          return res.status(500).json({ error: err.message });
        }
        
        res.status(201).json({
          id: this.lastID,
          url,
          title: feed.title || '',
          description: feed.description || '',
          message: 'Feed added successfully'
        });
      }
    );
  } catch (error) {
    res.status(400).json({ error: 'Invalid RSS feed URL or unable to parse feed' });
  }
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  
  db.run('UPDATE feeds SET is_active = 0 WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Feed not found' });
    }
    
    res.json({ message: 'Feed deleted successfully' });
  });
});

router.post('/refresh', async (req, res) => {
  try {
    db.all('SELECT * FROM feeds WHERE is_active = 1', async (err, feeds) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      let processedCount = 0;
      for (const feed of feeds) {
        try {
          const parsedFeed = await parser.parseURL(feed.url);
          
          for (const item of parsedFeed.items) {
            const guid = item.guid || item.link;
            const contentType = detectContentType(item.link);
            
            db.run(
              `INSERT OR IGNORE INTO articles 
               (feed_id, guid, title, link, description, pub_date, content_type) 
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                feed.id,
                guid,
                item.title || '',
                item.link || '',
                item.contentSnippet || item.content || '',
                item.pubDate || item.isoDate || new Date().toISOString(),
                contentType
              ]
            );
          }
          
          db.run('UPDATE feeds SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [feed.id]);
          processedCount++;
        } catch (feedError) {
          console.error(`Error processing feed ${feed.url}:`, feedError);
        }
      }
      
      res.json({ 
        message: `Processed ${processedCount} feeds`,
        processedCount 
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh feeds' });
  }
});

function detectContentType(url) {
  if (!url) return 'article';
  
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube';
  }
  
  if (url.includes('podcast') || url.includes('anchor.fm') || url.includes('spotify.com')) {
    return 'podcast';
  }
  
  return 'article';
}

module.exports = router;