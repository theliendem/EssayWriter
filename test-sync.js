// Simple test to check if sync is working
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('essays.db');

console.log('=== Checking local essays ===');
db.all('SELECT id, title, updated_at, last_synced_at FROM essays ORDER BY updated_at DESC LIMIT 5', (err, rows) => {
  if (err) {
    console.error('Error:', err);
    return;
  }

  console.log('\nLatest 5 essays:');
  rows.forEach(row => {
    console.log(`ID: ${row.id}`);
    console.log(`  Title: ${row.title}`);
    console.log(`  Updated: ${row.updated_at}`);
    console.log(`  Last Synced: ${row.last_synced_at}`);
    console.log(`  Needs sync: ${!row.last_synced_at || new Date(row.updated_at) > new Date(row.last_synced_at)}`);
    console.log('');
  });

  db.close();
});
