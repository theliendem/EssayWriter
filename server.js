const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const Groq = require('groq-sdk');

// Load environment variables
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Serve home page as default (before static middleware)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve editor page explicitly
app.get('/editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Static file serving
app.use(express.static('public'));

// Initialize SQLite database
const db = new sqlite3.Database('essays.db');

// Create essays table and version history table
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS essays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS essay_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    essay_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    changes_only TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (essay_id) REFERENCES essays (id) ON DELETE CASCADE
  )`);
});

// Routes
app.get('/api/essays', (req, res) => {
  db.all('SELECT * FROM essays ORDER BY updated_at DESC', (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.get('/api/essays/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM essays WHERE id = ?', [id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Essay not found' });
      return;
    }
    res.json(row);
  });
});

app.post('/api/essays', (req, res) => {
  const { title, content } = req.body;
  db.run('INSERT INTO essays (title, content) VALUES (?, ?)', [title, content], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, title, content });
  });
});

app.put('/api/essays/:id', (req, res) => {
  const { title, content } = req.body;
  const { id } = req.params;
  db.run('UPDATE essays SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [title, content, id], function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json({ id, title, content });
    });
});

app.delete('/api/essays/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM essays WHERE id = ?', [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ deleted: this.changes });
  });
});

// Version history endpoints with pagination
app.get('/api/essays/:id/versions', (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 0;
  const limit = parseInt(req.query.limit) || 50;
  const offset = page * limit;
  
  console.log(`Getting versions for essay ID: ${id}, page: ${page}, limit: ${limit}, offset: ${offset}`);
  
  // Get total count first
  db.get('SELECT COUNT(*) as total FROM essay_versions WHERE essay_id = ?', [id], (err, countResult) => {
    if (err) {
      console.error('Database error getting version count:', err);
      res.status(500).json({ error: err.message });
      return;
    }
    
    const totalVersions = countResult.total;
    
    // Get paginated versions
    db.all('SELECT * FROM essay_versions WHERE essay_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', 
      [id, limit, offset], (err, rows) => {
        if (err) {
          console.error('Database error getting versions:', err);
          res.status(500).json({ error: err.message });
          return;
        }
        
        console.log(`Found ${rows.length} versions for essay ${id} (page ${page})`);
        res.json({
          versions: rows,
          pagination: {
            page: page,
            limit: limit,
            total: totalVersions,
            hasMore: (offset + rows.length) < totalVersions
          }
        });
      });
  });
});

app.post('/api/essays/:id/versions', (req, res) => {
  const { id } = req.params;
  const { title, content, changes_only } = req.body;
  
  console.log(`Creating version for essay ID: ${id}, changes: ${changes_only}`);
  
  db.run('INSERT INTO essay_versions (essay_id, title, content, changes_only) VALUES (?, ?, ?, ?)', 
    [id, title, content, changes_only || null], function (err) {
      if (err) {
        console.error('Database error creating version:', err);
        res.status(500).json({ error: err.message });
        return;
      }
      console.log(`Created version with ID: ${this.lastID}`);
      res.json({ id: this.lastID, essay_id: id, title, content });
    });
});

app.get('/api/essays/:id/versions/:versionId', (req, res) => {
  const { id, versionId } = req.params;
  db.get('SELECT * FROM essay_versions WHERE id = ? AND essay_id = ?', [versionId, id], (err, row) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (!row) {
      res.status(404).json({ error: 'Version not found' });
      return;
    }
    res.json(row);
  });
});

// AI Chat endpoint with real AI integration
app.post('/api/chat', async (req, res) => {
  try {
    const { message, context } = req.body;

    console.log('Chat request received:', { message: message?.substring(0, 50), hasContext: !!context });

    // Try multiple AI providers in order of preference
    let result = await tryAIProviders(message, context);

    if (!result) {
      console.log('All AI providers failed, using built-in response');
      // Fallback to built-in responses
      result = {
        response: generateAIResponse(message.toLowerCase(), context),
        source: 'Built-in Assistant'
      };
    }

    console.log('Sending response from:', result.source);
    res.json(result);
  } catch (error) {
    console.error('Chat API error:', error);
    console.error('Error stack:', error.stack);
    const fallbackResponse = generateAIResponse(message?.toLowerCase() || '', context);
    res.json({
      response: fallbackResponse,
      source: 'Built-in Assistant (Error Fallback)'
    });
  }
});

// Try multiple AI providers
async function tryAIProviders(message, context) {
  const providers = [
    { name: 'Groq', fn: () => tryGroq(message, context) },
    { name: 'Local AI', fn: () => tryLocalAI(message, context) },
    { name: 'Hugging Face', fn: () => tryHuggingFace(message, context) },
    { name: 'OpenAI Compatible', fn: () => tryOpenAICompatible(message, context) }
  ];

  for (const provider of providers) {
    try {
      const response = await provider.fn();
      if (response) {
        console.log(`${provider.name} AI provider succeeded`);
        return {
          response: response,
          source: provider.name
        };
      }
    } catch (error) {
      console.log(`${provider.name} failed, trying next...`);
      continue;
    }
  }

  return null;
}

// Local AI using Python script
async function tryLocalAI(message, context) {
  return new Promise((resolve, reject) => {
    const python = spawn('python3', [
      path.join(__dirname, 'ai_chat.py'),
      message,
      context || ''
    ]);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const result = JSON.parse(output.trim());
          resolve(result.response);
        } catch (parseError) {
          reject(new Error('Failed to parse AI response'));
        }
      } else {
        reject(new Error(`AI script failed: ${errorOutput}`));
      }
    });

    python.on('error', (error) => {
      reject(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      python.kill();
      reject(new Error('AI response timeout'));
    }, 5000);
  });
}

// Hugging Face Inference API (free tier)
async function tryHuggingFace(message, context) {
  try {
    // Use a simpler, more reliable model
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/facebook/blenderbot-400M-distill',
      {
        inputs: `Essay writing help: ${message}`,
        parameters: {
          max_length: 200,
          min_length: 20,
          temperature: 0.7
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'EssayPro/1.0'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data[0] && response.data[0].generated_text) {
      let text = response.data[0].generated_text.trim();
      // Clean up the response
      text = text.replace('Essay writing help:', '').trim();
      if (text.length > 10 && text.length < 500) {
        return text;
      }
    }
  } catch (error) {
    console.log('Hugging Face failed:', error.message);
  }

  return null;
}

// Try OpenAI-compatible APIs (like OpenRouter, etc.)
async function tryOpenAICompatible(message, context) {
  // This would require an API key, so we'll skip for now
  // but the structure is here for future implementation
  return null;
}

// Try Groq (free tier available)
async function tryGroq(message, context) {
  try {
    if (!process.env.GROQ_API_KEY) {
      console.log('Groq API key not found in environment variables');
      return null;
    }

    const prompt = createEssayPrompt(message, context);

    console.log('Sending request to Groq API...');
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are an expert essay writing assistant. Provide helpful, specific, and actionable advice about essay writing. Keep responses concise but informative. Format your response clearly with bullet points or numbered lists when appropriate."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      model: "llama-3.1-8b-instant", // Fast and capable model
      temperature: 0.7,
      max_tokens: 600,
      top_p: 1,
      stream: false
    });

    const response = completion.choices[0]?.message?.content;
    if (response) {
      console.log('Groq API response received successfully');
      return response.trim();
    }

    console.log('Groq API returned empty response');
    return null;
  } catch (error) {
    console.error('Groq API error:', error.message);
    if (error.error) {
      console.error('Groq error details:', error.error);
    }
    return null;
  }
}

// Create a proper prompt for essay assistance
function createEssayPrompt(message, context) {
  const contextSummary = context ? context.substring(0, 300) : 'No essay content provided yet.';

  let prompt = `I'm working on an essay and need help with: "${message}"\n\n`;

  if (context && context.trim()) {
    prompt += `Here's what I have written so far:\n"${contextSummary}"\n\n`;
  }

  prompt += `Please provide specific, actionable advice to help me improve my essay writing. `;
  prompt += `Focus on practical suggestions I can implement right away.`;

  return prompt;
}

