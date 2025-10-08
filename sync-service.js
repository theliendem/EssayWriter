const supabase = require('./supabase-client');
const { randomBytes } = require('crypto');

class SyncService {
  constructor(localDb) {
    this.localDb = localDb;
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastPullTime = null;
    this.syncIntervalMs = 5000; // Sync every 5 seconds
    this.deviceId = this.getOrCreateDeviceId();
    this.isOnline = true;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.initialSyncDone = false;
  }

  // Get or create a unique device ID
  getOrCreateDeviceId() {
    return new Promise((resolve) => {
      this.localDb.get('SELECT value FROM sync_metadata WHERE key = ?', ['device_id'], (err, row) => {
        if (err || !row) {
          const newDeviceId = randomBytes(16).toString('hex');
          this.localDb.run(
            'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
            ['device_id', newDeviceId],
            () => resolve(newDeviceId)
          );
        } else {
          resolve(row.value);
        }
      });
    });
  }

  // Initialize database schema for new sync architecture
  async initializeSchema() {
    return new Promise((resolve, reject) => {
      this.localDb.serialize(() => {
        // Create sync metadata table
        this.localDb.run(`CREATE TABLE IF NOT EXISTS sync_metadata (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        // Create sync queue table for offline resilience
        this.localDb.run(`CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          operation TEXT NOT NULL,
          table_name TEXT NOT NULL,
          record_id INTEGER NOT NULL,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          retries INTEGER DEFAULT 0,
          last_error TEXT
        )`);

        // Add new columns to essays table
        this.localDb.run(`ALTER TABLE essays ADD COLUMN sync_version INTEGER DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding sync_version:', err.message);
          }
        });

        this.localDb.run(`ALTER TABLE essays ADD COLUMN last_synced_at DATETIME`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding last_synced_at:', err.message);
          }
        });

