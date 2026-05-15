const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());  // <-- ESSENCIAL para evitar bloqueio CORS

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.get('/', (req, res) => {
    res.send('IPTV Proxy está rodando! Use /m3u?url=... para listas e /video?url=... para streams.');
});

// Headers que imitam um navegador Chrome
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
            timeout: 15000,
            headers: browserHeaders,
        });

        console.log('Resposta do servidor:', response.status);
        console.log('Content-Type:', response.headers['content-type']);
        console.log('Tamanho da resposta:', response.data.length);

        // Verifica se é HTML (provável erro do servidor)
        if (response.data.trim().startsWith('<')) {
            console.error('Servidor retornou HTML em vez de M3U.');
            return res.status(502).send('Erro: o servidor da lista retornou uma página de erro (possível bloqueio).');
        }

        const proxyBase = `${req.protocol}://${req.get('host')}`;
        const modified = rewriteM3U(response.data, proxyBase);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(modified);
    } catch (error) {
        console.error('Erro ao buscar lista:', error.message);
        res.status(502).send('Erro ao buscar a lista M3U');
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