// AI Response Generator
function generateAIResponse(message, context) {
  const responses = {
    // Writing help
    'help': 'I can help you with essay structure, grammar, style, and content ideas. What specific aspect would you like assistance with?',
    'structure': 'A good essay structure includes: 1) Introduction with thesis statement, 2) Body paragraphs with topic sentences and evidence, 3) Conclusion that reinforces your main points. Would you like me to elaborate on any section?',
    'introduction': 'Start your introduction with a hook (question, quote, or interesting fact), provide background context, and end with a clear thesis statement that previews your main arguments.',
    'conclusion': 'Your conclusion should restate your thesis in new words, summarize key points, and end with a thought-provoking statement or call to action.',
    'thesis': 'A strong thesis statement should be specific, arguable, and preview your main points. It typically appears at the end of your introduction paragraph.',

    // Grammar and style
    'grammar': 'I can help with grammar! Common issues include subject-verb agreement, comma usage, and sentence fragments. What specific grammar question do you have?',
    'style': 'For better writing style: vary sentence length, use active voice, choose precise words, and ensure smooth transitions between ideas.',
    'tone': 'Academic tone should be formal, objective, and clear. Avoid contractions, first person (unless specified), and overly casual language.',

    // Content development
    'ideas': 'To develop ideas: brainstorm with mind maps, research credible sources, consider different perspectives, and use specific examples to support your points.',
    'evidence': 'Strong evidence includes statistics, expert quotes, case studies, and real-world examples. Always cite your sources properly.',
    'argument': 'Build strong arguments by: stating your claim clearly, providing evidence, explaining how evidence supports your claim, and addressing counterarguments.',

    // Specific improvements
    'improve': 'To improve your essay: check for clear topic sentences, ensure paragraphs flow logically, vary sentence structure, and eliminate wordiness.',
    'professional': 'To sound more professional: use formal vocabulary, eliminate casual phrases, ensure proper grammar, and maintain consistent tone throughout.',
    'flow': 'Improve flow with transition words (however, furthermore, consequently), connect ideas between paragraphs, and ensure each sentence builds on the previous one.',

    // Research and citations
    'research': 'For research: use academic databases, check source credibility, take detailed notes with page numbers, and organize sources by topic or argument.',
    'citations': 'Proper citations prevent plagiarism and support your arguments. Include in-text citations and a bibliography. What citation style are you using?',

    // Revision and editing
    'revise': 'When revising: read aloud to catch errors, check for clarity and coherence, ensure each paragraph supports your thesis, and verify all claims have evidence.',
    'edit': 'Editing tips: check spelling and grammar, ensure consistent formatting, verify citations are correct, and remove unnecessary words.',

    // Length and requirements
    'length': 'To meet word count: develop examples more fully, add relevant quotes with analysis, explore counterarguments, or expand on implications of your points.',
    'short': 'To shorten your essay: remove redundant phrases, combine similar points, eliminate weak examples, and ensure every sentence serves a purpose.'
  };

  // Check for keywords in the message
  for (const [keyword, response] of Object.entries(responses)) {
    if (message.includes(keyword)) {
      return response;
    }
  }

  // Context-aware responses
  if (context && context.length > 50) {
    const wordCount = context.split(/\s+/).length;
    if (message.includes('word') || message.includes('count')) {
      return `Your current essay has approximately ${wordCount} words. ${wordCount < 300 ? 'Consider expanding your ideas with more examples and analysis.' : 'Good length! Focus on refining your arguments and ensuring clarity.'}`;
    }

    if (message.includes('better') || message.includes('improve')) {
      return 'Based on your current text, consider: 1) Adding more specific examples, 2) Ensuring smooth transitions between ideas, 3) Checking that each paragraph has a clear main point, 4) Varying your sentence structure for better flow.';
    }
  }

  // Default helpful responses
  const defaultResponses = [
    'I can help you with essay structure, grammar, style, research, and content development. What would you like to work on?',
    'Great question! For essay writing, I can assist with introductions, body paragraphs, conclusions, citations, and revision strategies.',
    'I\'m here to help improve your writing! Try asking about specific topics like "thesis statements," "paragraph structure," or "how to improve flow."',
    'Let me help you write a better essay! I can provide guidance on organization, style, grammar, and content development.'
  ];

  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Enhanced AI Detection endpoint using Python script
app.post('/api/ai-detect', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length < 5) {
      return res.json({
        error: 'Text too short for analysis (minimum 5 words)',
        fallback: true
      });
    }

    console.log('Running enhanced AI detection for text length:', text.length);

    // Try to run Python AI detector
    const python = spawn('python3', [path.join(__dirname, 'ai_detector.py'), '--text', text]);

    let output = '';
    let errorOutput = '';
    let resolved = false;

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (resolved) return;
      resolved = true;

      console.log(`Python script exited with code: ${code}`);
      if (errorOutput) console.log('Python stderr:', errorOutput);

      if (code === 0 && output.trim()) {
        try {
          const result = JSON.parse(output.trim());
          console.log('Enhanced AI detection successful');
          res.json({ ...result, enhanced: true });
        } catch (parseError) {
          console.log('Python output parse error:', parseError.message);
          console.log('Raw output:', output);
          res.json(generateFallbackDetection(text));
        }
      } else {
        console.log('Python script failed, code:', code, 'stderr:', errorOutput);
        res.json(generateFallbackDetection(text));
      }
    });

    python.on('error', (error) => {
      if (resolved) return;
      resolved = true;
      console.log('Python spawn error:', error.message);
      res.json(generateFallbackDetection(text));
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.log('Python script timeout');
      python.kill();
      res.json(generateFallbackDetection(text));
    }, 15000);

  } catch (error) {
    console.error('AI Detection error:', error);
    res.json(generateFallbackDetection(req.body.text || ''));
  }
});

