const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

// Função para substituir URLs HTTP pelas nossas URLs proxy
function rewriteM3U(originalText, proxyBaseUrl) {
    const lines = originalText.split('\n');
    const newLines = [];
    for (let line of lines) {
        if (line.trim() && !line.startsWith('#')) {
            // É uma URL de vídeo (HTTP/HTTPS) -> substituir
            const encodedUrl = encodeURIComponent(line.trim());
            const proxyUrl = `${proxyBaseUrl}/video?url=${encodedUrl}`;
            newLines.push(proxyUrl);
        } else {
            newLines.push(line);
        }
    }
    return newLines.join('\n');
}

// Rota para buscar a lista M3U e devolver com URLs alteradas
app.get('/m3u', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Faltando parâmetro "url"');

    try {
        const response = await axios.get(targetUrl, { responseType: 'text', timeout: 15000 });
        const proxyBase = `${req.protocol}://${req.get('host')}`;
        const modified = rewriteM3U(response.data, proxyBase);
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(modified);
    } catch (error) {
        console.error('Erro ao buscar lista:', error.message);
        res.status(500).send('Erro ao buscar lista M3U');
    }
});

// Rota para fazer proxy dos vídeos (streaming)
app.get('/video', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Faltando parâmetro "url"');

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });

        // Copiar headers relevantes
        if (response.headers['content-type']) {
            res.set('Content-Type', response.headers['content-type']);
        }
        if (response.headers['content-length']) {
            res.set('Content-Length', response.headers['content-length']);
        }

        // Pipe do stream de vídeo para a resposta
        response.data.pipe(res);

        // Tratar erro no stream
        response.data.on('error', (err) => {
            console.error('Erro no stream:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Erro no stream');
            }
        });
    } catch (error) {
        console.error('Erro ao reproduzir vídeo:', error.message);
        if (!res.headersSent) {
            res.status(500).send('Erro ao acessar vídeo');
        }
    }
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Proxy rodando na porta ${PORT}`);
});