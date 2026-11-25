export const CHAT_COMMAND_DEFAULT = 'cc';
export const ARCHIVE_COMMAND_DEFAULT = 'gg';
export const NEW_CHAT_COMMAND_DEFAULT = 'nn';
export const MODEL_COMMAND_DEFAULT = 'cm';

export const CHAT_SEPARATOR = '<hr message-from="chat">';
export const DEFAULT_ARCHIVE_FOLDER = 'archive/';
export const DEFAULT_NN_TITLE_FORMAT = 'YYYY-MM-DD-HH-mm';
export const CHAT_BOUNDARY_MARKER = '^^^';

const ESCAPED_BOUNDARY_MARKER = CHAT_BOUNDARY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches the boundary marker on a line of its own (optional horizontal whitespace around it).
 * Returns a fresh RegExp because global regexes are stateful.
 */
export function createChatBoundaryRegex(flags = 'm'): RegExp {
	return new RegExp(`^[ \\t]*${ESCAPED_BOUNDARY_MARKER}[ \\t]*$`, flags);
}

/** Start of the content after the last boundary, considering only text before end. */
export function getChatContentStart(content: string, end = content.length): number {
	const regex = createChatBoundaryRegex('gm');
	let start = 0;
	let match: RegExpExecArray | null;
	const relevantContent = content.slice(0, end);
	while ((match = regex.exec(relevantContent)) !== null) {
		start = match.index + match[0].length;
	}
	return start;
}

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
