const express = require('express');
const router = express.Router();
const db = require('../models/database');
const fs = require('fs');
const path = require('path');
const { sendError, sendSuccess, handleDatabaseError } = require('../utils/response-helpers');

// フィードデータのバックアップエンドポイント
router.get('/feeds', (req, res) => {
  console.log('📥 Backup request received - fetching active feeds');
  
  db.all('SELECT * FROM feeds WHERE is_active = 1', (err, feeds) => {
    if (err) {
      console.error('❌ Database error during backup:', err);
      return handleDatabaseError(res, err, 'fetch feeds for backup');
    }
    
    console.log(`✅ Found ${feeds.length} active feeds for backup`);
    
    const backup = {
      timestamp: new Date().toISOString(),
      version: require('../../package.json').version,
      feeds: feeds
    };
    
    sendSuccess(res, backup, `Backup created with ${feeds.length} feeds`);
  });
});

// フィードデータのリストアエンドポイント
router.post('/feeds/restore', (req, res) => {
  console.log('📤 Restore request received');
  console.log('Request body:', JSON.stringify(req.body, null, 2));
  
  const { feeds } = req.body;
  
  if (!feeds || !Array.isArray(feeds)) {
    console.error('❌ Invalid backup data format:', { feeds, type: typeof feeds, isArray: Array.isArray(feeds) });
    return sendError(res, 400, 'Invalid backup data. Expected feeds array.', {
      received: typeof feeds,
      expected: 'array',
      data: feeds ? 'feeds data received but not array' : 'no feeds data received'
    });
  }
  
  console.log(`📊 Processing restore for ${feeds.length} feeds`);
  
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
    
    console.log(`✅ Restore completed: ${restoredCount} feeds restored, ${errorCount} errors`);
    
    sendSuccess(res, {
      restoredCount,
      errorCount,
      errors: errors.length > 0 ? errors : undefined
    }, `Restore completed: ${restoredCount} feeds restored, ${errorCount} errors`);
  };
  
  processFeeds().catch(error => {
    console.error('❌ Restore process failed:', error);
    sendError(res, 500, 'Restore process failed', {
      error: error.message,
      stack: error.stack
    });
  });
});

// システム情報の取得
router.get('/info', (req, res) => {
  const dbAdapter = require('../models/database');
  
  db.get('SELECT COUNT(*) as feed_count FROM feeds WHERE is_active = 1', (err, feedResult) => {
    if (err) {
      return handleDatabaseError(res, err, 'fetch feed count');
    }
    
    db.get('SELECT COUNT(*) as article_count FROM articles', (err, articleResult) => {
      if (err) {
        return handleDatabaseError(res, err, 'fetch article count');
      }
      
      sendSuccess(res, {
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
        }
      }, 'System information retrieved successfully');
    });
  });
});

module.exports = router;