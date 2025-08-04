import { google } from 'googleapis';

export default async function handler(req, res) {
    try {
        const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const drive = google.drive({ version: 'v3', auth });

        const about = await drive.about.get({ fields: 'storageQuota' });
        const quota = about.data.storageQuota;
        
        const used = parseInt(quota.usage, 10);
        const total = parseInt(quota.limit, 10);

        res.status(200).json({
            used: used,
            total: total,
            free: total - used
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Gagal memeriksa kuota.' });
    }
}