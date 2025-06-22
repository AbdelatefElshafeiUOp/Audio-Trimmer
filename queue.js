require('dotenv').config();
const { Queue } = require('bullmq');

const queueName = 'video-processing';

const connection = process.env.REDIS_URL || {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
};
// Export a single queue instance that can be used by both the server and worker
const videoQueue = new Queue(queueName, { connection, 
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    },
 });

module.exports = { videoQueue, connection, queueName };