const cron = require('node-cron');
const db = require('../models/database');
const Parser = require('rss-parser');
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
  
  scheduledTasks.push({ name: 'daily', task: dailyTask });
  scheduledTasks.push({ name: 'weekly', task: weeklyTask });
  
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

module.exports = {
  startScheduler,
  stopScheduler,
  setSchedule,
  updateAllFeeds,
  getSchedulerStatus
};