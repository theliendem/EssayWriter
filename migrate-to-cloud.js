#!/usr/bin/env node
/**
 * Migration script to help set up cloud database
 * Run this after setting up your cloud database (Supabase, Neon, etc.)
 */

const Database = require('./database');
const fs = require('fs');
const path = require('path');

async function migrateToCloud() {
	console.log('🚀 Starting migration to cloud database...\n');

	// Check if .env file exists
	if (!fs.existsSync('.env')) {
		console.log('❌ .env file not found!');
		console.log('Please create a .env file with your database configuration.');
		console.log('Example:');
		console.log('DATABASE_TYPE=postgresql');
		console.log('DATABASE_URL=postgresql://username:password@host:port/database');
		console.log('GROQ_API_KEY=your_groq_api_key_here');
		process.exit(1);
	}

	// Load environment variables
	require('dotenv').config();

	if (process.env.DATABASE_TYPE !== 'postgresql') {
		console.log('❌ DATABASE_TYPE is not set to "postgresql"');
		console.log('Please set DATABASE_TYPE=postgresql in your .env file');
		process.exit(1);
	}

	if (!process.env.DATABASE_URL) {
		console.log('❌ DATABASE_URL is not set');
		console.log('Please set DATABASE_URL in your .env file');
		console.log('Example: postgresql://username:password@host:port/database');
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

			// Migrate essays
			const essays = await new Promise((resolve, reject) => {
				sqliteDb.all('SELECT * FROM essays', (err, rows) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			console.log(`📝 Found ${essays.length} essays to migrate`);

			// First, clear any existing data to avoid conflicts
			console.log('🧹 Clearing existing data...');
			await cloudDb.run('DELETE FROM essay_versions');
			await cloudDb.run('DELETE FROM essays');

			// Migrate essays first
			for (const essay of essays) {
				try {
					await cloudDb.run(
						'INSERT INTO essays (id, title, content, prompt, tags, created_at, updated_at, deleted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
						[essay.id, essay.title, essay.content, essay.prompt || '', essay.tags || '', essay.created_at, essay.updated_at, essay.deleted_at]
					);
				} catch (error) {
					console.error(`❌ Error migrating essay ${essay.id}:`, error.message);
					throw error;
				}
			}

			console.log('✅ Essays migrated successfully');

			// Migrate essay versions
			const versions = await new Promise((resolve, reject) => {
				sqliteDb.all('SELECT * FROM essay_versions ORDER BY created_at', (err, rows) => {
					if (err) reject(err);
					else resolve(rows);
				});
			});

			console.log(`📚 Found ${versions.length} essay versions to migrate`);

			for (const version of versions) {
				try {
					// Verify the essay exists before inserting the version
					const essayExists = await cloudDb.get('SELECT id FROM essays WHERE id = $1', [version.essay_id]);
					if (!essayExists) {
						console.warn(`⚠️  Skipping version ${version.id} - essay ${version.essay_id} not found`);
						continue;
					}

					await cloudDb.run(
						'INSERT INTO essay_versions (id, essay_id, title, content, prompt, tags, changes_only, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
						[version.id, version.essay_id, version.title, version.content, version.prompt, version.tags, version.changes_only, version.created_at]
					);
				} catch (error) {
					console.error(`❌ Error migrating version ${version.id}:`, error.message);
					// Continue with other versions instead of failing completely
					continue;
				}
			}

			sqliteDb.close();
			console.log('✅ Data migration completed');
		}

		console.log('\n🎉 Migration completed successfully!');
		console.log('Your EssayWriter app is now using the cloud database.');
		console.log('\nNext steps:');
		console.log('1. Test your application: npm start');
		console.log('2. Verify all essays and versions are accessible');
		console.log('3. Consider backing up your SQLite database before removing it');

	} catch (error) {
		console.error('❌ Migration failed:', error.message);
		console.error('Please check your database configuration and try again.');
		process.exit(1);
	}
}

// Run migration
migrateToCloud();
