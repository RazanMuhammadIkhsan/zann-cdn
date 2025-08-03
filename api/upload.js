import multer from 'multer';
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';

// Helper untuk menjalankan multer di lingkungan serverless
const runMiddleware = (req, res, fn) => {
    return new Promise((resolve, reject) => {
        fn(req, res, (result) => {
            if (result instanceof Error) {
                return reject(result);
            }
            return resolve(result);
        });
    });
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 } // Limit 20 MB
});

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Jalankan middleware multer
        await runMiddleware(req, res, upload.single('file'));
        
        if (!req.file) {
            return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
        }

        const { buffer, originalname } = req.file;

        const githubToken = process.env.GITHUB_TOKEN;
        const githubUsername = process.env.GITHUB_USERNAME;
        const githubRepo = process.env.GITHUB_REPO;
        const customDomain = process.env.CUSTOM_DOMAIN;

        const fileExtension = path.extname(originalname);
        const randomName = crypto.randomBytes(16).toString('hex');
        const fileName = randomName + fileExtension;
        const filePath = `media/${fileName}`;

        const url = `https://api.github.com/repos/${githubUsername}/${githubRepo}/contents/${filePath}`;
        const config = { headers: { 'Authorization': `token ${githubToken}` } };
        const data = { message: `Add: ${fileName}`, content: buffer.toString('base64') };
        
        await axios.put(url, data, config);

        const cdnUrl = `https://cdn.jsdelivr.net/gh/${githubUsername}/${githubRepo}@main/${filePath}`;
        const customDomainUrl = customDomain ? `https://${customDomain}/${filePath}` : null;

        res.status(200).json({ cdnUrl, customDomainUrl });

    } catch (error) {
        res.status(500).json({ error: 'Terjadi kesalahan di server.', details: error.message });
    }
}

export const config = {
    api: {
        bodyParser: false,
    },
};