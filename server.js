const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware manual de CORS (funciona até em erros 502)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Log simples
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Rota raiz
app.get('/', (req, res) => {
    res.send('IPTV Proxy está rodando! Use /m3u?url=... para listas e /video?url=... para streams.');
});

// Headers que imitam navegador
const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Connection': 'keep-alive',
    'Referer': 'http://pvsrvs.xyz/',
    'Origin': 'http://pvsrvs.xyz',
};

function rewriteM3U(originalText, proxyBaseUrl) {
    const lines = originalText.split('\n');
    const newLines = [];
    for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
            const encodedUrl = encodeURIComponent(trimmed);
            newLines.push(`${proxyBaseUrl}/video?url=${encodedUrl}`);
        } else {
            newLines.push(line);
        }
    }
    return newLines.join('\n');
}

app.get('/m3u', async (req, res) => {
    const targetUrl = req.query.url;
    console.log('Requisição /m3u recebida com url:', targetUrl);
    if (!targetUrl) {
        return res.status(400).send('Parâmetro "url" é obrigatório');
    }

    try {
        const response = await axios.get(targetUrl, {
            responseType: 'text',
            timeout: 20000, // aumentado para 20s
            headers: browserHeaders,
        });

        console.log('Resposta do servidor:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        console.log('Tamanho da resposta:', response.data.length);

        // Se for HTML, retornamos erro amigável
        if (response.data.trim().startsWith('<')) {
            console.error('Servidor retornou HTML.');
            return res.status(502).json({ error: 'Servidor da lista retornou HTML' });
        }

        const proxyBase = `${req.protocol}://${req.get('host')}`;
        const modified = rewriteM3U(response.data, proxyBase);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(modified);
    } catch (error) {
        console.error('Erro ao buscar lista:', error.message);
        // Retornamos um JSON com erro para o frontend interpretar
        res.status(502).json({ error: 'Falha ao obter a lista', details: error.message });
    }
});

app.get('/video', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send('Parâmetro "url" é obrigatório');
    }

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: browserHeaders,
        });

        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }

        response.data.pipe(res);

        response.data.on('error', (err) => {
            console.error('Erro no stream:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Erro no stream');
            }
        });
    } catch (error) {
        console.error('Erro ao reproduzir vídeo:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Erro ao acessar o vídeo');
        }
    }
});

app.listen(PORT, () => {
    console.log(`Proxy rodando na porta ${PORT}`);
});
