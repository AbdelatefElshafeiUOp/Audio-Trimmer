require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const crypto = require('crypto');
const axios = require('axios');
const { videoQueue } = require('./queue');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';
const CACHE_FILE = process.env.CACHE_FILE || 'videoCache.json';

let videoCache = {};
const loadCache = async () => { try { const data = await fsPromises.readFile(CACHE_FILE, 'utf8'); videoCache = JSON.parse(data); console.log(`Cache loaded. Entries: ${Object.keys(videoCache).length}`); } catch (error) { if (error.code === 'ENOENT') { console.log(`Cache file not found. Starting empty.`); } else { console.error(`Error loading cache:`, error); } videoCache = {}; }};

const initializeApp = async () => {
    const dirs = [process.env.UPLOAD_DIR || './uploads', process.env.PUBLIC_DIR || './public'];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) { await fsPromises.mkdir(dir, { recursive: true }); }
    }
    await loadCache();
};
initializeApp().catch(console.error);

app.use(express.static(process.env.PUBLIC_DIR || 'public'));
app.use(express.static(process.env.UPLOAD_DIR || 'uploads'));

const storage = multer.diskStorage({
    destination: process.env.UPLOAD_DIR || './uploads/',
    filename: (_, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage });

// #############################################################
// ###       FULL HELPER FUNCTIONS ARE NOW INCLUDED          ###
// #############################################################
const downloadAudio = async (audioUrl) => {
    console.log(`Downloading from URL: ${audioUrl}`);
    const fileId = uuidv4();
    const urlExt = path.extname(new URL(audioUrl).pathname);
    const localFilePath = path.join(process.env.UPLOAD_DIR || 'uploads', `${fileId}${urlExt || '.mp3'}`);
    const response = await axios({ method: 'get', url: audioUrl, responseType: 'stream' });
    const writer = fs.createWriteStream(localFilePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', () => resolve(localFilePath));
        writer.on('error', reject);
    });
};

const generateUniqueId = async (audioFilePath, baseTextData, timeSegments) => {
    const hash = crypto.createHash('sha256');
    const inputString = JSON.stringify({ baseTextData, timeSegments });
    hash.update(inputString);
    const audioBuffer = await fsPromises.readFile(audioFilePath);
    hash.update(audioBuffer);
    return hash.digest('hex');
};

// #############################################################
// ###                THE API ENDPOINTS                      ###
// #############################################################

app.post('/create-video', (req, res) => {
    upload.single('audio')(req, res, async (err) => {
        if (err) return res.status(400).json({ error: 'File upload failed', details: err.message });

        let audioPath = req.file ? req.file.path : null;
        let isTempFile = !!audioPath; // Flag to know if we need to clean up on failure
        const { audioUrl, seriesTitle, mainTitle, speaker, timeSegments } = req.body;

        try {
            if (!audioPath && !audioUrl) return res.status(400).json({ error: 'No audio provided.' });
            if (!seriesTitle || !mainTitle || !speaker || !timeSegments) return res.status(400).json({ error: 'Missing required fields.' });
            const parsedSegments = JSON.parse(timeSegments);

            if (audioUrl && !audioPath) {
                audioPath = await downloadAudio(audioUrl);
                isTempFile = true;
            }
            
            const baseTextData = { seriesTitle, mainTitle, speaker };
            const uniqueId = await generateUniqueId(audioPath, baseTextData, parsedSegments);
            
            if (videoCache[uniqueId]) {
                const cachedVideoUrl = videoCache[uniqueId];
                try {
                    await fsPromises.access(path.join(__dirname, 'uploads', path.basename(cachedVideoUrl)));
                    console.log(`Cache hit! Returning cached video immediately: ${cachedVideoUrl}`);
                    if (isTempFile) await fsPromises.unlink(audioPath).catch(() => {});
                    return res.json({ success: true, videoUrl: cachedVideoUrl, cached: true });
                } catch {
                     console.warn(`Cached file ${cachedVideoUrl} not found. Regenerating.`);
                     delete videoCache[uniqueId];
                }
            }

            const jobData = { audioPath, baseTextData, parsedSegments, uniqueId };
            const job = await videoQueue.add('process-video', jobData);

            console.log(`Job ${job.id} added to the queue for uniqueId: ${uniqueId}`);

            res.status(202).json({
                success: true,
                message: 'Video processing started.',
                jobId: job.id,
            });

        } catch (error) {
            // If we created a temp file and failed to create a job, clean it up.
            if (isTempFile && audioPath) {
                await fsPromises.unlink(audioPath).catch(e => console.warn(`Failed to clean up temp audio on error: ${e.message}`));
            }
            console.error('Error in /create-video endpoint:', error);
            res.status(500).json({ success: false, error: 'Failed to start video processing job.' });
        }
    });
});

app.get('/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const job = await videoQueue.getJob(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found.' });
    }

    const state = await job.getState();
    const progress = job.progress;
    const returnValue = job.returnvalue;
    const failedReason = job.failedReason;

    res.json({ jobId, state, progress, result: returnValue, error: failedReason });
});

app.listen(PORT, HOST, () => console.log(`Server (Producer) started on http://localhost:${PORT}`));