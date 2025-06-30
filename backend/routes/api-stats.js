const express = require('express');
const router = express.Router();
const apiUsageTracker = require('../utils/api-usage-tracker');

// 今日の利用統計を取得
router.get('/today', async (req, res) => {
  try {
    const stats = await apiUsageTracker.getTodayStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ error: 'Failed to fetch usage statistics' });
  }
});

// 週間統計を取得
router.get('/weekly', async (req, res) => {
  try {
    const stats = await apiUsageTracker.getWeeklyStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching weekly stats:', error);
    res.status(500).json({ error: 'Failed to fetch weekly statistics' });
  }
});

// 特定プロバイダーの制限チェック
router.get('/limits/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const limits = await apiUsageTracker.checkLimits(provider);
    res.json(limits);
  } catch (error) {
    console.error('Error checking limits:', error);
    res.status(500).json({ error: 'Failed to check API limits' });
  }
});

// 全プロバイダーの制限チェック
router.get('/limits', async (req, res) => {
  try {
    const providers = ['openai', 'gemini', 'youtube'];
    const allLimits = {};
    
    for (const provider of providers) {
      allLimits[provider] = await apiUsageTracker.checkLimits(provider);
    }
    
    res.json(allLimits);
  } catch (error) {
    console.error('Error checking all limits:', error);
    res.status(500).json({ error: 'Failed to check API limits' });
  }
});

// 日次統計を更新（手動トリガー）
router.post('/update-daily', async (req, res) => {
  try {
    const updated = await apiUsageTracker.updateDailyStats();
    res.json({ 
      message: 'Daily statistics updated',
      updated_records: updated
    });
  } catch (error) {
    console.error('Error updating daily stats:', error);
    res.status(500).json({ error: 'Failed to update daily statistics' });
  }
});

module.exports = router;