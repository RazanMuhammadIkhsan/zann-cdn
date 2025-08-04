import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12; // Sesuai standar GCM
const TAG_LENGTH = 16;   // Sesuai standar GCM
const KEY_LENGTH = 32;   // untuk AES-256
const PADDING_FACTOR = 3;

// Header ZIP palsu untuk steganografi
const FAKE_ZIP_HEADERS = Buffer.from([
    0x50, 0x4B, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x21, 0x0C, 0x4B, 0x50, 0x28, 0xB5, 0x2F, 0xFD, 0x87, 0x00,
    0x00, 0x00, 0x75, 0x00, 0x00, 0x00, 0x08, 0x00, 0x1C, 0x00,
]);
const EXTRA_NOISE_LENGTH = 1024;

export function advancedEncrypt(data, password) {
    // Buat key dari password menggunakan hash SHA-256
    const key = crypto.createHash('sha256').update(password).digest();
    
    // Buat nonce (nomor acak) yang unik untuk setiap enkripsi
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    
    // Enkripsi data
    const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Steganografi: samarkan file dengan padding dan header palsu
    const paddingSize = encrypted.length * PADDING_FACTOR;
    const padding = crypto.randomBytes(paddingSize);
    const extraNoise = crypto.randomBytes(EXTRA_NOISE_LENGTH);
    
    // Gabungkan semuanya: Header palsu + padding + nonce + tag + data terenkripsi + noise tambahan
    return Buffer.concat([FAKE_ZIP_HEADERS, padding, nonce, tag, encrypted, extraNoise]);
}

export function advancedDecrypt(data, password) {
    const key = crypto.createHash('sha256').update(password).digest();

    // Ekstrak komponen dari data yang disamarkan
    const originalEncryptedLength = Math.floor((data.length - FAKE_ZIP_HEADERS.length - EXTRA_NOISE_LENGTH) / (PADDING_FACTOR + 1));
    const paddingSize = originalEncryptedLength * PADDING_FACTOR;
    
    const startOfEncryptedData = FAKE_ZIP_HEADERS.length + paddingSize;
    
    const nonce = data.subarray(startOfEncryptedData, startOfEncryptedData + NONCE_LENGTH);
    const tag = data.subarray(startOfEncryptedData + NONCE_LENGTH, startOfEncryptedData + NONCE_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(startOfEncryptedData + NONCE_LENGTH + TAG_LENGTH, data.length - EXTRA_NOISE_LENGTH);

    // Dekripsi data
    const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

export function generateSecurePassword() {
    return crypto.randomBytes(24).toString('base64url');
}