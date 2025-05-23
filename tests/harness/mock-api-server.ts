import express, { Request, Response, NextFunction } from 'express';
import { Server } from 'http';

export interface MockApiConfig {
  port: number;
  logRequests?: boolean;
}

export interface MockModel {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
  };
}

export interface MockChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream: boolean;
}

export interface MockChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content: string;
    };
    delta?: {
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export class MockApiServer {
  private app: express.Application;
  private server: Server | null = null;
  private config: MockApiConfig;
  private requestLog: Array<{
    timestamp: string;
    method: string;
    url: string;
    headers: any;
    body: any;
  }> = [];

  // Mock data
  private mockModels: MockModel[] = [
    {
      id: 'openai/gpt-3.5-turbo',
      name: 'GPT-3.5 Turbo',
      description: 'Fast and efficient model',
      pricing: {
        prompt: '0.0000015',
        completion: '0.000002'
      }
    },
    {
      id: 'openai/gpt-4',
      name: 'GPT-4',
      description: 'Most capable model',
      pricing: {
        prompt: '0.00003',
        completion: '0.00006'
      }
    },
    {
      id: 'anthropic/claude-3-sonnet',
      name: 'Claude 3 Sonnet',
      description: 'Balanced performance',
      pricing: {
        prompt: '0.000015',
        completion: '0.000075'
      }
    }
  ];

  private mockResponses: { [key: string]: string } = {
    'test-response': 'This is a test response from the mock API.',
    'encryption-test': 'API key encryption test successful.',
    'archive-test': 'Archive functionality test response.'
  };

  constructor(config: MockApiConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Request logging middleware
    this.app.use((req, res, next) => {
      if (this.config.logRequests) {
        console.log(`[MockAPI] ${req.method} ${req.url}`);
      }

      // Log all requests for test verification
      this.requestLog.push({
        timestamp: new Date().toISOString(),
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body
      });

      next();
    });

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private setupRoutes(): void {
    // Models endpoint
    this.app.get('/v1/models', (req, res) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: {
            message: 'Invalid API key',
            type: 'invalid_request_error'
          }
        });
      }

      res.json({
        object: 'list',
        data: this.mockModels
      });
    });

    // Chat completions endpoint
    this.app.post('/v1/chat/completions', (req, res) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: {
            message: 'Invalid API key',
            type: 'invalid_request_error'
          }
        });
      }

      const chatRequest: MockChatRequest = req.body;

      if (!chatRequest.model || !chatRequest.messages) {
        return res.status(400).json({
          error: {
            message: 'Missing required parameters',
            type: 'invalid_request_error'
          }
        });
      }

      if (chatRequest.stream) {
        this.handleStreamingResponse(req, res, chatRequest);
      } else {
        this.handleNonStreamingResponse(req, res, chatRequest);
      }
    });

    // Test endpoints for specific scenarios
    this.app.post('/v1/test/set-response', (req, res) => {
      const { key, response } = req.body;
      this.mockResponses[key] = response;
      res.json({ success: true });
    });

    this.app.get('/v1/test/requests', (req, res) => {
      res.json(this.requestLog);
    });

    this.app.post('/v1/test/clear-requests', (req, res) => {
      this.requestLog = [];
      res.json({ success: true });
    });
  }

  private handleStreamingResponse(req: express.Request, res: express.Response, chatRequest: MockChatRequest): void {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Determine response content
    const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
    let responseContent = this.mockResponses['test-response'];

    // Check for specific test scenarios
    if (lastMessage.content.includes('encryption-test')) {
      responseContent = this.mockResponses['encryption-test'];
    } else if (lastMessage.content.includes('archive-test')) {
      responseContent = this.mockResponses['archive-test'];
    }

    // Stream the response in chunks
    const chunks = responseContent.split(' ');
    let chunkIndex = 0;

    const sendChunk = () => {
      if (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex];
        const sseData = {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: chatRequest.model,
          choices: [{
            index: 0,
            delta: {
              content: chunk + (chunkIndex < chunks.length - 1 ? ' ' : '')
            },
            finish_reason: null
          }]
        };

        res.write(`data: ${JSON.stringify(sseData)}\n\n`);
        chunkIndex++;
        setTimeout(sendChunk, 50); // 50ms delay between chunks
      } else {
        // Send final chunk
        const finalData = {
          id: 'chatcmpl-test',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: chatRequest.model,
          choices: [{
            index: 0,
            delta: {},
            finish_reason: 'stop'
          }]
        };

        res.write(`data: ${JSON.stringify(finalData)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    };

    sendChunk();
  }

  private handleNonStreamingResponse(req: express.Request, res: express.Response, chatRequest: MockChatRequest): void {
    const lastMessage = chatRequest.messages[chatRequest.messages.length - 1];
    let responseContent = this.mockResponses['test-response'];

    // Check for specific test scenarios
    if (lastMessage.content.includes('encryption-test')) {
      responseContent = this.mockResponses['encryption-test'];
    } else if (lastMessage.content.includes('archive-test')) {
      responseContent = this.mockResponses['archive-test'];
    }

    const response: MockChatResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: chatRequest.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent
        },
        finish_reason: 'stop'
      }]
    };

    res.json(response);
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Mock API server started on port ${this.config.port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getRequestLog(): Array<any> {
    return [...this.requestLog];
  }

  clearRequestLog(): void {
    this.requestLog = [];
  }

  setMockResponse(key: string, response: string): void {
    this.mockResponses[key] = response;
  }

  getLastRequest(): any {
    return this.requestLog[this.requestLog.length - 1];
  }

  getRequestsWithApiKey(apiKey: string): Array<any> {
    return this.requestLog.filter(req =>
      req.headers.authorization === `Bearer ${apiKey}`
    );
  }
}

// Standalone server for manual testing
if (require.main === module) {
  const server = new MockApiServer({ port: 3001, logRequests: true });

  server.start().then(() => {
    console.log('Mock API server is running on http://localhost:3001');
    console.log('Available endpoints:');
    console.log('  GET  /v1/models');
    console.log('  POST /v1/chat/completions');
    console.log('  POST /v1/test/set-response');
    console.log('  GET  /v1/test/requests');
    console.log('  POST /v1/test/clear-requests');
  }).catch(console.error);

  process.on('SIGINT', async () => {
    console.log('\nShutting down mock API server...');
    await server.stop();
    process.exit(0);
  });
}

export default MockApiServer;