const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

class SmartDatabase {
  constructor() {
    this.type = 'unknown';
    this.connection = null;
    this.cloudAvailable = false;
    this.syncQueue = [];
    this.lastSyncTime = null;
    this.syncInProgress = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds

    this.init();
  }

  async init() {
    console.log('🔄 Initializing smart database system...');

    try {
      // Try cloud database first
      if (await this.tryCloudConnection()) {
        this.type = 'postgresql';
        this.cloudAvailable = true;
        console.log('✅ Connected to cloud database');
      } else {
        this.type = 'sqlite';
        this.cloudAvailable = false;
        console.log('📱 Using local database (cloud unavailable)');
        await this.initLocalDatabase();
      }

      // Initialize schema
      await this.initializeSchema();

      // Start sync monitoring
      this.startSyncMonitoring();

      // Add process exit handlers
      this.setupProcessHandlers();

      console.log('✅ Smart database system initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize smart database system:', error);
      // Fallback to local database
      this.type = 'sqlite';
      this.cloudAvailable = false;
      await this.initLocalDatabase();
      await this.initializeSchema();
      console.log('📱 Fallback to local database completed');
    }
  }

  async tryCloudConnection() {
    if (!process.env.DATABASE_URL) {
      console.log('⚠️  No DATABASE_URL found, using local database');
      return false;
    }

    try {
      console.log('🌐 Testing cloud database connection...');

      // Create the main connection pool directly
      this.connection = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        acquireTimeoutMillis: 10000,
        allowExitOnIdle: false
      });

      // Add error handling for the pool
      this.connection.on('error', (err) => {
        console.error('PostgreSQL pool error:', err);
        // Don't crash the app, just log the error
      });

      // Test the connection
      const client = await Promise.race([
        this.connection.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ]);

      await client.query('SELECT 1');
      client.release();