// Fallback AI detection (original method)
function generateFallbackDetection(text) {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);

  if (sentences.length === 0 || words.length === 0) {
    return {
      error: 'Text too short for analysis',
      fallback: true
    };
  }

  // Simple heuristic analysis
  const uniqueWords = new Set(words);
  const repetitionScore = 1 - (uniqueWords.size / words.length);

  const sentenceLengths = sentences.map(s => s.split(/\s+/).length);
  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;
  const variance = sentenceLengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / sentenceLengths.length;
  const uniformityScore = Math.max(0, 1 - (variance / 50));

  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
  const contentWords = words.filter(w => !commonWords.has(w) && w.length > 3);
  const uniqueContentWords = new Set(contentWords);
  const diversityScore = contentWords.length > 0 ? 1 - (uniqueContentWords.size / contentWords.length) : 0;

  const aiScore = (repetitionScore * 0.4) + (uniformityScore * 0.35) + (diversityScore * 0.25);
  const aiProbability = Math.min(95, Math.max(5, aiScore * 100));

  return {
    ai_probability: Math.round(aiProbability * 10) / 10,
    human_probability: Math.round((100 - aiProbability) * 10) / 10,
    metrics: {
      repetition: Math.round(repetitionScore * 1000) / 1000,
      uniformity: Math.round(uniformityScore * 1000) / 1000,
      diversity: Math.round(diversityScore * 1000) / 1000
    },
    analysis: [
      aiProbability > 70 ? 'Likely AI-generated based on patterns' :
        aiProbability > 40 ? 'Mixed indicators present' : 'Likely human-written',
      'Analysis based on text patterns and structure'
    ],
    fallback: true,
    enhanced: false
  };
}


// Test endpoint for AI detection
app.get('/api/test-ai', async (req, res) => {
  const testText = "This is a test sentence to verify that the enhanced AI detection system is working properly. It should provide detailed analysis.";

  try {
    const python = spawn('python3', [path.join(__dirname, 'ai_detector.py'), '--text', testText]);

    let output = '';
    let errorOutput = '';

    python.stdout.on('data', (data) => {
      output += data.toString();
    });

    python.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    python.on('close', (code) => {
      if (code === 0 && output.trim()) {
        try {
          const result = JSON.parse(output.trim());
          res.json({
            status: 'success',
            message: 'Enhanced AI detection is working!',
            result,
            enhanced: true
          });
        } catch (parseError) {
          res.json({
            status: 'error',
            message: 'Parse error',
            error: parseError.message,
            output: output
          });
        }
      } else {
        res.json({
          status: 'error',
          message: 'Python script failed',
          code,
          stderr: errorOutput
        });
      }
    });
  } catch (error) {
    res.json({
      status: 'error',
      message: 'Spawn error',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test enhanced AI detection at: http://localhost:${PORT}/api/test-ai`);
});