const db = require('../models/database');

/**
 * API利用量追跡・管理システム
 */
class APIUsageTracker {
  constructor() {
    this.initializeDatabase();
  }

  /**
   * データベーステーブルを初期化
   */
  initializeDatabase() {
    db.serialize(() => {
      // API利用量テーブル
      db.run(`
        CREATE TABLE IF NOT EXISTS api_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_provider TEXT NOT NULL,
          api_type TEXT NOT NULL,
          tokens_used INTEGER DEFAULT 0,
          requests_count INTEGER DEFAULT 1,
          cost_estimate REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        )
      `);

      // 日次集計テーブル
      db.run(`
        CREATE TABLE IF NOT EXISTS daily_api_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          api_provider TEXT NOT NULL,
          api_type TEXT NOT NULL,
          total_requests INTEGER DEFAULT 0,
          total_tokens INTEGER DEFAULT 0,
          total_cost REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(date, api_provider, api_type)
        )
      `);

      // インデックス作成
      db.run(`CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(created_at)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON api_usage(api_provider)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_api_stats(date)`);
    });
  }

  /**
   * API利用を記録
   * @param {string} provider - API提供者 (openai, gemini, youtube)
   * @param {string} type - API種類 (gpt-3.5-turbo, whisper-1, gemini-flash, youtube-data)
   * @param {Object} usage - 利用情報
   */
  async trackUsage(provider, type, usage = {}) {
    const {
      tokensUsed = 0,
      requestCount = 1,
      costEstimate = 0,
      metadata = {}
    } = usage;

    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO api_usage (api_provider, api_type, tokens_used, requests_count, cost_estimate, metadata) VALUES (?, ?, ?, ?, ?, ?)',
        [provider, type, tokensUsed, requestCount, costEstimate, JSON.stringify(metadata)],
        function(err) {
          if (err) {
            console.error('API usage tracking error:', err);
            reject(err);
          } else {
            console.log(`API usage tracked: ${provider}/${type} - ${tokensUsed} tokens, ¥${costEstimate.toFixed(4)}`);
            resolve(this.lastID);
          }
        }
      );
    });
  }

  /**
   * OpenAI API利用を記録
   * @param {string} model - モデル名
   * @param {Object} response - OpenAI APIレスポンス
   */
  async trackOpenAIUsage(model, response) {
    const usage = response.usage || {};
    const totalTokens = usage.total_tokens || 0;
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;

    // 簡単なコスト計算（実際の料金は変動する可能性があります）
    const costs = {
      'gpt-3.5-turbo': { input: 0.0015 / 1000, output: 0.002 / 1000 }, // USD per token
      'whisper-1': { audio: 0.006 / 60 } // USD per second (仮定)
    };

    let costEstimate = 0;
    if (costs[model]) {
      if (model === 'whisper-1') {
        // Whisperは音声の長さベース（秒単位）
        const audioDuration = response.audioDuration || 60; // デフォルト60秒
        costEstimate = costs[model].audio * audioDuration * 150; // USD to JPY (概算)
      } else {
        // チャットモデルはトークンベース
        const inputCost = promptTokens * costs[model].input;
        const outputCost = completionTokens * costs[model].output;
        costEstimate = (inputCost + outputCost) * 150; // USD to JPY (概算)
      }
    }

    await this.trackUsage('openai', model, {
      tokensUsed: totalTokens,
      costEstimate,
      metadata: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        model
      }
    });
  }

  /**
   * Gemini API利用を記録
   * @param {string} model - モデル名
   * @param {Object} usage - 利用情報
   */
  async trackGeminiUsage(model, usage = {}) {
    const inputTokens = usage.promptTokenCount || 0;
    const outputTokens = usage.candidatesTokenCount || 0;
    const totalTokens = inputTokens + outputTokens;

    // Gemini Flash料金（概算）
    const inputCost = inputTokens * (0.075 / 1000000) * 150; // USD to JPY
    const outputCost = outputTokens * (0.3 / 1000000) * 150;
    const costEstimate = inputCost + outputCost;

    await this.trackUsage('gemini', model, {
      tokensUsed: totalTokens,
      costEstimate,
      metadata: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        model
      }
    });
  }

  /**
   * YouTube Data API利用を記録
   * @param {string} operation - 操作種類
   * @param {number} quota - 消費クォータ
   */
  async trackYouTubeUsage(operation, quota = 1) {
    // YouTube Data APIは1日10,000クォータまで無料
    await this.trackUsage('youtube', 'data-api-v3', {
      tokensUsed: quota,
      metadata: {
        operation,
        quota_consumed: quota
      }
    });
  }

  /**
   * 日次統計を更新
   */
  async updateDailyStats() {
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO daily_api_stats (date, api_provider, api_type, total_requests, total_tokens, total_cost)
        SELECT 
          DATE(created_at) as date,
          api_provider,
          api_type,
          SUM(requests_count) as total_requests,
          SUM(tokens_used) as total_tokens,
          SUM(cost_estimate) as total_cost
        FROM api_usage 
        WHERE DATE(created_at) = ?
        GROUP BY DATE(created_at), api_provider, api_type
      `, [today], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve(this.changes);
        }
      });
    });
  }

  /**
   * 今日の利用統計を取得
   * @returns {Promise<Object>} 今日の統計
   */
  async getTodayStats() {
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          api_provider,
          api_type,
          SUM(requests_count) as requests,
          SUM(tokens_used) as tokens,
          SUM(cost_estimate) as cost
        FROM api_usage 
        WHERE DATE(created_at) = ?
        GROUP BY api_provider, api_type
        ORDER BY cost DESC
      `, [today], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const stats = {
            totalRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            byProvider: {}
          };

          rows.forEach(row => {
            stats.totalRequests += row.requests;
            stats.totalTokens += row.tokens;
            stats.totalCost += row.cost;

            if (!stats.byProvider[row.api_provider]) {
              stats.byProvider[row.api_provider] = {
                requests: 0,
                tokens: 0,
                cost: 0,
                types: {}
              };
            }

            stats.byProvider[row.api_provider].requests += row.requests;
            stats.byProvider[row.api_provider].tokens += row.tokens;
            stats.byProvider[row.api_provider].cost += row.cost;
            stats.byProvider[row.api_provider].types[row.api_type] = {
              requests: row.requests,
              tokens: row.tokens,
              cost: row.cost
            };
          });

          resolve(stats);
        }
      });
    });
  }

  /**
   * 週間統計を取得
   * @returns {Promise<Array>} 過去7日間の統計
   */
  async getWeeklyStats() {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          DATE(created_at) as date,
          SUM(requests_count) as requests,
          SUM(tokens_used) as tokens,
          SUM(cost_estimate) as cost
        FROM api_usage 
        WHERE created_at >= datetime('now', '-7 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 利用制限チェック
   * @param {string} provider - API提供者
   * @returns {Promise<Object>} 制限状況
   */
  async checkLimits(provider) {
    const today = new Date().toISOString().split('T')[0];
    
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          SUM(requests_count) as daily_requests,
          SUM(tokens_used) as daily_tokens,
          SUM(cost_estimate) as daily_cost
        FROM api_usage 
        WHERE api_provider = ? AND DATE(created_at) = ?
      `, [provider, today], (err, row) => {
        if (err) {
          reject(err);
        } else {
          const limits = {
            openai: { requests: 3000, tokens: 1000000, cost: 1000 }, // 1日の制限例
            gemini: { requests: 1500, tokens: 2000000, cost: 500 },
            youtube: { requests: 10000, tokens: 10000, cost: 0 }
          };

          const providerLimits = limits[provider] || { requests: 1000, tokens: 100000, cost: 100 };
          const usage = row || { daily_requests: 0, daily_tokens: 0, daily_cost: 0 };

          resolve({
            provider,
            usage: {
              requests: usage.daily_requests || 0,
              tokens: usage.daily_tokens || 0,
              cost: usage.daily_cost || 0
            },
            limits: providerLimits,
            percentUsed: {
              requests: ((usage.daily_requests || 0) / providerLimits.requests) * 100,
              tokens: ((usage.daily_tokens || 0) / providerLimits.tokens) * 100,
              cost: ((usage.daily_cost || 0) / providerLimits.cost) * 100
            },
            exceeded: {
              requests: (usage.daily_requests || 0) >= providerLimits.requests,
              tokens: (usage.daily_tokens || 0) >= providerLimits.tokens,
              cost: (usage.daily_cost || 0) >= providerLimits.cost
            }
          });
        }
      });
    });
  }
}

module.exports = new APIUsageTracker();