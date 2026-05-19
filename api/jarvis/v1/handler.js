/**
 * Local Jarvis Assistant Handler — Sidecar only.
 * 
 * This handler runs locally on the user's machine within the Tauri sidecar.
 * It coordinates local reasoning (Ollama), system tools, and voice processing.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
// @ts-expect-error — Sidecar helpers
import { getCorsHeaders } from '../../_cors.js';

const execAsync = promisify(exec);

/**
 * Standard JSON response helper for sidecar handlers
 */
function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

/**
 * Tool Registry - Implementations of the "Hands"
 */
const tools = {
  read_file: async (args) => {
    try {
      const content = await fs.readFile(args.path, 'utf-8');
      return { success: true, content };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  run_command: async (args) => {
    try {
      const { stdout, stderr } = await execAsync(args.command);
      return { success: true, stdout, stderr };
    } catch (err) {
      return { success: false, error: err.message };
    }
  },
  list_files: async (args) => {
    try {
      const files = await fs.readdir(args.path || '.');
      return { success: true, files };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
};

const SYSTEM_PROMPT = `You are JARVIS, a highly intelligent personal AI assistant. You are concise, helpful, and professional. 
You have access to the following tools:
- read_file(path: string): Reads a file.
- run_command(command: string): Executes a PowerShell command.
- list_files(path: string): Lists files in a directory.

If you need to use a tool, respond ONLY with a JSON object in this format:
{"tool": "tool_name", "args": {"arg1": "value1"}}

Once you receive the tool output, provide a final natural language response to the user.`;

/**
 * Main Jarvis entry point
 */
export default async function handler(req) {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Local-Token',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, corsHeaders);
  }

  try {
    const body = await req.json();
    const { query, model = 'llama3', history = [], memory = [] } = body;

    if (!query) {
      return json({ error: 'Query is required' }, 400, corsHeaders);
    }

    let dynamicPrompt = SYSTEM_PROMPT;
    if (memory.length > 0) {
      dynamicPrompt += `\n\nRELEVANT PAST INTERACTIONS:\n${memory.join('\n---\n')}`;
    }

    const messages = [
      { role: 'system', content: dynamicPrompt },
      ...history,
      { role: 'user', content: query }
    ];

    // 1. Initial reasoning call to Ollama
    let ollamaRes = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!ollamaRes.ok) {
      throw new Error(`Ollama error: ${ollamaRes.status}`);
    }

    let data = await ollamaRes.json();
    let content = data.message.content.trim();

    // 2. Check if the model wants to call a tool
    try {
      const toolCall = JSON.parse(content);
      if (toolCall.tool && tools[toolCall.tool]) {
        // Execute the tool
        const toolResult = await tools[toolCall.tool](toolCall.args);
        
        // Feed the result back to the model for a final answer
        messages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
        messages.push({ role: 'user', content: `Tool output: ${JSON.stringify(toolResult)}. Now provide your final response to the user.` });

        ollamaRes = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: false }),
        });

        if (ollamaRes.ok) {
          data = await ollamaRes.json();
          content = data.message.content;
        }
      }
    } catch (e) {
      // Not a tool call, just a regular message
    }

    return json({
      text: content,
      timestamp: Date.now(),
      mode: 'jarvis-agent',
      model: data.model,
      status: 'online'
    }, 200, corsHeaders);

  } catch (error) {
    console.error('[jarvis] Handler error:', error);
    return json({ error: 'Internal Server Error', details: error.message }, 500, corsHeaders);
  }
}