        this.localDb.run(`ALTER TABLE essays ADD COLUMN device_id TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding device_id:', err.message);
          }
        });

        // Add new columns to essay_versions table
        this.localDb.run(`ALTER TABLE essay_versions ADD COLUMN sync_version INTEGER DEFAULT 1`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding sync_version to versions:', err.message);
          }
        });

        this.localDb.run(`ALTER TABLE essay_versions ADD COLUMN last_synced_at DATETIME`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding last_synced_at to versions:', err.message);
          }
        });

        this.localDb.run(`ALTER TABLE essay_versions ADD COLUMN device_id TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding device_id to versions:', err.message);
          }
          resolve();
        });
      });
    });
  }

  // Start sync service
  async start() {
    // Initialize schema first
    await this.initializeSchema();

    // Ensure device ID is ready
    this.deviceId = await this.getOrCreateDeviceId();
    console.log(`Sync service device ID: ${this.deviceId}`);

    if (!supabase) {
      console.log('Cloud sync disabled - no Supabase configuration');
      return;
    }

    console.log(`Starting sync service (syncing every ${this.syncIntervalMs / 1000} seconds)...`);

    // Mark all existing essays as synced to avoid initial full sync
    await this.markExistingAsSynced();

    // Pull any cloud changes on startup
    await this.pullEssays();
    await this.pullVersions();

    this.initialSyncDone = true;
    this.lastPullTime = new Date().toISOString();

    // Set up periodic sync (only pull changes from cloud periodically)
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.syncIntervalMs);
  }

  // Mark all existing local essays as already synced (prevents initial full sync)
  async markExistingAsSynced() {
    return new Promise((resolve) => {
      this.localDb.run(
        `UPDATE essays SET last_synced_at = CURRENT_TIMESTAMP WHERE last_synced_at IS NULL`,
        (err) => {
          if (err) {
            console.error('Error marking existing essays as synced:', err);
          } else {
            console.log('Marked existing local essays as synced');
          }

          this.localDb.run(
            `UPDATE essay_versions SET last_synced_at = CURRENT_TIMESTAMP WHERE last_synced_at IS NULL`,
            (err) => {
              if (err) {
                console.error('Error marking existing versions as synced:', err);
              }
              resolve();
            }
          );
        }
      );
    });
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Sync service stopped');
    }
  }

  // Check if we can connect to cloud
  async checkConnection() {
    if (!supabase) return false;

    try {
      const { error } = await supabase.from('essays').select('id').limit(1);
      if (error) {
        this.isOnline = false;
        return false;
      }
      this.isOnline = true;
      this.retryCount = 0;
      return true;
    } catch (error) {
      this.isOnline = false;
      return false;
    }
  }

  // Main sync function
  async sync() {
    if (this.isSyncing || !supabase) return;

    this.isSyncing = true;

    try {
      // Check connection health
      const isConnected = await this.checkConnection();

      if (!isConnected) {
        console.log('Offline - skipping sync');
        this.retryCount++;

        // Exponential backoff for retries
        if (this.retryCount > this.maxRetries) {
          console.log('Max retries reached, waiting for next scheduled sync');
        }

        this.isSyncing = false;
        return;
      }

      // Process sync queue first (retry failed operations)
      await this.processSyncQueue();

      // Sync essays and versions
      await this.syncEssays();
      await this.syncVersions();

      this.lastPullTime = new Date().toISOString();
    } catch (error) {
      console.error('Sync error:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }

  // Process queued sync operations
  async processSyncQueue() {
    return new Promise((resolve) => {
      this.localDb.all('SELECT * FROM sync_queue ORDER BY created_at ASC LIMIT 10', async (err, queuedOps) => {
        if (err || !queuedOps || queuedOps.length === 0) {
          resolve();
          return;
        }

        console.log(`Processing ${queuedOps.length} queued operation(s)...`);

        for (const op of queuedOps) {
          try {
            const data = JSON.parse(op.data);

            if (op.table_name === 'essays') {
              await this.pushSingleEssay(data);
            } else if (op.table_name === 'essay_versions') {
              await this.pushSingleVersion(data);
            }

            // Remove from queue on success
            this.localDb.run('DELETE FROM sync_queue WHERE id = ?', [op.id]);
          } catch (error) {
            // Update retry count and error
            this.localDb.run(
              'UPDATE sync_queue SET retries = retries + 1, last_error = ? WHERE id = ?',
              [error.message, op.id]
            );

            // Remove if too many retries
            if (op.retries >= 5) {
              console.error(`Removing queued operation ${op.id} after ${op.retries} retries`);
              this.localDb.run('DELETE FROM sync_queue WHERE id = ?', [op.id]);
            }
          }
        }

        resolve();
      });
    });
  }

  // Sync essays with Last-Write-Wins conflict resolution
  async syncEssays() {
    try {
      // Push local changes first
      await this.pushEssays();

      // Then pull cloud changes
      await this.pullEssays();
    } catch (error) {
      console.error('Error syncing essays:', error.message);
    }
  }

  // Push local essays to cloud
  async pushEssays() {
    return new Promise((resolve) => {
      // Get essays that need syncing (updated_at > last_synced_at OR last_synced_at IS NULL)
      this.localDb.all(
        `SELECT * FROM essays
         WHERE last_synced_at IS NULL
         OR updated_at > last_synced_at`,
        async (err, localEssays) => {
          if (err || !localEssays || localEssays.length === 0) {
            resolve();
            return;
          }

          console.log(`Pushing ${localEssays.length} essay(s) to cloud...`);

          for (const essay of localEssays) {
            try {
              await this.pushSingleEssay(essay);
            } catch (error) {
              // Add to queue for retry
              this.addToSyncQueue('update', 'essays', essay.id, essay);
            }
          }

          resolve();
        }
      );
    });
  }

  // Push single essay to cloud
  async pushSingleEssay(essay) {
    // Check if essay exists in cloud
    const { data: cloudEssay, error: fetchError } = await supabase
      .from('essays')
      .select('*')
      .eq('id', essay.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    const essayData = {
      title: essay.title,
      content: essay.content,
      prompt: essay.prompt || '',
      tags: essay.tags || '',
      created_at: essay.created_at,
      updated_at: essay.updated_at,
      deleted_at: essay.deleted_at,
      sync_version: essay.sync_version || 1,
      device_id: essay.device_id || this.deviceId
    };

    if (!cloudEssay) {
      // Insert new essay
      const { error: insertError } = await supabase
        .from('essays')
        .insert([{ id: essay.id, ...essayData }]);

      if (insertError) throw insertError;

      console.log(`✓ Pushed new essay ${essay.id} to cloud`);
    } else {
      // Conflict resolution: Last-Write-Wins with sync_version tiebreaker
      const shouldUpdate = this.shouldUpdateCloud(essay, cloudEssay);

      if (shouldUpdate) {
        const { error: updateError } = await supabase
          .from('essays')
          .update(essayData)
          .eq('id', essay.id);

        if (updateError) throw updateError;

        console.log(`✓ Updated essay ${essay.id} in cloud`);
      }
    }

    // Mark as synced locally
    this.localDb.run(
      'UPDATE essays SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
      [essay.id]
    );
  }

  // Determine if local version should overwrite cloud version
  shouldUpdateCloud(local, cloud) {
    const localTime = new Date(local.updated_at).getTime();
    const cloudTime = new Date(cloud.updated_at).getTime();

    // If timestamps are different, use the newer one
    if (localTime > cloudTime) return true;
    if (localTime < cloudTime) return false;

    // Same timestamp - use sync_version as tiebreaker
    const localVersion = local.sync_version || 1;
    const cloudVersion = cloud.sync_version || 1;

    return localVersion > cloudVersion;
  }

  // Pull cloud essays to local
  async pullEssays() {
    try {
      let query = supabase.from('essays').select('*');

      // Only get essays modified since last pull
      if (this.lastPullTime) {
        query = query.gt('updated_at', this.lastPullTime);
      }

      const { data: cloudEssays, error } = await query;

      if (error) throw error;

      if (!cloudEssays || cloudEssays.length === 0) {
        return;
      }

      console.log(`Pulling ${cloudEssays.length} essay(s) from cloud...`);

      for (const cloudEssay of cloudEssays) {
        await new Promise((resolve, reject) => {
          this.localDb.get('SELECT * FROM essays WHERE id = ?', [cloudEssay.id], (err, localEssay) => {
            if (err) {
              reject(err);
              return;
            }

            if (!localEssay) {
              // Insert new essay from cloud
              this.localDb.run(
                `INSERT INTO essays (id, title, content, prompt, tags, created_at, updated_at, deleted_at, sync_version, device_id, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                  cloudEssay.id, cloudEssay.title, cloudEssay.content,
                  cloudEssay.prompt || '', cloudEssay.tags || '',
                  cloudEssay.created_at, cloudEssay.updated_at, cloudEssay.deleted_at,
                  cloudEssay.sync_version || 1, cloudEssay.device_id
                ],
                (err) => {
                  if (err) reject(err);
                  else {
                    console.log(`✓ Pulled new essay ${cloudEssay.id} from cloud`);
                    resolve();
                  }
                }
              );
            } else {
              // Check if cloud version is newer
              const shouldUpdate = !this.shouldUpdateCloud(localEssay, cloudEssay);

              if (shouldUpdate) {
                this.localDb.run(
                  `UPDATE essays
                   SET title = ?, content = ?, prompt = ?, tags = ?,
                       updated_at = ?, deleted_at = ?, sync_version = ?,
                       device_id = ?, last_synced_at = CURRENT_TIMESTAMP
                   WHERE id = ?`,
                  [
                    cloudEssay.title, cloudEssay.content, cloudEssay.prompt || '',
                    cloudEssay.tags || '', cloudEssay.updated_at, cloudEssay.deleted_at,
                    cloudEssay.sync_version || 1, cloudEssay.device_id, cloudEssay.id
                  ],
                  (err) => {
                    if (err) reject(err);
                    else {
                      console.log(`✓ Updated essay ${cloudEssay.id} from cloud`);
                      resolve();
                    }
                  }
                );
              } else {
                resolve();
              }
            }
          });
        });
      }
    } catch (error) {
      console.error('Error pulling essays from cloud:', error.message);
    }
  }

  // Sync versions
  async syncVersions() {
    try {
      await this.pushVersions();
      await this.pullVersions();
    } catch (error) {
      console.error('Error syncing versions:', error.message);
    }
  }

  // Push local versions to cloud
  async pushVersions() {
    return new Promise((resolve) => {
      this.localDb.all(
        `SELECT * FROM essay_versions
         WHERE last_synced_at IS NULL
         OR created_at > last_synced_at`,
        async (err, localVersions) => {
          if (err || !localVersions || localVersions.length === 0) {
            resolve();
            return;
          }

          console.log(`Pushing ${localVersions.length} version(s) to cloud...`);

          for (const version of localVersions) {
            try {
              await this.pushSingleVersion(version);
            } catch (error) {
              this.addToSyncQueue('insert', 'essay_versions', version.id, version);
            }
          }

          resolve();
        }
      );
    });
  }

  // Push single version to cloud
  async pushSingleVersion(version) {
    // Check if parent essay exists in cloud
    const { data: parentEssay, error: essayCheckError } = await supabase
      .from('essays')
      .select('id')
      .eq('id', version.essay_id)
      .single();

    if (essayCheckError || !parentEssay) {
      throw new Error(`Parent essay ${version.essay_id} not in cloud`);
    }

    // Check if version already exists
    const { data: cloudVersion, error: fetchError } = await supabase
      .from('essay_versions')
      .select('*')
      .eq('id', version.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw fetchError;
    }

    if (!cloudVersion) {
      const versionData = {
        id: version.id,
        essay_id: version.essay_id,
        title: version.title,
        content: version.content,
        prompt: version.prompt || null,
        tags: version.tags || null,
        changes_only: version.changes_only || null,
        created_at: version.created_at,
        sync_version: version.sync_version || 1,
        device_id: version.device_id || this.deviceId
      };

      const { error: insertError } = await supabase
        .from('essay_versions')
        .insert([versionData]);

      if (insertError) throw insertError;

      console.log(`✓ Pushed version ${version.id} to cloud`);

      // Mark as synced
      this.localDb.run(
        'UPDATE essay_versions SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?',
        [version.id]
      );
    }
  }

  // Pull cloud versions to local
  async pullVersions() {
    try {
      let query = supabase.from('essay_versions').select('*');

      if (this.lastPullTime) {
        query = query.gt('created_at', this.lastPullTime);
      }

      const { data: cloudVersions, error } = await query;

      if (error) throw error;

      if (!cloudVersions || cloudVersions.length === 0) {
        return;
      }

      console.log(`Pulling ${cloudVersions.length} version(s) from cloud...`);

      for (const cloudVersion of cloudVersions) {
        await new Promise((resolve, reject) => {
          this.localDb.get('SELECT * FROM essay_versions WHERE id = ?', [cloudVersion.id], (err, localVersion) => {
            if (err) {
              reject(err);
              return;
            }

            if (!localVersion) {
              this.localDb.run(
                `INSERT INTO essay_versions (id, essay_id, title, content, prompt, tags, changes_only, created_at, sync_version, device_id, last_synced_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                  cloudVersion.id, cloudVersion.essay_id, cloudVersion.title,
                  cloudVersion.content, cloudVersion.prompt, cloudVersion.tags,
                  cloudVersion.changes_only, cloudVersion.created_at,
                  cloudVersion.sync_version || 1, cloudVersion.device_id
                ],
                (err) => {
                  if (err) reject(err);
                  else {
                    console.log(`✓ Pulled version ${cloudVersion.id} from cloud`);
                    resolve();
                  }
                }
              );
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.error('Error pulling versions from cloud:', error.message);
    }
  }

  // Add failed operation to sync queue
  addToSyncQueue(operation, tableName, recordId, data) {
    this.localDb.run(
      'INSERT INTO sync_queue (operation, table_name, record_id, data) VALUES (?, ?, ?, ?)',
      [operation, tableName, recordId, JSON.stringify(data)],
      (err) => {
        if (err) {
          console.error('Error adding to sync queue:', err.message);
        } else {
          console.log(`Added ${operation} on ${tableName}:${recordId} to sync queue`);
        }
      }
    );
  }

  // Trigger immediate sync (called after local changes)
  triggerSync() {
    if (!this.isSyncing && this.isOnline) {
      setTimeout(() => this.sync(), 100);
    }
  }

  // Update essay with sync metadata
  updateEssayWithSyncMetadata(essayId, callback) {
    this.localDb.run(
      `UPDATE essays
       SET sync_version = sync_version + 1,
           device_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [this.deviceId, essayId],
      callback
    );
  }
}

module.exports = SyncService;
