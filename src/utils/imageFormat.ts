/** Obsidian attachments and provider downloads can have misleading extensions or MIME types. */
export function imageExtension(data: ArrayBuffer): 'png' | 'jpg' | 'webp' | 'gif' | undefined {
    const bytes = new Uint8Array(data);
    const starts = (signature: number[], offset = 0) => signature.every((byte, index) => bytes[offset + index] === byte);
    if (starts([137, 80, 78, 71, 13, 10, 26, 10])) return 'png';
    if (starts([255, 216, 255])) return 'jpg';
    if (starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8)) return 'webp';
    if (starts([71, 73, 70, 56, 55, 97]) || starts([71, 73, 70, 56, 57, 97])) return 'gif';
}
