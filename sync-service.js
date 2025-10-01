const supabase = require('./supabase-client');
const sqlite3 = require('sqlite3').verbose();

class SyncService {
  constructor(localDb) {
    this.localDb = localDb;
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSyncTime = null; // Track last sync timestamp
    this.syncIntervalMs = 3000; // Sync every 3 seconds
  }

  // Initialize sync service
  start() {
    if (!supabase) {
      console.log('Cloud sync disabled - no Supabase configuration');
      return;
    }

    console.log(`Starting sync service (syncing every ${this.syncIntervalMs / 1000} seconds)...`);

    // Initial sync
    this.sync();

    // Set up periodic sync
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.syncIntervalMs);
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('Sync service stopped');
    }
  }

  // Main sync function - bidirectional sync
  async sync() {
    if (this.isSyncing || !supabase) return;

    this.isSyncing = true;

    try {
      // IMPORTANT: Sync essays first, then versions (to avoid foreign key violations)
      await this.syncEssays();
      await this.syncVersions();

      this.lastSyncTime = Date.now();
    } catch (error) {
      console.error('Sync error:', error.message);
    } finally {
      this.isSyncing = false;
    }
  }

  // Sync essays table
  async syncEssays() {
    try {
      // 1. Push local changes to cloud (essays modified since last sync)
      await this.pushEssaysToCloud();

      // 2. Pull cloud changes to local (essays modified by other clients)
      await this.pullEssaysFromCloud();
    } catch (error) {
      console.error('Error syncing essays:', error.message);
    }
  }

  // Push local essays to cloud
  async pushEssaysToCloud() {
    return new Promise((resolve, reject) => {
      // Only get essays modified since last sync
      let query = 'SELECT * FROM essays';
      const params = [];

      if (this.lastSyncTime) {
        query += ' WHERE updated_at > ?';
        params.push(new Date(this.lastSyncTime).toISOString());
      }

      this.localDb.all(query, params, async (err, localEssays) => {
        if (err) {
          reject(err);
          return;
        }

        if (localEssays.length === 0) {
          resolve();
          return;
        }

        console.log(`Syncing ${localEssays.length} changed essay(s) to cloud...`);

        try {
          for (const essay of localEssays) {
            // Check if essay exists in cloud
            const { data: cloudEssay, error: fetchError } = await supabase
              .from('essays')
              .select('*')
              .eq('id', essay.id)
              .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
              // PGRST116 means not found, which is ok
              console.error('Error fetching essay from cloud:', fetchError);
              continue;
            }

            const essayData = {
              title: essay.title,
              content: essay.content,
              prompt: essay.prompt || '',
              tags: essay.tags || '',
              created_at: essay.created_at,
              updated_at: essay.updated_at,
              deleted_at: essay.deleted_at
            };

            if (!cloudEssay) {
              // Essay doesn't exist in cloud, insert it with explicit ID
              console.log(`Inserting essay ${essay.id} to cloud: "${essay.title}"`);
              const { data, error: insertError } = await supabase
                .from('essays')
                .insert([{ id: essay.id, ...essayData }])
                .select();

              if (insertError) {
                console.error(`Error inserting essay ${essay.id} to cloud:`, insertError);
              } else {
                console.log(`Successfully inserted essay ${essay.id} to cloud`);
              }
            } else if (new Date(essay.updated_at) > new Date(cloudEssay.updated_at)) {
              // Local version is newer, update cloud
              console.log(`Updating essay ${essay.id} in cloud: "${essay.title}"`);
              const { error: updateError } = await supabase
                .from('essays')
                .update(essayData)
                .eq('id', essay.id);

              if (updateError) {
                console.error('Error updating essay in cloud:', updateError);
              } else {
                console.log(`Successfully updated essay ${essay.id} in cloud`);
              }
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Pull cloud essays to local
  async pullEssaysFromCloud() {
    try {
      // Get all cloud essays
      const { data: cloudEssays, error } = await supabase
        .from('essays')
        .select('*');

      if (error) {
        console.error('Error fetching essays from cloud:', error);
        return;
      }

      // Update local database with cloud essays
      for (const essay of cloudEssays) {
        await new Promise((resolve, reject) => {
          // Check if essay exists locally
          this.localDb.get('SELECT * FROM essays WHERE id = ?', [essay.id], (err, localEssay) => {
            if (err) {
              reject(err);
              return;
            }

            if (!localEssay) {
              // Essay doesn't exist locally, insert it
              this.localDb.run(
                `INSERT INTO essays (id, title, content, prompt, tags, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [essay.id, essay.title, essay.content, essay.prompt || '', essay.tags || '',
                 essay.created_at, essay.updated_at, essay.deleted_at],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            } else if (new Date(essay.updated_at) > new Date(localEssay.updated_at)) {
              // Cloud version is newer, update local
              this.localDb.run(
                `UPDATE essays
                 SET title = ?, content = ?, prompt = ?, tags = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ?`,
                [essay.title, essay.content, essay.prompt || '', essay.tags || '',
                 essay.updated_at, essay.deleted_at, essay.id],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.error('Error pulling essays from cloud:', error);
    }
  }

  // Sync versions table
  async syncVersions() {
    try {
      // 1. Push local versions to cloud
      await this.pushVersionsToCloud();

      // 2. Pull cloud versions to local
      await this.pullVersionsFromCloud();
    } catch (error) {
      console.error('Error syncing versions:', error.message);
    }
  }

  // Push local versions to cloud
  async pushVersionsToCloud() {
    return new Promise((resolve, reject) => {
      // Only get versions created since last sync
      let query = 'SELECT * FROM essay_versions';
      const params = [];

      if (this.lastSyncTime) {
        query += ' WHERE created_at > ?';
        params.push(new Date(this.lastSyncTime).toISOString());
      }

      this.localDb.all(query, params, async (err, localVersions) => {
        if (err) {
          reject(err);
          return;
        }

        if (localVersions.length === 0) {
          resolve();
          return;
        }

        console.log(`Syncing ${localVersions.length} new version(s) to cloud...`);

        try {
          for (const version of localVersions) {
            // First check if the parent essay exists in cloud
            const { data: parentEssay, error: essayCheckError } = await supabase
              .from('essays')
              .select('id')
              .eq('id', version.essay_id)
              .single();

            if (essayCheckError || !parentEssay) {
              // Parent essay doesn't exist in cloud, skip this version
              console.log(`Skipping version ${version.id} - parent essay ${version.essay_id} not in cloud`);
              continue;
            }

            // Check if version exists in cloud
            const { data: cloudVersion, error: fetchError } = await supabase
              .from('essay_versions')
              .select('*')
              .eq('id', version.id)
              .single();

            if (fetchError && fetchError.code !== 'PGRST116') {
              console.error('Error fetching version from cloud:', fetchError);
              continue;
            }

            const versionData = {
              id: version.id,
              essay_id: version.essay_id,
              title: version.title,
              content: version.content,
              prompt: version.prompt || null,
              tags: version.tags || null,
              changes_only: version.changes_only || null,
              created_at: version.created_at
            };

            if (!cloudVersion) {
              // Version doesn't exist in cloud, insert it
              const { error: insertError } = await supabase
                .from('essay_versions')
                .insert([versionData]);

              if (insertError) {
                console.error('Error inserting version to cloud:', insertError);
              }
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  // Pull cloud versions to local
  async pullVersionsFromCloud() {
    try {
      const { data: cloudVersions, error } = await supabase
        .from('essay_versions')
        .select('*');

      if (error) {
        console.error('Error fetching versions from cloud:', error);
        return;
      }

      for (const version of cloudVersions) {
        await new Promise((resolve, reject) => {
          this.localDb.get('SELECT * FROM essay_versions WHERE id = ?', [version.id], (err, localVersion) => {
            if (err) {
              reject(err);
              return;
            }

            if (!localVersion) {
              // Version doesn't exist locally, insert it
              this.localDb.run(
                `INSERT INTO essay_versions (id, essay_id, title, content, prompt, tags, changes_only, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [version.id, version.essay_id, version.title, version.content,
                 version.prompt, version.tags, version.changes_only, version.created_at],
                (err) => {
                  if (err) reject(err);
                  else resolve();
                }
              );
            } else {
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.error('Error pulling versions from cloud:', error);
    }
  }

  // Manually trigger a sync (called after local changes)
  triggerSync() {
    if (!this.isSyncing) {
      // Debounce: only sync if enough time has passed since last sync
      const timeSinceLastSync = Date.now() - this.lastSyncTime;
      if (timeSinceLastSync > 1000) { // At least 1 second between syncs
        this.sync();
      }
    }
  }
}

module.exports = SyncService;
