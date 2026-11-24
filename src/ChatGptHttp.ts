import type { IncomingMessage } from 'http';

/** Node transport avoids browser CORS; loaded only by the desktop connection. */
export async function chatGptRequest(url: string, options: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal } = {}): Promise<IncomingMessage> {
    const { request } = require('https') as typeof import('https');
    return new Promise((resolve, reject) => {
        const req = request(url, { method: options.method || 'GET', headers: options.headers }, response => {
            response.once('close', cleanup);
            resolve(response);
        });
        const abort = () => req.destroy(new Error('ChatGPT request cancelled.'));
        const cleanup = () => { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); };
        const timeout = setTimeout(() => req.destroy(new Error('ChatGPT request timed out.')), 5 * 60_000);
        req.once('error', error => { cleanup(); reject(error); });
        options.signal?.addEventListener('abort', abort, { once: true });
        if (options.signal?.aborted) abort();
        else req.end(options.body);
    });
}

export async function chatGptJson(url: string, options?: Parameters<typeof chatGptRequest>[1]): Promise<any> {
    const response = await chatGptRequest(url, options);
    response.setEncoding('utf8');
    let body = '';
    for await (const chunk of response) {
        body += chunk.toString();
        if (body.length > 2_000_000) { response.destroy(); throw new Error('ChatGPT returned an oversized response.'); }
    }
    // Do not expose raw auth responses or tokens in errors or logs.
    if ((response.statusCode || 500) >= 300) throw new Error(`ChatGPT request failed (${response.statusCode}). ${response.statusCode === 401 ? 'Sign in again.' : response.statusCode === 429 ? 'Your usage limit may have been reached. Try again later.' : 'Please try again.'}`);
    try { return JSON.parse(body); }
    catch { throw new Error('ChatGPT returned an invalid response.'); }
}
