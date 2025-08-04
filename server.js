import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Fungsi Enkripsi (sebelumnya di crypto.js)
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16, SALT_LENGTH = 64, TAG_LENGTH = 16, KEY_LENGTH = 32, PBKDF2_ITERATIONS = 100000;
function encrypt(buffer, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt, iv, tag, encrypted]);
}
function decrypt(encryptedBuffer, password) {
    const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
    const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
function generateSecurePassword() { return crypto.randomBytes(24).toString('base64url'); }


// Inisialisasi Server Express
const app = express();
const PORT = process.env.PORT || 3000;

// Konfigurasi Multer dengan batas 50MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// Cache koneksi MongoDB
let cachedDb = null;
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("Uploader");
    cachedDb = db;
    return db;
}

// Sajikan folder public (untuk index.html)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, 'public')));


// Endpoint Upload
app.post('/api/upload', upload.single('files'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'File tidak ditemukan.' });

        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth });
        
        const password = generateSecurePassword();
        const encryptedBuffer = encrypt(req.file.buffer, password);
        const fakeName = `${uuidv4()}.dat`;

        const { data: driveFile } = await drive.files.create({
            media: { mimeType: 'application/octet-stream', body: Buffer.from(encryptedBuffer) },
            requestBody: { name: fakeName, parents: [process.env.GOOGLE_FOLDER_ID] }
        });

        const db = await connectToDatabase();
        const collection = db.collection("files");
        const fileRecord = {
            _id: uuidv4(),
            drive_id: driveFile.id,
            password: password,
            file_info: { name: req.file.originalname, mime_type: req.file.mimetype, size: req.file.size },
            uploaded_at: new Date()
        };
        await collection.insertOne(fileRecord);
        res.status(200).json({ success: true, id: fileRecord._id, url: `/api/file/${fileRecord._id}` });
    } catch (error) {
        console.error(error);
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, error: 'File terlalu besar. Maksimal 50 MB.' });
        }
        res.status(500).json({ success: false, error: 'Terjadi kesalahan di server.' });
    }
});


// Endpoint Download
app.get('/api/file/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const db = await connectToDatabase();
        const collection = db.collection("files");
        const fileRecord = await collection.findOne({ _id: id });
        if (!fileRecord) return res.status(404).send('File not found');

        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth });

        const driveResponse = await drive.files.get({ fileId: fileRecord.drive_id, alt: 'media' }, { responseType: 'arraybuffer' });
        const encryptedBuffer = Buffer.from(driveResponse.data);
        const decryptedBuffer = decrypt(encryptedBuffer, fileRecord.password);

        res.setHeader('Content-Type', fileRecord.file_info.mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${fileRecord.file_info.name}"`);
        res.send(decryptedBuffer);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error saat mengambil file.');
    }
});


// Jalankan server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server berjalan di port ${PORT}`);
});