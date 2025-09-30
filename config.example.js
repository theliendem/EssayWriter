// Environment Configuration Example
// Copy this to .env file and update with your values

module.exports = {
	// Database Configuration
	DATABASE_TYPE: process.env.DATABASE_TYPE || 'sqlite', // 'sqlite' or 'postgresql'
	DATABASE_URL: process.env.DATABASE_URL || '', // For PostgreSQL/Cloud databases

	// AI Configuration
	GROQ_API_KEY: process.env.GROQ_API_KEY || '',

	// Server Configuration
	PORT: process.env.PORT || 3000,
	NODE_ENV: process.env.NODE_ENV || 'development'
};
