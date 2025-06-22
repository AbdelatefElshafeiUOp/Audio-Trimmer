require('dotenv').config();
const { Worker } = require('bullmq');
const path = require('path');
const fsPromises = require('fs').promises;
const { v4: uuidv4 } = require('uuid');

const trimAudio = require('./utils/trimAudio');
const createImage = require('./utils/createImage');
const createVideo = require('./utils/createVideo');
const concatenateVideos = require('./utils/concatenateVideos');
const { queueName, connection } = require('./queue');

const CACHE_FILE = process.env.CACHE_FILE || 'videoCache.json';
let videoCache = {};
const loadCache = async () => { try { const data = await fsPromises.readFile(CACHE_FILE, 'utf8'); videoCache = JSON.parse(data); console.log(`Cache loaded. Entries: ${Object.keys(videoCache).length}`); } catch (error) { if (error.code === 'ENOENT') { console.log(`Cache file not found. Starting empty.`); } else { console.error(`Error loading cache:`, error); } videoCache = {}; }};
const saveCache = async () => { try { await fsPromises.writeFile(CACHE_FILE, JSON.stringify(videoCache, null, 2), 'utf8'); console.log(`Cache saved.`); } catch (error) { console.error(`Error saving cache:`, error); }};
loadCache();

const processor = async (job) => {
    const { audioPath, baseTextData, parsedSegments, uniqueId } = job.data;
    console.log(`[Job ${job.id}] Starting video creation for uniqueId: ${uniqueId}`);

    // This check is crucial. If bad data gets in, fail fast.
    if (!audioPath || !uniqueId) {
        throw new Error('Job data is missing required fields: audioPath or uniqueId.');
    }

    const filesToClean = [];
    
    try {
        const intermediateVideoPaths = [];
        for (let i = 0; i < parsedSegments.length; i++) {
            const segment = parsedSegments[i];
            await job.updateProgress((i / parsedSegments.length) * 90);
            console.log(`[Job ${job.id}] --- Processing Segment ${i + 1}/${parsedSegments.length} ---`);

            const segmentId = `${uuidv4()}-seg${i}`;
            const trimmedAudioPath = path.join('uploads', `trimmed-${segmentId}.mp3`);
            const imagePath = path.join('uploads', `image-${segmentId}.png`);
            const intermediateVideoPath = path.join('uploads', `intermediate-${segmentId}.mp4`);
            filesToClean.push(trimmedAudioPath, imagePath, intermediateVideoPath);

            const segmentTextData = { ...baseTextData, extraText: segment.extraText };

            await trimAudio(audioPath, parseFloat(segment.startTime), parseFloat(segment.endTime), trimmedAudioPath);
            await createImage(segmentTextData, imagePath);
            await createVideo(trimmedAudioPath, imagePath, intermediateVideoPath);
            intermediateVideoPaths.push(intermediateVideoPath);
        }

        console.log(`[Job ${job.id}] --- Concatenating video clips... ---`);
        await job.updateProgress(95);
        const finalVideoFilename = `video-${uniqueId}.mp4`;
        const finalVideoPath = path.join('uploads', finalVideoFilename);
        await concatenateVideos(intermediateVideoPaths, finalVideoPath);

        const videoUrl = `/${finalVideoFilename}`;
        
        videoCache[uniqueId] = videoUrl;
        await saveCache();
        
        await job.updateProgress(100);
        return videoUrl;

    } catch (err) {
        console.error(`[Job ${job.id}] Video creation process FAILED:`, err);
        throw err;
    } finally {
        console.log(`[Job ${job.id}] Cleaning up all generated files...`);
        // The worker is now responsible for cleaning up the main audio file too.
        if (audioPath) {
            filesToClean.push(audioPath);
        }
        await Promise.all(filesToClean.map(file => fsPromises.unlink(file).catch(e => console.warn(`[Job ${job.id}] Failed to clean ${file}: ${e.message}`))));
        console.log(`[Job ${job.id}] Cleanup complete.`);
    }
};

const worker = new Worker(queueName, processor, {
    connection,
    concurrency: 5,
    limiter: { max: 100, duration: 30000 },
});

console.log('Worker is listening for jobs...');

worker.on('completed', (job, result) => {
  console.log(`[Job ${job.id}] COMPLETED. Final video URL: ${result}`);
});

worker.on('failed', (job, err) => {
  console.error(`[Job ${job.id}] FAILED with error: ${err.message}`);
});