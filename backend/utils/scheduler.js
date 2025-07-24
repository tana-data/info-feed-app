const cron = require('node-cron');
const db = require('../models/database');
const Parser = require('rss-parser');
const productHuntClient = require('./producthunt-client');
const parser = new Parser();

let scheduledTasks = [];

function startScheduler() {
  console.log('Starting RSS feed scheduler...');
  
  const dailyTask = cron.schedule('0 8 * * *', () => {
    console.log('Running daily RSS feed update...');
    updateAllFeeds();
  }, {
    scheduled: false,
    timezone: "Asia/Tokyo"
  });
  
  const weeklyTask = cron.schedule('0 8 * * 1', () => {
    console.log('Running weekly RSS feed update...');
    updateAllFeeds();
  }, {
    scheduled: false,
    timezone: "Asia/Tokyo"
  });
  
  // Product Hunt top apps collection every Sunday at 8:00 AM JST
  const productHuntTask = cron.schedule('0 8 * * 0', () => {
    console.log('Running Product Hunt top apps collection...');
    updateProductHuntApps();
  }, {
    scheduled: true,
    timezone: "Asia/Tokyo"
  });
  
  scheduledTasks.push({ name: 'daily', task: dailyTask });
  scheduledTasks.push({ name: 'weekly', task: weeklyTask });
  scheduledTasks.push({ name: 'producthunt', task: productHuntTask });
  
  const defaultSchedule = process.env.RSS_SCHEDULE || 'daily';
  setSchedule(defaultSchedule);
}

function setSchedule(schedule) {
  scheduledTasks.forEach(({ task }) => task.stop());
  
  const activeTask = scheduledTasks.find(({ name }) => name === schedule);
  if (activeTask) {
    activeTask.task.start();
    console.log(`RSS feed scheduler set to: ${schedule}`);
  } else {
    console.log(`Unknown schedule: ${schedule}. Available: daily, weekly`);
  }
}

function stopScheduler() {
  scheduledTasks.forEach(({ task }) => task.stop());
  console.log('RSS feed scheduler stopped');
}

async function updateAllFeeds() {
  try {
    db.all('SELECT * FROM feeds WHERE is_active = 1', async (err, feeds) => {
      if (err) {
        console.error('Error fetching feeds:', err);
        return;
      }

      console.log(`Updating ${feeds.length} feeds...`);
      let processedCount = 0;
      let errorCount = 0;

      for (const feed of feeds) {
        try {
          const result = await updateSingleFeed(feed);
          if (result.success) {
            processedCount++;
            console.log(`✓ Updated feed: ${feed.title || feed.url} (${result.newArticles} new articles)`);
          } else {
            errorCount++;
            console.error(`✗ Failed to update feed: ${feed.title || feed.url} - ${result.error}`);
          }
        } catch (error) {
          errorCount++;
          console.error(`✗ Error updating feed ${feed.url}:`, error.message);
        }
      }

      console.log(`Feed update completed: ${processedCount} successful, ${errorCount} errors`);
    });
  } catch (error) {
    console.error('Error in updateAllFeeds:', error);
  }
}

async function updateSingleFeed(feed) {
  try {
    const parsedFeed = await parser.parseURL(feed.url);
    let newArticles = 0;
    
    // 各フィードから最新10件のみ取得
    const recentItems = parsedFeed.items.slice(0, 10);
    
    for (const item of recentItems) {
      const guid = item.guid || item.link;
      const contentType = detectContentType(item.link);
      
      await new Promise((resolve, reject) => {
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
          ],
          function(err) {
            if (err) {
              reject(err);
            } else {
              if (this.changes > 0) {
                newArticles++;
              }
              resolve();
            }
          }
        );
      });
    }
    
    await new Promise((resolve, reject) => {
      db.run('UPDATE feeds SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [feed.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    return { success: true, newArticles };
  } catch (error) {
    return { success: false, error: error.message };
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

function getSchedulerStatus() {
  const activeTasks = scheduledTasks.filter(({ task }) => task.running);
  return {
    isRunning: activeTasks.length > 0,
    activeSchedules: activeTasks.map(({ name }) => name),
    allTasks: scheduledTasks.map(({ name, task }) => ({
      name,
      status: task.running ? 'running' : 'stopped'
    }))
  };
}

async function updateProductHuntApps() {
  try {
    console.log('Fetching Product Hunt top apps...');
    
    // Check if API client credentials are properly configured before proceeding
    const clientId = process.env.PRODUCTHUNT_CLIENT_ID;
    const clientSecret = process.env.PRODUCTHUNT_CLIENT_SECRET;
    if (!clientId || !clientSecret || 
        clientId === 'your_client_id_here' || 
        clientSecret === 'your_client_secret_here') {
      const errorMsg = 'Product Hunt API client credentials not configured properly. Please set PRODUCTHUNT_CLIENT_ID and PRODUCTHUNT_CLIENT_SECRET in your .env file.';
      console.error('✗ Product Hunt update failed:', errorMsg);
      return { success: false, error: errorMsg };
    }
    
    // Ensure Product Hunt virtual feed exists
    await ensureProductHuntFeed();
    
    // Get the Product Hunt feed ID
    const productHuntFeed = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM feeds WHERE url = ?', ['https://producthunt.com/virtual-feed'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!productHuntFeed) {
      throw new Error('Product Hunt virtual feed not found');
    }

    // Fetch top apps from Product Hunt API
    const topApps = await productHuntClient.getFeaturedPosts(20);
    let newApps = 0;

    console.log(`Processing ${topApps.length} Product Hunt apps...`);

    for (const app of topApps) {
      await new Promise((resolve, reject) => {
        db.run(
          `INSERT OR IGNORE INTO articles 
           (feed_id, guid, title, link, description, pub_date, content_type) 
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            productHuntFeed.id,
            app.guid,
            app.title,
            app.link,
            `${app.tagline}\n\nVotes: ${app.votesCount}\nMakers: ${app.makers.map(m => m.name).join(', ')}`,
            app.pubDate,
            'producthunt'
          ],
          function(err) {
            if (err) {
              console.error('Error inserting Product Hunt app:', err);
              reject(err);
            } else {
              if (this.changes > 0) {
                newApps++;
              }
              resolve();
            }
          }
        );
      });
    }

    // Update Product Hunt feed timestamp
    await new Promise((resolve, reject) => {
      db.run('UPDATE feeds SET last_updated = CURRENT_TIMESTAMP WHERE id = ?', [productHuntFeed.id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log(`✓ Product Hunt update completed: ${newApps} new apps added`);
    return { success: true, newApps };
  } catch (error) {
    console.error('✗ Error updating Product Hunt apps:', error.message);
    return { success: false, error: error.message };
  }
}

async function ensureProductHuntFeed() {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO feeds (url, title, description, is_active) 
       VALUES (?, ?, ?, ?)`,
      [
        'https://producthunt.com/virtual-feed',
        'Product Hunt Top Apps',
        'Weekly collection of top-ranking apps from Product Hunt',
        1
      ],
      function(err) {
        if (err) {
          console.error('Error creating Product Hunt virtual feed:', err);
          reject(err);
        } else {
          if (this.changes > 0) {
            console.log('Product Hunt virtual feed created');
          }
          resolve();
        }
      }
    );
  });
}

module.exports = {
  startScheduler,
  stopScheduler,
  setSchedule,
  updateAllFeeds,
  updateProductHuntApps,
  getSchedulerStatus
};