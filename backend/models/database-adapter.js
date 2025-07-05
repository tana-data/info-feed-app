const path = require('path');

class DatabaseAdapter {
  constructor() {
    this.dbType = process.env.DATABASE_TYPE || 'sqlite';
    this.db = null;
    this.init();
  }

  init() {
    if (this.dbType === 'postgresql') {
      this.initPostgreSQL();
    } else {
      this.initSQLite();
    }
  }

  initSQLite() {
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../newsfeeder.db');
    this.db = new sqlite3.Database(dbPath);
    console.log('SQLite database initialized');
    this.createTables();
  }

  initPostgreSQL() {
    const { Pool } = require('pg');
    
    // Railway PostgreSQL環境変数または手動設定
    const config = {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    };

    this.db = new Pool(config);
    console.log('PostgreSQL database initialized');
    this.createTablesPostgreSQL();
  }

  // SQLite用のテーブル作成
  createTables() {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS feeds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE NOT NULL,
          title TEXT,
          description TEXT,
          last_updated DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT 1
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          feed_id INTEGER NOT NULL,
          guid TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          link TEXT NOT NULL,
          description TEXT,
          pub_date DATETIME,
          content_type TEXT DEFAULT 'article',
          summary_status TEXT DEFAULT 'pending',
          summary_text TEXT,
          read_status BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (feed_id) REFERENCES feeds (id) ON DELETE CASCADE
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS summary_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          article_id INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
        )
      `);

      this.db.run(`
        CREATE TABLE IF NOT EXISTS transcript_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          video_id TEXT UNIQUE NOT NULL,
          transcript_text TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // インデックス作成
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);`);
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_articles_read_status ON articles(read_status);`);
    });
  }

  // PostgreSQL用のテーブル作成
  async createTablesPostgreSQL() {
    try {
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS feeds (
          id SERIAL PRIMARY KEY,
          url TEXT UNIQUE NOT NULL,
          title TEXT,
          description TEXT,
          last_updated TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        )
      `);

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS articles (
          id SERIAL PRIMARY KEY,
          feed_id INTEGER NOT NULL,
          guid TEXT UNIQUE NOT NULL,
          title TEXT NOT NULL,
          link TEXT NOT NULL,
          description TEXT,
          pub_date TIMESTAMP,
          content_type TEXT DEFAULT 'article',
          summary_status TEXT DEFAULT 'pending',
          summary_text TEXT,
          read_status BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (feed_id) REFERENCES feeds (id) ON DELETE CASCADE
        )
      `);

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS summary_requests (
          id SERIAL PRIMARY KEY,
          article_id INTEGER NOT NULL,
          status TEXT DEFAULT 'pending',
          error_message TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          completed_at TIMESTAMP,
          FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
        )
      `);

      await this.db.query(`
        CREATE TABLE IF NOT EXISTS transcript_cache (
          id SERIAL PRIMARY KEY,
          video_id TEXT UNIQUE NOT NULL,
          transcript_text TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // インデックス作成
      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);`);
      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_articles_pub_date ON articles(pub_date DESC);`);
      await this.db.query(`CREATE INDEX IF NOT EXISTS idx_articles_read_status ON articles(read_status);`);

      console.log('PostgreSQL tables created successfully');
    } catch (error) {
      console.error('Error creating PostgreSQL tables:', error);
    }
  }

  // 統一されたクエリインターフェース
  query(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (this.dbType === 'postgresql') {
        this.db.query(sql, params)
          .then(result => resolve(result.rows))
          .catch(reject);
      } else {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      }
    });
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (this.dbType === 'postgresql') {
        this.db.query(sql, params)
          .then(result => resolve({ 
            lastID: result.rows[0]?.id, 
            changes: result.rowCount 
          }))
          .catch(reject);
      } else {
        this.db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      }
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      if (this.dbType === 'postgresql') {
        this.db.query(sql, params)
          .then(result => resolve(result.rows[0]))
          .catch(reject);
      } else {
        this.db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }
    });
  }

  // レガシーサポート（既存コードとの互換性）
  all(sql, params, callback) {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    this.query(sql, params)
      .then(rows => callback(null, rows))
      .catch(err => callback(err));
  }

  serialize(callback) {
    if (this.dbType === 'sqlite') {
      this.db.serialize(callback);
    } else {
      // PostgreSQLの場合は即座に実行
      callback();
    }
  }
}

module.exports = new DatabaseAdapter();