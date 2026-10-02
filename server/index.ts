import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import {
  JSON_TASKS,
  STREAM_TASKS,
  systemFor,
  renderContext,
  type BookContext,
  type JsonTaskName,
} from './prompts.ts';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5';
const here = path.dirname(fileURLToPath(import.meta.url));

// Credentials resolve from ANTHROPIC_API_KEY (or an `ant auth login` profile).
const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = aiConfigured ? new Anthropic() : null;

const app = express();
app.use(express.json({ limit: '25mb' }));

interface AiRequestBody {
  task: string;
  text?: string;
  instruction?: string;
  context?: BookContext;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

function buildMessages(body: AiRequestBody, instruction: string): Anthropic.Beta.BetaMessageParam[] {
  const contextBlock: Anthropic.Beta.BetaTextBlockParam = {
    type: 'text',
    text: renderContext(body.context),
    // Chapters are re-sent across several edit passes; cache them.
    cache_control: { type: 'ephemeral' },
  };
  const history = (body.history ?? []).filter((m) => m.content.trim());
  if (history.length === 0) {
    return [{ role: 'user', content: [contextBlock, { type: 'text', text: instruction }] }];
  }
  // Chat: context rides on the first user turn so the prefix stays stable.
  const [first, ...rest] = history;
  return [
    { role: 'user', content: [contextBlock, { type: 'text', text: first.content }] },
    ...rest.map((m) => ({ role: m.role, content: m.content })),
  ];
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: aiConfigured, model: MODEL });
});

app.post('/api/ai/stream', async (req: Request, res: Response) => {
  const body = req.body as AiRequestBody;
  const spec = STREAM_TASKS[body.task];
  if (!spec) return res.status(400).json({ error: `Unknown task: ${body.task}` });
  if (!client) {
    return res.status(503).json({ error: 'AI is not configured. Add ANTHROPIC_API_KEY to your .env file and restart.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    system: systemFor(spec.persona),
    thinking: { type: 'adaptive' },
    output_config: { effort: spec.effort },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: buildMessages(body, spec.instruction(body)),
  });
  res.on('close', () => stream.abort());

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send('text', event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send('error', 'The assistant declined this request. Try rephrasing or selecting a different passage.');
    } else if (final.stop_reason === 'max_tokens') {
      send('error', 'The response hit its length limit and was cut short.');
    }
    send('done', { stop_reason: final.stop_reason });
  } catch (err) {
    if (!stream.aborted) send('error', describeError(err));
  } finally {
    res.end();
  }
});

app.post('/api/ai/json', async (req: Request, res: Response) => {
  const body = req.body as AiRequestBody;
  const spec = JSON_TASKS[body.task as JsonTaskName];
  if (!spec) return res.status(400).json({ error: `Unknown task: ${body.task}` });
  if (!client) {
    return res.status(503).json({ error: 'AI is not configured. Add ANTHROPIC_API_KEY to your .env file and restart.' });
  }
  try {
    const final = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 64000,
        system: systemFor(spec.persona),
        thinking: { type: 'adaptive' },
        output_config: { effort: spec.effort, format: { type: 'json_schema', schema: spec.schema } },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: buildMessages(body, spec.instruction()),
      })
      .finalMessage();
    if (final.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The assistant declined this request.' });
    }
    const text = final.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    res.json(JSON.parse(text));
  } catch (err) {
    res.status(502).json({ error: describeError(err) });
  }
});

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.';
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited by the AI service. Wait a moment and try again.';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the AI service. Check your internet connection.';
  if (err instanceof Anthropic.APIError) return `AI service error (${err.status ?? 'unknown'}): ${err.message}`;
  if (err instanceof SyntaxError) return 'The AI returned malformed data. Please try again.';
  return err instanceof Error ? err.message : String(err);
}

// During development the app itself is served by Vite; send stray visitors there.
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (_req, res) => res.redirect('http://localhost:5173/'));
}

// In production, serve the built front-end from the same port.
const dist = path.resolve(here, '../dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Pen and Sword API on http://localhost:${PORT} — AI ${aiConfigured ? `enabled (${MODEL})` : 'disabled (set ANTHROPIC_API_KEY)'}`);
});
