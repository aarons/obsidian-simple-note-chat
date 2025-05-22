import { Plugin, arrayBufferToBase64, base64ToArrayBuffer } from 'obsidian';
import { log } from './utils/logger';

const ENCRYPTION_KEY_FILE = 'encryption_key.json';
const AES_GCM_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const IV_LENGTH = 12; // AES-GCM recommended IV length is 12 bytes (96 bits)

interface StoredKey {
    jwk: JsonWebKey;
}

export class EncryptionService {
    private plugin: Plugin;
    private encryptionKey: CryptoKey | null = null;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    private async generateAndStoreKey(): Promise<CryptoKey> {
        log.debug('EncryptionService: Generating new encryption key.');
        const key = await window.crypto.subtle.generateKey(
            {
                name: AES_GCM_ALGORITHM,
                length: AES_KEY_LENGTH,
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );
        const jwk = await window.crypto.subtle.exportKey('jwk', key);
        await this.plugin.saveData({ [ENCRYPTION_KEY_FILE]: { jwk } });
        log.debug('EncryptionService: New encryption key generated and stored.');
        return key;
    }

    private async loadKey(): Promise<CryptoKey | null> {
        try {
            const data = await this.plugin.loadData();
            if (data && data[ENCRYPTION_KEY_FILE] && data[ENCRYPTION_KEY_FILE].jwk) {
                const jwk = data[ENCRYPTION_KEY_FILE].jwk as JsonWebKey;
                const key = await window.crypto.subtle.importKey(
                    'jwk',
                    jwk,
                    { name: AES_GCM_ALGORITHM },
                    true, // extractable (though not strictly needed for import if not re-exporting)
                    ['encrypt', 'decrypt']
                );
                log.debug('EncryptionService: Encryption key loaded from file.');
                return key;
            }
            log.debug('EncryptionService: No encryption key found in storage.');
            return null;
        } catch (error) {
            log.error('EncryptionService: Error loading encryption key:', error);
            return null;
        }
    }

    public async initializeKey(): Promise<void> {
        if (this.encryptionKey) {
            return;
        }
        let key = await this.loadKey();
        if (!key) {
            key = await this.generateAndStoreKey();
        }
        this.encryptionKey = key;
    }

    public async encrypt(plaintext: string): Promise<string | null> {
        if (!this.encryptionKey) {
            log.warn('EncryptionService: Encryption key not initialized. Initializing now.');
            await this.initializeKey();
            if (!this.encryptionKey) {
                log.error('EncryptionService: Failed to initialize encryption key for encryption.');
                return null;
            }
        }

        try {
            const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
            const encoder = new TextEncoder();
            const encodedPlaintext = encoder.encode(plaintext);

            const ciphertext = await window.crypto.subtle.encrypt(
                {
                    name: AES_GCM_ALGORITHM,
                    iv: iv,
                },
                this.encryptionKey,
                encodedPlaintext
            );

            const ivBase64 = arrayBufferToBase64(iv);
            const ciphertextBase64 = arrayBufferToBase64(ciphertext);

            // Store as iv:ciphertext
            return `${ivBase64}:${ciphertextBase64}`;
        } catch (error) {
            log.error('EncryptionService: Error encrypting data:', error);
            return null;
        }
    }

    public async decrypt(encryptedData: string): Promise<string | null> {
        if (!this.encryptionKey) {
            log.warn('EncryptionService: Encryption key not initialized. Initializing now.');
            await this.initializeKey();
            if (!this.encryptionKey) {
                log.error('EncryptionService: Failed to initialize encryption key for decryption.');
                return null;
            }
        }

        if (!encryptedData || !encryptedData.includes(':')) {
            log.warn('EncryptionService: Invalid encrypted data format.');
            return null;
        }

        try {
            const parts = encryptedData.split(':');
            if (parts.length !== 2) {
                log.warn('EncryptionService: Malformed encrypted data string.');
                return null;
            }
            const iv = base64ToArrayBuffer(parts[0]);
            const ciphertext = base64ToArrayBuffer(parts[1]);

            const decryptedBuffer = await window.crypto.subtle.decrypt(
                {
                    name: AES_GCM_ALGORITHM,
                    iv: iv,
                },
                this.encryptionKey,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(decryptedBuffer);
        } catch (error) {
            log.error('EncryptionService: Error decrypting data. This could be due to a changed key or corrupted data.', error);
            // It's possible the key changed or data is corrupt.
            // Consider if automatic re-encryption or user notification is needed here.
            // For now, returning null indicates failure.
            return null;
        }
    }
}