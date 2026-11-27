import { ChatMessage } from './types';

function imageUrlPart(url: string) {
    return { type: 'image_url', image_url: { url } };
}

type ChatApi = 'chat/completions' | 'responses';

function userContent(text: string, images: string[], api: ChatApi) {
    if (!images.length) return text;
    if (api === 'responses') {
        return [
            ...(text ? [{ type: 'input_text', text }] : []),
            ...images.map(url => ({ type: 'input_image', image_url: url, detail: 'auto' })),
        ];
    }
    return [...(text ? [{ type: 'text', text }] : []), ...images.map(imageUrlPart)];
}

/** Replay saved assistant images as inputs to the next user turn, alongside the edit request. */
export function formatChatInputs(messages: ChatMessage[], api: ChatApi) {
    let previousImages: string[] = [];
    const inputs = messages.map(({ role, content, images = [] }) => {
        if (role === 'assistant') {
            previousImages = previousImages.concat(images);
            return { role, content };
        }
        const input = { role, content: userContent(content, previousImages.concat(images), api) };
        previousImages = [];
        return input;
    });
    if (previousImages.length) inputs.push({ role: 'user', content: userContent('', previousImages, api) });
    return inputs;
}

/** The dedicated images endpoint takes one prompt and an ordered list of references. */
export function formatImageInputs(messages: ChatMessage[]) {
    const prompt = messages.length === 1 ? messages[0].content
        : messages.map(message => `${message.role}: ${message.content}`).join('\n\n');
    const urls = new Set(messages.flatMap(message => message.images ?? []));
    return urls.size ? { prompt, input_references: Array.from(urls, imageUrlPart) } : { prompt };
}
