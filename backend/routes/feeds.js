const express = require('express');
const router = express.Router();
const db = require('../models/database');
const Parser = require('rss-parser');
const { updateProductHuntApps } = require('../utils/scheduler');

// RSS パーサーにタイムアウト設定を追加（20秒）
const parser = new Parser({
  timeout: 20000,
  headers: {
    'User-Agent': 'RSS Feed News Tool/1.0'
  }
});

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
  const requestId = Math.random().toString(36).substring(7);
  
  console.log(`🚀 [${requestId}] Feed registration request started:`, {
    url: url,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent')
  });
  
  if (!url) {
    console.log(`❌ [${requestId}] Missing URL parameter`);
    return res.status(400).json({ error: 'URL is required' });
  }

  // URL validation
  try {
    new URL(url);
    console.log(`✅ [${requestId}] URL format validation passed`);
  } catch (e) {
    console.log(`❌ [${requestId}] Invalid URL format:`, e.message);
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  try {
    console.log(`📡 [${requestId}] Starting RSS feed parsing for: ${url}`);
    const startTime = Date.now();
    
    const feed = await parser.parseURL(url);
    const parseTime = Date.now() - startTime;
    
    console.log(`✅ [${requestId}] RSS feed parsed successfully:`, {
      title: feed.title,
      itemCount: feed.items?.length || 0,
      parseTime: `${parseTime}ms`,
      description: feed.description?.substring(0, 100)
    });
    
    // 既存のFeed（削除済み含む）をチェック  
    console.log(`🔍 [${requestId}] Starting database feed existence check`);
    const dbStartTime = Date.now();
    
    const existingFeed = await db.get('SELECT id, is_active FROM feeds WHERE url = ?', [url]);
    const dbQueryTime = Date.now() - dbStartTime;
    console.log(`📊 [${requestId}] Database query completed in ${dbQueryTime}ms`);
    
    console.log(`🔍 [${requestId}] Feed check result: ${existingFeed ? 'EXISTS' : 'NEW'} (${existingFeed?.is_active === 1 ? 'ACTIVE' : 'INACTIVE'})`);
      
    if (existingFeed) {
      if (existingFeed.is_active === 1) {
        console.log(`ℹ️ [${requestId}] Feed already active: ID=${existingFeed.id}`);
        return res.status(409).json({ error: 'Feed already exists' });
      } else {
        console.log(`🔄 [${requestId}] Reactivating deleted feed: ID=${existingFeed.id}`);
        // 削除済みFeedを再アクティブ化
        await db.run(
          'UPDATE feeds SET is_active = 1, title = ?, description = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
          [feed.title || '', feed.description || '', existingFeed.id]
        );
        
        console.log(`✅ [${requestId}] Feed reactivated, processing initial articles`);
        // 最新5記事を取得して追加 (既に解析済みのfeedデータを渡す)
        return processNewFeedArticles(existingFeed.id, url, feed.title || '', res, requestId, feed);
      }
    } else {
      console.log(`➕ [${requestId}] Adding new feed to database`);
      const insertStartTime = Date.now();
      
      // 新規Feed追加
      const result = await db.run(
        'INSERT INTO feeds (url, title, description, last_updated) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [url, feed.title || '', feed.description || '']
      );
      
      const insertTime = Date.now() - insertStartTime;
      console.log(`📊 [${requestId}] Feed insert completed in ${insertTime}ms`);
      
      const feedId = result.lastID;
      console.log(`✅ [${requestId}] New feed inserted with ID: ${feedId}, starting article processing`);
      // 最新5記事を取得して追加 (既に解析済みのfeedデータを渡す)
      return processNewFeedArticles(feedId, url, feed.title || '', res, requestId, feed);
    }
  } catch (error) {
    console.error(`❌ [${requestId}] RSS parsing failed:`, {
      url: url,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    let errorMessage = 'Invalid RSS feed URL or unable to parse feed';
    if (error.message.includes('timeout')) {
      errorMessage = 'RSS feed request timed out. Please try again.';
    } else if (error.message.includes('ENOTFOUND')) {
      errorMessage = 'RSS feed URL not found. Please check the URL.';
    } else if (error.message.includes('ECONNREFUSED')) {
      errorMessage = 'Connection refused. The server may be down.';
    }
    
    res.status(400).json({ error: errorMessage });
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

// Product Hunt手動更新エンドポイント
router.post('/refresh-producthunt', async (req, res) => {
  try {
    console.log('Manual Product Hunt refresh requested');
    const result = await updateProductHuntApps();
    
    if (result.success) {
      res.json({
        message: `Product Hunt update completed: ${result.newApps} new apps added`,
        newApps: result.newApps
      });
    } else {
      res.status(500).json({
        error: result.error || 'Product Hunt update failed',
        message: 'Failed to update Product Hunt apps'
      });
    }
  } catch (error) {
    console.error('Product Hunt manual refresh error:', error);
    res.status(500).json({
      error: error.message || 'Product Hunt update failed',
      message: 'Failed to update Product Hunt apps'
    });
  }
});

// 新規Feed追加時の記事処理（最新5件のみ）
async function processNewFeedArticles(feedId, feedUrl, feedTitle, res, requestId, parsedFeed) {
  const startTime = Date.now();
  console.log(`🔄 [${requestId}] Starting article processing for feed: ${feedTitle} (ID: ${feedId})`);
  
  try {
    // 二重RSS解析を除去: 既に解析済みのfeedデータを使用
    console.log(`📡 [${requestId}] Using pre-parsed RSS feed data (avoiding duplicate parsing)`);
    const parseTime = 0; // 解析時間はメイン処理で計測済み
    
    // 最新5件のみに制限し、日付順でソート
    const sortedItems = parsedFeed.items
      .sort((a, b) => new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0))
      .slice(0, 5);

    console.log(`📊 [${requestId}] Processing ${sortedItems.length}/${parsedFeed.items.length} articles`);
    
    let newArticlesCount = 0;
    let errorCount = 0;
    
    // Promise-based database operations for consistency
    for (const item of sortedItems) {
      const guid = item.guid || item.link;
      const contentType = detectContentType(item.link);
      
      try {
        await db.run(
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
          ]
        );
        newArticlesCount++;
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT' || error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          // 重複は正常として扱う（カウントに含めない）
        } else {
          errorCount++;
        }
      }
    }
    
    const totalTime = Date.now() - startTime;
    console.log(`✅ [${requestId}] Completed: ${newArticlesCount} new, ${sortedItems.length - newArticlesCount - errorCount} duplicates, ${errorCount} errors (${totalTime}ms)`);
    
    res.status(201).json({
      id: feedId,
      url: feedUrl,
      title: feedTitle,
      message: `Feed added successfully with ${newArticlesCount} articles`,
      articlesAdded: newArticlesCount,
      duplicatesSkipped: sortedItems.length - newArticlesCount - errorCount,
      processingTime: totalTime
    });
    
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] Feed processing error: ${error.message} (${totalTime}ms)`);
    
    res.status(201).json({
      id: feedId,
      url: feedUrl,
      title: feedTitle,
      message: 'Feed added successfully, but failed to fetch initial articles',
      articlesAdded: 0,
      error: error.message
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
  
  if (url.includes('producthunt.com') || url.includes('Product Hunt')) {
    return 'producthunt';
  }
  
  return 'article';
}

module.exports = router;