require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./backend/models/database');
const scheduler = require('./backend/utils/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'info-feed-app')));

app.use('/api/feeds', require('./backend/routes/feeds'));
app.use('/api/articles', require('./backend/routes/articles'));
app.use('/api/stats', require('./backend/routes/api-stats'));

app.get('/api/scheduler/status', (req, res) => {
  res.json(scheduler.getSchedulerStatus());
});

app.post('/api/scheduler/start', (req, res) => {
  const { schedule = 'daily' } = req.body;
  scheduler.setSchedule(schedule);
  res.json({ message: `Scheduler started with ${schedule} schedule` });
});

app.post('/api/scheduler/stop', (req, res) => {
  scheduler.stopScheduler();
  res.json({ message: 'Scheduler stopped' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'info-feed-app', 'index.html'));
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

try {
  scheduler.startScheduler();
} catch (error) {
  console.error('Scheduler initialization error:', error);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend available at http://localhost:${PORT}`);
  console.log('RSS feed scheduler initialized');
}).on('error', (error) => {
  console.error('Server startup error:', error);
  process.exit(1);
});