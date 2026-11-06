import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../llm/router.js';
import { ToolEngine } from '../tools/index.js';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('OpenGravity ModelRouter', () => {
  it('should default to FreeLLMAPI pool with Google Gemini 2.0 Flash', () => {
    const router = new ModelRouter();
    const route = router.resolveRouting();

    assert.strictEqual(route.provider, 'freellmapi');
    assert.strictEqual(route.model, 'gemini-2.0-flash');
    assert.strictEqual(route.isFreeTier, true);
    assert.match(route.endpointUrl, /\/chat\/completions$/);
  });

  it('should route to Direct Google Gemini BYOK when credentials are provided', () => {
    const router = new ModelRouter({ googleApiKey: 'test-google-key' });
    const route = router.resolveRouting('google', 'gemini-2.0-pro');

    assert.strictEqual(route.provider, 'google');
    assert.strictEqual(route.model, 'gemini-2.0-pro');
    assert.strictEqual(route.apiKey, 'test-google-key');
    assert.strictEqual(route.isFreeTier, false);
    assert.match(route.endpointUrl, /generativelanguage\.googleapis\.com/);
  });

  it('should route to Direct Anthropic BYOK when credentials are provided', () => {
    const router = new ModelRouter({ anthropicApiKey: 'sk-ant-test' });
    const route = router.resolveRouting('anthropic', 'claude-3-7-sonnet-20250219');

    assert.strictEqual(route.provider, 'anthropic');
    assert.strictEqual(route.model, 'claude-3-7-sonnet-20250219');
    assert.strictEqual(route.apiKey, 'sk-ant-test');
    assert.strictEqual(route.isFreeTier, false);
    assert.strictEqual(route.endpointUrl, 'https://api.anthropic.com/v1/messages');
  });

  it('should route to Direct OpenAI BYOK when credentials are provided', () => {
    const router = new ModelRouter({ openaiApiKey: 'sk-proj-test' });
    const route = router.resolveRouting('openai', 'gpt-4o');

    assert.strictEqual(route.provider, 'openai');
    assert.strictEqual(route.model, 'gpt-4o');
    assert.strictEqual(route.apiKey, 'sk-proj-test');
    assert.strictEqual(route.isFreeTier, false);
    assert.strictEqual(route.endpointUrl, 'https://api.openai.com/v1/chat/completions');
  });

  it('should route to Local Ollama when selected', () => {
    const router = new ModelRouter({ customBaseUrl: 'http://localhost:11434/v1' });
    const route = router.resolveRouting('ollama', 'qwen2.5-coder:7b');

    assert.strictEqual(route.provider, 'ollama');
    assert.strictEqual(route.model, 'qwen2.5-coder:7b');
    assert.strictEqual(route.endpointUrl, 'http://localhost:11434/v1/chat/completions');
  });
});

describe('OpenGravity ToolEngine', () => {
  it('should perform write_file, read_file, and edit_file correctly', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opengravity-test-'));
    const engine = new ToolEngine(tmpDir);

    // 1. write_file
    const writeRes = await engine.executeTool('write_file', {
      filePath: 'hello.txt',
      content: 'Hello World!\nThis is OpenGravity IDE.'
    });
    assert.strictEqual(writeRes.isError, undefined);

    // 2. read_file
    const readRes = await engine.executeTool('read_file', {
      filePath: 'hello.txt',
      startLine: 1,
      endLine: 2
    });
    assert.strictEqual(readRes.output, 'Hello World!\nThis is OpenGravity IDE.');

    // 3. edit_file
    const editRes = await engine.executeTool('edit_file', {
      filePath: 'hello.txt',
      target: 'Hello World!',
      replacement: 'Hello Developers!'
    });
    assert.strictEqual(editRes.isError, undefined);

    // 4. Verify edit
    const readAfterEdit = await engine.executeTool('read_file', {
      filePath: 'hello.txt'
    });
    assert.strictEqual(readAfterEdit.output, 'Hello Developers!\nThis is OpenGravity IDE.');

    // Cleanup
    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

