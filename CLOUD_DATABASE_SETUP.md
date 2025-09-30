# Cloud Database Setup Guide

This guide will help you migrate your EssayWriter app from SQLite to a cloud database.

## 🎯 Recommended Cloud Database Options

### 1. **Supabase (Recommended)**
- **Free tier**: 500MB database, 2GB bandwidth
- **Pros**: Easy setup, built-in auth, real-time features, great dashboard
- **Setup**: [supabase.com](https://supabase.com)

### 2. **Neon (PostgreSQL)**
- **Free tier**: 0.5GB storage, 10GB transfer
- **Pros**: Serverless, instant branching, auto-scaling
- **Setup**: [neon.tech](https://neon.tech)

### 3. **PlanetScale (MySQL)**
- **Free tier**: 1 billion reads/month, 10M writes/month
- **Pros**: Serverless MySQL, database branching
- **Setup**: [planetscale.com](https://planetscale.com)

## 🚀 Quick Setup (Supabase)

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up/Login and create a new project
3. Choose a region close to your users
4. Wait for the project to be ready

### Step 2: Get Database URL
1. Go to Settings → Database
2. Copy the "Connection string" under "Connection parameters"
3. It should look like: `postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres`

### Step 3: Configure Environment
1. Create a `.env` file in your project root:
```bash
# Database Configuration
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://postgres:[your-password]@db.[project-ref].supabase.co:5432/postgres

# AI Configuration (keep existing)
GROQ_API_KEY=your_groq_api_key_here

# Server Configuration
PORT=3000
NODE_ENV=development
```

### Step 4: Install Dependencies
```bash
npm install
```

### Step 5: Run Migration
```bash
node migrate-to-cloud.js
```

### Step 6: Test Your App
```bash
npm start
```

## 🔧 Manual Setup (Other Providers)

### For Neon:
1. Create account at [neon.tech](https://neon.tech)
2. Create a new database
3. Copy the connection string
4. Update your `.env` file with the connection string

### For PlanetScale:
1. Create account at [planetscale.com](https://planetscale.com)
2. Create a new database
3. Get the connection string from the dashboard
4. Update your `.env` file

## 📊 Database Schema

The migration will create these tables:

### `essays` table:
- `id` (Primary Key)
- `title` (Text)
- `content` (Text)
- `prompt` (Text, optional)
- `tags` (Text, comma-separated)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)
- `deleted_at` (Timestamp, for soft deletes)

### `essay_versions` table:
- `id` (Primary Key)
- `essay_id` (Foreign Key to essays)
- `title` (Text)
- `content` (Text)
- `prompt` (Text, optional)
- `tags` (Text, comma-separated)
- `changes_only` (Text, optional)
- `created_at` (Timestamp)

## 🔄 Switching Between Databases

You can easily switch between SQLite and cloud database by changing the `DATABASE_TYPE` in your `.env` file:

- `DATABASE_TYPE=sqlite` - Use local SQLite (for development)
- `DATABASE_TYPE=postgresql` - Use cloud PostgreSQL (for production)

## 🛠️ Troubleshooting

### Common Issues:

1. **Connection refused**: Check your DATABASE_URL and ensure the database is accessible
2. **Authentication failed**: Verify your username/password in the connection string
3. **SSL errors**: Add `?sslmode=require` to your DATABASE_URL for production

### Testing Connection:
```bash
# Test with SQLite
DATABASE_TYPE=sqlite npm start

# Test with PostgreSQL
DATABASE_TYPE=postgresql npm start
```

## 📈 Benefits of Cloud Database

1. **Scalability**: Handle more users and data
2. **Reliability**: Automatic backups and high availability
3. **Accessibility**: Access from anywhere, not just your local machine
4. **Collaboration**: Multiple developers can access the same data
5. **Security**: Professional security measures and monitoring

## 💰 Cost Considerations

- **Supabase**: Free for 500MB, then $25/month
- **Neon**: Free for 0.5GB, then pay-as-you-go
- **PlanetScale**: Free for 1B reads/month, then $29/month

For most personal projects, the free tiers are more than sufficient.

## 🔒 Security Best Practices

1. Never commit your `.env` file to version control
2. Use environment-specific connection strings
3. Regularly rotate database passwords
4. Enable SSL connections in production
5. Use connection pooling for better performance

## 📞 Support

If you encounter issues:
1. Check the logs in your cloud database dashboard
2. Verify your connection string format
3. Ensure your IP is whitelisted (if required)
4. Check the provider's status page for outages

---

**Ready to go cloud?** Run `node migrate-to-cloud.js` after setting up your cloud database! 🚀
