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
    
    // 既存のFeed（削除済み含む）をチェック
    db.get('SELECT id, is_active FROM feeds WHERE url = ?', [url], (err, existingFeed) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      console.log(`Feed registration check: URL=${url}, Existing Feed:`, existingFeed);
      
      if (existingFeed) {
        if (existingFeed.is_active === 1) {
          console.log(`Feed already active: ID=${existingFeed.id}, URL=${url}`);
          return res.status(409).json({ error: 'Feed already exists' });
        } else {
          console.log(`Reactivating deleted feed: ID=${existingFeed.id}, URL=${url}`);
          // 削除済みFeedを再アクティブ化
          db.run(
            'UPDATE feeds SET is_active = 1, title = ?, description = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            [feed.title || '', feed.description || '', existingFeed.id],
            function(err) {
              if (err) {
                return res.status(500).json({ error: err.message });
              }
              
              // 最新5記事を取得して追加
              processNewFeedArticles(existingFeed.id, url, feed.title || '', res);
            }
          );
        }
      } else {
        // 新規Feed追加
        db.run(
          'INSERT INTO feeds (url, title, description, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
          [url, feed.title || '', feed.description || ''],
          function(err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            // 最新5記事を取得して追加
            processNewFeedArticles(this.lastID, url, feed.title || '', res);
          }
        );
      }
    });
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

// Feed別記事件数確認エンドポイント
router.get('/article-stats', (req, res) => {
  db.all(`
    SELECT 
      f.id,
      f.title,
      f.url,
      COUNT(a.id) as article_count,
      MAX(a.pub_date) as latest_article_date
    FROM feeds f
    LEFT JOIN articles a ON f.id = a.feed_id
    WHERE f.is_active = 1
    GROUP BY f.id, f.title, f.url
    ORDER BY article_count DESC
  `, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const totalArticles = rows.reduce((sum, feed) => sum + feed.article_count, 0);
    
    res.json({
      feeds: rows,
      summary: {
        total_feeds: rows.length,
        total_articles: totalArticles,
        avg_articles_per_feed: Math.round(totalArticles / rows.length * 100) / 100
      }
    });
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
          
          // 最新5件のみに制限し、日付順でソート
          const sortedItems = parsedFeed.items
            .sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0))
            .slice(0, 5);

          console.log(`📊 Processing ${sortedItems.length} articles from feed: ${feed.title || feed.url}`);
          console.log(`🔍 Feed ID: ${feed.id}, Total items in RSS: ${parsedFeed.items.length}, Limited to: ${sortedItems.length}`);
          
          let newArticlesCount = 0;
          for (const item of sortedItems) {
            const guid = item.guid || item.link;
            const contentType = detectContentType(item.link);
            
            // 既存記事チェック（より厳密な重複防止）
            const existingArticle = await new Promise((resolve, reject) => {
              db.get(
                'SELECT id FROM articles WHERE guid = ? OR (link = ? AND feed_id = ?)',
                [guid, item.link, feed.id],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });

            if (!existingArticle) {
              await new Promise((resolve, reject) => {
                db.run(
                  `INSERT INTO articles 
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
                  ],
                  function(err) {
                    if (err) reject(err);
                    else {
                      newArticlesCount++;
                      resolve();
                    }
                  }
                );
              });
            }
          }
          
          console.log(`✅ Added ${newArticlesCount} new articles from feed: ${feed.title || feed.url}`);
          console.log(`📈 Feed ${feed.id} summary: ${sortedItems.length} processed, ${newArticlesCount} new articles added`);
          
          db.run('UPDATE feeds SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [feed.id]);
          processedCount++;
        } catch (feedError) {
          console.error(`Error processing feed ${feed.url}:`, feedError);
        }
      }
      
      res.json({ 
        message: `Processed ${processedCount} feeds`,
        processedCount,
        details: 'Limited to latest 5 articles per feed with duplicate prevention'
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to refresh feeds' });
  }
});

// 新規Feed追加時の記事処理（最新5件のみ）
async function processNewFeedArticles(feedId, feedUrl, feedTitle, res) {
  try {
    const parsedFeed = await parser.parseURL(feedUrl);
    
    // 最新5件のみに制限し、日付順でソート
    const sortedItems = parsedFeed.items
      .sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0))
      .slice(0, 5);

    console.log(`📊 Adding ${sortedItems.length} initial articles for new feed: ${feedTitle}`);
    console.log(`🔍 New Feed processing: Total items in RSS: ${parsedFeed.items.length}, Limited to: ${sortedItems.length}`);
    
    let newArticlesCount = 0;
    for (const item of sortedItems) {
      const guid = item.guid || item.link;
      const contentType = detectContentType(item.link);
      
      try {
        await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO articles 
             (feed_id, guid, title, link, description, pub_date, content_type) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              feedId,
              guid,
              item.title || '',
              item.link || '',
              item.contentSnippet || item.content || '',
              item.pubDate || item.isoDate || new Date().toISOString(),
              contentType
            ],
            function(err) {
              if (err) {
                if (err.code !== 'SQLITE_CONSTRAINT') {
                  console.error('Article insert error:', err);
                }
                resolve(); // 重複エラーは無視
              } else {
                newArticlesCount++;
                resolve();
              }
            }
          );
        });
      } catch (error) {
        console.error('Error inserting article:', error);
      }
    }
    
    console.log(`✅ Successfully added ${newArticlesCount} articles for feed: ${feedTitle}`);
    
    res.status(201).json({
      id: feedId,
      url: feedUrl,
      title: feedTitle,
      message: `Feed added successfully with ${newArticlesCount} articles`,
      articlesAdded: newArticlesCount
    });
    
  } catch (error) {
    console.error('Error processing new feed articles:', error);
    res.status(201).json({
      id: feedId,
      url: feedUrl,
      title: feedTitle,
      message: 'Feed added successfully, but failed to fetch initial articles',
      articlesAdded: 0
    });
  }
}

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