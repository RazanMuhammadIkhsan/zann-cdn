import { google } from 'googleapis';
import { MongoClient } from 'mongodb';
import { decrypt } from '../_utils/crypto.js';

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
    const { id } = req.query;

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
        // Nama fungsi diubah dari advancedDecrypt menjadi decrypt
        const decryptedBuffer = decrypt(encryptedBuffer, fileRecord.password);

        res.setHeader('Content-Type', fileRecord.file_info.mime_type);
        res.setHeader('Content-Disposition', `inline; filename="${fileRecord.file_info.name}"`);
        res.send(decryptedBuffer);

    } catch (error) {
        console.error(error);
        res.status(500).send('Server error saat mengambil file.');
    }
}