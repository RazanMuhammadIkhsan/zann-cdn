import axios from 'axios';

export default async function handler(req, res) {
    const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
    const GITHUB_REPO = process.env.GITHUB_REPO;
    
    const filePath = req.url;
    
    const targetUrl = `https://cdn.jsdelivr.net/gh/${GITHUB_USERNAME}/${GITHUB_REPO}@main${filePath}`;

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream'
        });

        res.writeHead(response.status, response.headers);
        response.data.pipe(res);

    } catch (error) {
        res.status(error.response ? error.response.status : 500).send(error.message);
    }
}