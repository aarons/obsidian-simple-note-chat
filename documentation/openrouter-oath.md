---
title: OAuth PKCE
subtitle: Connect your users to OpenRouter
headline: OAuth PKCE | Secure Authentication for OpenRouter
canonical-url: 'https://openrouter.ai/docs/use-cases/oauth-pkce'
'og:site_name': OpenRouter Documentation
'og:title': OAuth PKCE - Secure User Authentication
'og:description': >-
  Implement secure user authentication with OpenRouter using OAuth PKCE.
  Complete guide to setting up and managing OAuth authentication flows.
'og:image':
  type: url
  value: >-
    https://openrouter.ai/dynamic-og?pathname=use-cases/oauth-pkce&title=OAuth%20PKCE&description=Secure%20one-click%20authentication%20for%20your%20OpenRouter%20users
'og:image:width': 1200
'og:image:height': 630
'twitter:card': summary_large_image
'twitter:site': '@OpenRouterAI'
noindex: false
nofollow: false
---

Users can connect to OpenRouter in one click using [Proof Key for Code Exchange (PKCE)](https://oauth.net/2/pkce/).

Here's a step-by-step guide:

## PKCE Guide

### Step 1: Send your user to OpenRouter

To start the PKCE flow, send your user to OpenRouter's `/auth` URL with a `callback_url` parameter pointing back to your site:

<CodeGroup>

```txt title="With S256 Code Challenge (Recommended)" wordWrap
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=S256
```

```txt title="With Plain Code Challenge" wordWrap
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>&code_challenge=<CODE_CHALLENGE>&code_challenge_method=plain
```

```txt title="Without Code Challenge" wordWrap
https://openrouter.ai/auth?callback_url=<YOUR_SITE_URL>
```

</CodeGroup>

The `code_challenge` parameter is optional but recommended.

Your user will be prompted to log in to OpenRouter and authorize your app. After authorization, they will be redirected back to your site with a `code` parameter in the URL:

![Alt text](file:d0ea7ac8-b3d3-4493-9a92-0425f02d9271)

<Tip title="Use SHA-256 for Maximum Security">
For maximum security, set `code_challenge_method` to `S256`, and set `code_challenge` to the base64 encoding of the sha256 hash of `code_verifier`.

For more info, [visit Auth0's docs](https://auth0.com/docs/get-started/authentication-and-authorization-flow/call-your-api-using-the-authorization-code-flow-with-pkce#parameters).

</Tip>

#### How to Generate a Code Challenge

The following example leverages the Web Crypto API and the Buffer API to generate a code challenge for the S256 method. You will need a bundler to use the Buffer API in the web browser:

<CodeGroup>

```typescript title="Generate Code Challenge"
import { Buffer } from 'buffer';

async function createSHA256CodeChallenge(input: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('base64url');
}

const codeVerifier = 'your-random-string';
const generatedCodeChallenge = await createSHA256CodeChallenge(codeVerifier);
```

</CodeGroup>

#### Localhost Apps

If your app is a local-first app or otherwise doesn't have a public URL, it is recommended to test with `http://localhost:3000` as the callback and referrer URLs.

When moving to production, replace the localhost/private referrer URL with a public GitHub repo or a link to your project website.

### Step 2: Exchange the code for a user-controlled API key

After the user logs in with OpenRouter, they are redirected back to your site with a `code` parameter in the URL:

![Alt text](file:3df79fe7-18c5-4e13-8885-9c98fc6c91cc)

Extract this code using the browser API:

<CodeGroup>

```typescript title="Extract Code"
const urlParams = new URLSearchParams(window.location.search);
const code = urlParams.get('code');
```

</CodeGroup>

Then use it to make an API call to `https://openrouter.ai/api/v1/auth/keys` to exchange the code for a user-controlled API key:

<CodeGroup>

```typescript title="Exchange Code"
const response = await fetch('https://openrouter.ai/api/v1/auth/keys', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    code: '<CODE_FROM_QUERY_PARAM>',
    code_verifier: '<CODE_VERIFIER>', // If code_challenge was used
    code_challenge_method: '<CODE_CHALLENGE_METHOD>', // If code_challenge was used
  }),
});

const { key } = await response.json();
```

</CodeGroup>

And that's it for the PKCE flow!

### Step 3: Use the API key

Store the API key securely within the user's browser or in your own database, and use it to [make OpenRouter requests](/api-reference/completion).

<CodeGroup>

```typescript title="Make an OpenRouter request"
fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <API_KEY>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'Hello!',
      },
    ],
  }),
});
```

</CodeGroup>

## Error Codes

- `400 Invalid code_challenge_method`: Make sure you're using the same code challenge method in step 1 as in step 2.
- `403 Invalid code or code_verifier`: Make sure your user is logged in to OpenRouter, and that `code_verifier` and `code_challenge_method` are correct.
- `405 Method Not Allowed`: Make sure you're using `POST` and `HTTPS` for your request.

## External Tools

- [PKCE Tools](https://example-app.com/pkce)
- [Online PKCE Generator](https://tonyxu-io.github.io/pkce-generator/)
