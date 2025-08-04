import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { advancedEncrypt, generateSecurePassword } from './_utils/crypto.js';
import stream from 'stream';
import multer from 'multer';

// Helper untuk menjalankan middleware di Vercel
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) return reject(result);
            return resolve(result);
        });
    });
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB
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

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        await runMiddleware(req, res, upload.single('files'));
        if (!req.file) return res.status(400).json({ success: false, error: 'File tidak ditemukan.' });

        // Inisialisasi Google Drive
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth });
        
        // Enkripsi File
        const password = generateSecurePassword();
        const encryptedBuffer = advancedEncrypt(req.file.buffer, password);
        const fakeName = `${uuidv4()}.tmp`;

        // Upload ke Google Drive
        const bufferStream = new stream.PassThrough();
        bufferStream.end(encryptedBuffer);
        
        const { data: driveFile } = await drive.files.create({
            media: { mimeType: 'application/octet-stream', body: bufferStream },
            requestBody: { name: fakeName, parents: [process.env.GOOGLE_FOLDER_ID] }
        });

        // Simpan metadata ke MongoDB
        const db = await connectToDatabase();
        const collection = db.collection("files");
        
        const fileRecord = {
            _id: uuidv4(),
            drive_id: driveFile.id,
            password: password,
            file_info: {
                name: req.file.originalname,
                mime_type: req.file.mimetype,
                size: req.file.size
            },
            uploaded_at: new Date()
        };
        await collection.insertOne(fileRecord);

        res.status(200).json({ success: true, id: fileRecord._id, url: `/api/file/${fileRecord._id}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Terjadi kesalahan di server.' });
    }
}

export const config = { api: { bodyParser: false } };