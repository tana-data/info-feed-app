const express = require('express');
const router = express.Router();
const db = require('../models/database');
const fs = require('fs');
const path = require('path');

// フィードデータのバックアップエンドポイント
router.get('/feeds', (req, res) => {
  db.all('SELECT * FROM feeds WHERE is_active = 1', (err, feeds) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const backup = {
      timestamp: new Date().toISOString(),
      version: require('../../package.json').version,
      feeds: feeds
    };
    
    res.json(backup);
  });
});

// フィードデータのリストアエンドポイント
router.post('/feeds/restore', (req, res) => {
  const { feeds } = req.body;
  
  if (!feeds || !Array.isArray(feeds)) {
    return res.status(400).json({ error: 'Invalid backup data. Expected feeds array.' });
  }
  
  let restoredCount = 0;
  let errorCount = 0;
  const errors = [];
  
  // Process each feed in the backup
  const processFeeds = async () => {
    for (const feed of feeds) {
      try {
        await new Promise((resolve, reject) => {
          // Check if feed already exists
          db.get('SELECT id FROM feeds WHERE url = ?', [feed.url], (err, existingFeed) => {
            if (err) {
              errors.push(`Error checking feed ${feed.url}: ${err.message}`);
              errorCount++;
              resolve();
              return;
            }
            
            if (existingFeed) {
              // Update existing feed to active
              db.run(
                'UPDATE feeds SET is_active = 1, title = ?, description = ? WHERE url = ?',
                [feed.title, feed.description, feed.url],
                function(updateErr) {
                  if (updateErr) {
                    errors.push(`Error updating feed ${feed.url}: ${updateErr.message}`);
                    errorCount++;
                  } else if (this.changes > 0) {
                    restoredCount++;
                  }
                  resolve();
                }
              );
            } else {
              // Insert new feed
              db.run(
                'INSERT INTO feeds (url, title, description, is_active) VALUES (?, ?, ?, 1)',
                [feed.url, feed.title, feed.description],
                function(insertErr) {
                  if (insertErr) {
                    errors.push(`Error inserting feed ${feed.url}: ${insertErr.message}`);
                    errorCount++;
                  } else {
                    restoredCount++;
                  }
                  resolve();
                }
              );
            }
          });
        });
      } catch (error) {
        errors.push(`Unexpected error processing feed ${feed.url}: ${error.message}`);
        errorCount++;
      }
    }
    
    res.json({
      message: `Restore completed: ${restoredCount} feeds restored, ${errorCount} errors`,
      restoredCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    });
  };
  
  processFeeds().catch(error => {
    res.status(500).json({
      error: 'Restore process failed',
      message: error.message
    });
  });
});

// システム情報の取得
router.get('/info', (req, res) => {
  const dbAdapter = require('../models/database');
  
  db.get('SELECT COUNT(*) as feed_count FROM feeds WHERE is_active = 1', (err, feedResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    db.get('SELECT COUNT(*) as article_count FROM articles', (err, articleResult) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      res.json({
        version: require('../../package.json').version,
        database: {
          type: dbAdapter.dbType || 'unknown',
          feeds: feedResult.feed_count,
          articles: articleResult.article_count
        },
        environment: {
          node_env: process.env.NODE_ENV,
          railway: !!process.env.RAILWAY_ENVIRONMENT,
          database_url_set: !!process.env.DATABASE_URL
        },
        timestamp: new Date().toISOString()
      });
    });
  });
});

module.exports = router;