      return true;
    } catch (error) {
      console.log(`❌ Cloud connection failed: ${error.message}`);
      // Clean up the failed connection
      if (this.connection) {
        try {
          await this.connection.end();
        } catch (cleanupError) {
          console.log('Cleanup error:', cleanupError.message);
        }
        this.connection = null;
      }
      return false;
    }
  }

  async initLocalDatabase() {
    this.connection = new sqlite3.Database('essays-local.db');
    console.log('📱 Local SQLite database initialized');
  }

  // Convert PostgreSQL parameters to SQLite format
  convertParams(sql, params) {
    if (this.type === 'sqlite') {
      const convertedSql = sql.replace(/\$(\d+)/g, () => '?');
      return { sql: convertedSql, params };
    }
    return { sql, params };
  }

  // Generic query method
  async query(sql, params = []) {
    const { sql: convertedSql, params: convertedParams } = this.convertParams(sql, params);

    if (this.type === 'postgresql') {
      return new Promise((resolve, reject) => {
        this.connection.query(convertedSql, convertedParams, (err, result) => {
          if (err) {
            // If cloud fails, try to fallback to local
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'XX000') {
              console.log('🌐 Cloud connection lost, falling back to local database');
              this.fallbackToLocal();
              reject(err);
              return;
            }
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        this.connection.all(convertedSql, convertedParams, (err, rows) => {
          if (err) reject(err);
          else resolve({ rows });
        });
      });
    }
  }

  // Get single row
  async get(sql, params = []) {
    const { sql: convertedSql, params: convertedParams } = this.convertParams(sql, params);

    if (this.type === 'postgresql') {
      return new Promise((resolve, reject) => {
        this.connection.query(convertedSql, convertedParams, (err, result) => {
          if (err) {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'XX000') {
              console.log('🌐 Cloud connection lost, falling back to local database');
              this.fallbackToLocal();
              reject(err);
              return;
            }
            reject(err);
          } else {
            resolve(result.rows[0] || null);
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        this.connection.get(convertedSql, convertedParams, (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        });
      });
    }
  }

  // Run query (for INSERT, UPDATE, DELETE)
  async run(sql, params = []) {
    const { sql: convertedSql, params: convertedParams } = this.convertParams(sql, params);

    if (this.type === 'postgresql') {
      return new Promise((resolve, reject) => {
        this.connection.query(convertedSql, convertedParams, (err, result) => {
          if (err) {
            if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'XX000') {
              console.log('🌐 Cloud connection lost, falling back to local database');
              this.fallbackToLocal();
              reject(err);
              return;
            }
            reject(err);
          } else {
            resolve({
              lastID: result.rows[0]?.id || result.insertId,
              changes: result.rowCount
            });
          }
        });
      });
    } else {
      return new Promise((resolve, reject) => {
        this.connection.run(convertedSql, convertedParams, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }

  async fallbackToLocal() {
    if (this.type === 'sqlite') return; // Already using local

    console.log('📱 Switching to local database...');

    try {
      // Close cloud connection
      if (this.connection && this.connection.end) {
        await this.connection.end();
      }

      // Initialize local database
      this.type = 'sqlite';
      this.cloudAvailable = false;
      await this.initLocalDatabase();
      await this.initializeSchema();

      console.log('✅ Successfully switched to local database');
    } catch (error) {
      console.error('❌ Failed to switch to local database:', error.message);
    }
  }

  async tryReconnectToCloud() {
    if (this.cloudAvailable) return true;

    console.log('🔄 Attempting to reconnect to cloud database...');

    if (await this.tryCloudConnection()) {
      this.type = 'postgresql';
      this.cloudAvailable = true;
      this.retryCount = 0;
      console.log('✅ Reconnected to cloud database');

      // Trigger sync
      this.triggerSync();
      return true;
    } else {
      this.retryCount++;
      console.log(`❌ Reconnection failed (attempt ${this.retryCount}/${this.maxRetries})`);
      return false;
    }
  }

  startSyncMonitoring() {
    // Check for cloud connection every 30 seconds
    setInterval(async () => {
      if (!this.cloudAvailable && this.retryCount < this.maxRetries) {
        await this.tryReconnectToCloud();
      }
    }, 30000);

    // Sync every 2 minutes if cloud is available
    setInterval(async () => {
      if (this.cloudAvailable && !this.syncInProgress) {
        await this.syncToCloud();
      }
    }, 120000);
  }

  async triggerSync() {
    if (this.syncInProgress) return;

    console.log('🔄 Triggering sync to cloud...');
    await this.syncToCloud();
  }

  async syncToCloud() {
    if (this.syncInProgress || !this.cloudAvailable) return;

    this.syncInProgress = true;
    console.log('🔄 Syncing local changes to cloud...');

    try {
      // Get local changes since last sync
      const lastSync = this.lastSyncTime || new Date(0);
      const localChanges = await this.getLocalChanges(lastSync);

      if (localChanges.essays.length === 0 && localChanges.versions.length === 0) {
        console.log('✅ No changes to sync');
        this.lastSyncTime = new Date();
        return;
      }

      console.log(`📝 Syncing ${localChanges.essays.length} essays and ${localChanges.versions.length} versions`);

      // Sync essays
      for (const essay of localChanges.essays) {
        await this.syncEssayToCloud(essay);
      }

      // Sync versions
      for (const version of localChanges.versions) {
        await this.syncVersionToCloud(version);
      }

      this.lastSyncTime = new Date();
      console.log('✅ Sync completed successfully');

    } catch (error) {
      console.error('❌ Sync failed:', error.message);
      // If sync fails, fallback to local
      this.fallbackToLocal();
    } finally {
      this.syncInProgress = false;
    }
  }

  async getLocalChanges(since) {
    if (this.type === 'postgresql') return { essays: [], versions: [] };

    const essays = await new Promise((resolve, reject) => {
      this.connection.all(
        'SELECT * FROM essays WHERE updated_at > ? OR created_at > ? ORDER BY updated_at',
        [since.toISOString(), since.toISOString()],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    const versions = await new Promise((resolve, reject) => {
      this.connection.all(
        'SELECT * FROM essay_versions WHERE created_at > ? ORDER BY created_at',
        [since.toISOString()],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    return { essays, versions };
  }

  async syncEssayToCloud(essay) {
    try {
      // Check if essay exists in cloud
      const existing = await this.get('SELECT id FROM essays WHERE id = $1', [essay.id]);

      if (existing) {
        // Update existing
        await this.run(
          'UPDATE essays SET title = $1, content = $2, prompt = $3, tags = $4, updated_at = $5, deleted_at = $6 WHERE id = $7',
          [essay.title, essay.content, essay.prompt, essay.tags, essay.updated_at, essay.deleted_at, essay.id]
        );
      } else {
        // Insert new
        await this.run(
          'INSERT INTO essays (id, title, content, prompt, tags, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [essay.id, essay.title, essay.content, essay.prompt, essay.tags, essay.created_at, essay.updated_at, essay.deleted_at]
        );
      }
    } catch (error) {
      console.error(`❌ Failed to sync essay ${essay.id}:`, error.message);
    }
  }

  async syncVersionToCloud(version) {
    try {
      // Check if version exists in cloud
      const existing = await this.get('SELECT id FROM essay_versions WHERE id = $1', [version.id]);

      if (!existing) {
        await this.run(
          'INSERT INTO essay_versions (id, essay_id, title, content, prompt, tags, changes_only, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
          [version.id, version.essay_id, version.title, version.content, version.prompt, version.tags, version.changes_only, version.created_at]
        );
      }
    } catch (error) {
      console.error(`❌ Failed to sync version ${version.id}:`, error.message);
    }
  }

  // Initialize database schema
  async initializeSchema() {
    const essaysTable = this.type === 'postgresql' ? `
      CREATE TABLE IF NOT EXISTS essays (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        prompt TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP DEFAULT NULL
      )
    ` : `
      CREATE TABLE IF NOT EXISTS essays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        prompt TEXT DEFAULT '',
        tags TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL
      )
    `;

    const versionsTable = this.type === 'postgresql' ? `
      CREATE TABLE IF NOT EXISTS essay_versions (
        id SERIAL PRIMARY KEY,
        essay_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        prompt TEXT,
        tags TEXT,
        changes_only TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (essay_id) REFERENCES essays (id) ON DELETE CASCADE
      )
    ` : `
      CREATE TABLE IF NOT EXISTS essay_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        essay_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        prompt TEXT,
        tags TEXT,
        changes_only TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (essay_id) REFERENCES essays (id) ON DELETE CASCADE
      )
    `;

    try {
      await this.run(essaysTable);
      await this.run(versionsTable);
      console.log('✅ Database schema initialized');
    } catch (error) {
      console.error('Error initializing database schema:', error);
      throw error;
    }
  }

  // Get connection status
  getStatus() {
    return {
      type: this.type,
      cloudAvailable: this.cloudAvailable,
      lastSync: this.lastSyncTime,
      syncInProgress: this.syncInProgress
    };
  }

  // Setup process exit handlers
  setupProcessHandlers() {
    const gracefulShutdown = async () => {
      console.log('🔄 Gracefully shutting down database connection...');
      await this.close();
      process.exit(0);
    };

    process.on('SIGINT', gracefulShutdown);
    process.on('SIGTERM', gracefulShutdown);
    process.on('exit', () => {
      if (this.connection) {
        if (this.type === 'postgresql') {
          this.connection.end();
        } else {
          this.connection.close();
        }
      }
    });
  }

  // Close connection
  async close() {
    if (this.connection) {
      try {
        if (this.type === 'postgresql') {
          await this.connection.end();
        } else {
          this.connection.close();
        }
        console.log('✅ Database connection closed');
      } catch (error) {
        console.error('Error closing database connection:', error.message);
      }
    }
  }
}

module.exports = SmartDatabase;
