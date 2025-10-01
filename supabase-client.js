const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

let supabase = null;
const supabaseKey = process.env.SUPABASE_KEY;

// Extract project ref from the JWT token
if (supabaseKey) {
  try {
    // Decode the JWT to get the project ref
    const payload = JSON.parse(Buffer.from(supabaseKey.split('.')[1], 'base64').toString());
    const projectRef = payload.ref;

    if (projectRef) {
      const supabaseUrl = `https://${projectRef}.supabase.co`;
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log(`Supabase client initialized successfully (project: ${projectRef})`);
    } else {
      console.log('Could not extract project ref from SUPABASE_KEY');
    }
  } catch (error) {
    console.log('Error parsing SUPABASE_KEY:', error.message);
    console.log('Running in local-only mode');
  }
} else {
  console.log('SUPABASE_KEY not found - running in local-only mode');
}

module.exports = supabase;
