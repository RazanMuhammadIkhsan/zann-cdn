// Menggunakan 'import' sebagai ganti 'require'
import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import axios from 'axios';
import path from 'path';
import crypto from 'crypto';
// Import helper dari 'url' untuk path yang benar
import { fileURLToPath } from 'url';

const app = express();
const port = 3000;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});

// ===================================================================
// --- PERBAIKAN PATH UNTUK SEMUA SISTEM OPERASI (TERMASUK WINDOWS) ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ===================================================================

// Sekarang Express akan tahu di mana letak folder 'public'
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Tidak ada file yang diunggah.' });
    }

    const { buffer, originalname } = req.file;

    const MAX_FILE_SIZE_MB = 20;
    if (buffer.length > MAX_FILE_SIZE_MB * 1024 * 1024) {
        return res.status(413).json({ error: `Ukuran file melebihi batas ${MAX_FILE_SIZE_MB} MB.` });
    }
    
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
    const data = { message: `Menambahkan file: ${fileName}`, content: buffer.toString('base64') };

    try {
        await axios.put(url, data, config);
        const cdnUrl = `https://cdn.jsdelivr.net/gh/${githubUsername}/${githubRepo}@main/${filePath}`;
        const customDomainUrl = customDomain ? `https://${customDomain}/${filePath}` : null;

        res.status(200).json({ cdnUrl, customDomainUrl });
    } catch (error) {
        res.status(500).json({ error: 'Gagal mengunggah ke GitHub.' });
    }
});

app.listen(port, () => {
    console.log(`Server lokal berjalan di http://localhost:${port}`);
});