const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

class Database {
	constructor() {
		this.type = process.env.DATABASE_TYPE || 'sqlite';
		this.connection = null;
		this.init();
	}

	async init() {
		if (this.type === 'postgresql') {
			this.connection = new Pool({
				connectionString: process.env.DATABASE_URL,
				ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
			});
			console.log('Connected to PostgreSQL database');
		} else {
			this.connection = new sqlite3.Database('essays.db');
			console.log('Connected to SQLite database');
		}
	}

	// Convert PostgreSQL parameters to SQLite format
	convertParams(sql, params) {
		if (this.type === 'sqlite') {
			// Convert $1, $2, etc. to ?, ?, etc.
			let paramIndex = 1;
			const convertedSql = sql.replace(/\$(\d+)/g, () => '?');
			return { sql: convertedSql, params };
		}
		return { sql, params };
	}

	// Generic query method that works with both databases
	async query(sql, params = []) {
		const { sql: convertedSql, params: convertedParams } = this.convertParams(sql, params);

		if (this.type === 'postgresql') {
			return new Promise((resolve, reject) => {
				this.connection.query(convertedSql, convertedParams, (err, result) => {
					if (err) reject(err);
					else resolve(result);
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
					if (err) reject(err);
					else resolve(result.rows[0] || null);
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
					if (err) reject(err);
					else resolve({
						lastID: result.rows[0]?.id || result.insertId,
						changes: result.rowCount
					});
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
			console.log('Database schema initialized successfully');
		} catch (error) {
			console.error('Error initializing database schema:', error);
			throw error;
		}
	}

	// Close connection
	async close() {
		if (this.connection) {
			if (this.type === 'postgresql') {
				await this.connection.end();
			} else {
				this.connection.close();
			}
		}
	}
}

module.exports = Database;
