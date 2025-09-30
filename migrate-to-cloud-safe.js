#!/usr/bin/env node
/**
 * Safe migration script that handles ID conflicts and foreign key constraints
 */

const Database = require('./database');
const fs = require('fs');
const path = require('path');

async function migrateToCloudSafe() {
	console.log('🚀 Starting safe migration to cloud database...\n');

	// Check if .env file exists
	if (!fs.existsSync('.env')) {
		console.log('❌ .env file not found!');
		process.exit(1);
	}

	// Load environment variables
	require('dotenv').config();

	if (process.env.DATABASE_TYPE !== 'postgresql') {
		console.log('❌ DATABASE_TYPE is not set to "postgresql"');
		process.exit(1);
	}

	if (!process.env.DATABASE_URL) {
		console.log('❌ DATABASE_URL is not set');
		process.exit(1);
	}

	try {
		// Initialize cloud database
		console.log('📡 Connecting to cloud database...');
		const cloudDb = new Database();
		await cloudDb.initializeSchema();
		console.log('✅ Cloud database schema initialized');

		// If SQLite database exists, migrate data
		const sqlitePath = path.join(__dirname, 'essays.db');
		if (fs.existsSync(sqlitePath)) {
			console.log('📦 Found existing SQLite database, migrating data...');

			// Initialize SQLite for reading
			const sqlite3 = require('sqlite3').verbose();
			const sqliteDb = new sqlite3.Database('essays.db');

			// Get essays and versions
			const essays = await new Promise((resolve, reject) => {
				sqliteDb.all('SELECT * FROM essays ORDER BY id', (err, rows) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			const versions = await new Promise((resolve, reject) => {
				sqliteDb.all('SELECT * FROM essay_versions ORDER BY id', (err, rows) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			console.log(`📝 Found ${essays.length} essays to migrate`);
			console.log(`📚 Found ${versions.length} essay versions to migrate`);

			// Clear existing data
			console.log('🧹 Clearing existing cloud data...');
			await cloudDb.run('DELETE FROM essay_versions');
			await cloudDb.run('DELETE FROM essays');

			// Reset sequences to avoid ID conflicts
			console.log('🔄 Resetting ID sequences...');
			await cloudDb.run('ALTER SEQUENCE essays_id_seq RESTART WITH 1');
			await cloudDb.run('ALTER SEQUENCE essay_versions_id_seq RESTART WITH 1');

			// Create mapping for old IDs to new IDs
			const essayIdMap = new Map();
			let newEssayId = 1;

			// Migrate essays and create ID mapping
			console.log('📝 Migrating essays...');
			for (const essay of essays) {
				try {
					const result = await cloudDb.run(
						'INSERT INTO essays (title, content, prompt, tags, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
						[essay.title, essay.content, essay.prompt || '', essay.tags || '', essay.created_at, essay.updated_at, essay.deleted_at]
					);

					// Map old ID to new ID
					essayIdMap.set(essay.id, result.lastID);
					console.log(`  ✅ Essay "${essay.title}" migrated (${essay.id} → ${result.lastID})`);
				} catch (error) {
					console.error(`❌ Error migrating essay ${essay.id}:`, error.message);
				}
			}

			// Migrate essay versions using the ID mapping
			console.log('📚 Migrating essay versions...');
			let migratedVersions = 0;
			let skippedVersions = 0;

			for (const version of versions) {
				try {
					const newEssayId = essayIdMap.get(version.essay_id);
					if (!newEssayId) {
						console.warn(`⚠️  Skipping version ${version.id} - essay ${version.essay_id} not found`);
						skippedVersions++;
						continue;
					}

					await cloudDb.run(
						'INSERT INTO essay_versions (essay_id, title, content, prompt, tags, changes_only, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
						[newEssayId, version.title, version.content, version.prompt, version.tags, version.changes_only, version.created_at]
					);

					migratedVersions++;
					if (migratedVersions % 50 === 0) {
						console.log(`  📊 Migrated ${migratedVersions} versions...`);
					}
				} catch (error) {
					console.error(`❌ Error migrating version ${version.id}:`, error.message);
					skippedVersions++;
				}
			}

			sqliteDb.close();

			console.log('\n✅ Migration completed!');
			console.log(`📝 Essays migrated: ${essays.length}`);
			console.log(`📚 Versions migrated: ${migratedVersions}`);
			console.log(`⚠️  Versions skipped: ${skippedVersions}`);
		}

		console.log('\n🎉 Safe migration completed successfully!');
		console.log('Your EssayWriter app is now using the cloud database.');
		console.log('\nNext steps:');
		console.log('1. Test your application: npm start');
		console.log('2. Verify all essays and versions are accessible');
		console.log('3. Check that the ID mapping worked correctly');

	} catch (error) {
		console.error('❌ Migration failed:', error.message);
		console.error('Please check your database configuration and try again.');
		process.exit(1);
	}
}

// Run migration
migrateToCloudSafe();
